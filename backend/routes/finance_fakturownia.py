"""Finanse: integracja z Fakturownia (sync, cron, payment-discrepancy, test).

Wydzielone z routes/finance.py (iter95be split). Endpointy:
- POST /finance/sync-fakturownia-unpaid
- GET  /finance/payment-discrepancy
- GET  /finance/discrepancy-details
- POST /finance/sync-from-fakturownia
- POST /finance/test-fakturownia

Plus cron job `cron_fakturownia_sync` re-exportowany przez routes.finance.
"""
import logging
import uuid
import calendar
import httpx
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from datetime import datetime
from typing import Optional, List

from database import db
from auth import get_current_admin
from audit_log import log_audit

router = APIRouter()
logger = logging.getLogger(__name__)

# ============= FAKTUROWNIA: Pobranie faktur kosztowych z pozycjami =============
def _iter_months(y1: int, m1: int, y2: int, m2: int):
    """Generator par (year, month) od (y1, m1) do (y2, m2) wlacznie."""
    y, m = y1, m1
    while (y, m) <= (y2, m2):
        yield (y, m)
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1


async def _record_fakturownia_sync_error(msg: str):
    """Zapisuje informacje o nieudanym sync w finance_settings."""
    try:
        await db.finance_settings.update_one(
            {"id": "main"},
            {"$set": {"last_fakturownia_sync_at": datetime.now().isoformat(),
                       "last_fakturownia_sync_status": "error",
                       "last_fakturownia_sync_error": msg}},
        )
    except Exception:
        logger.exception("[fakturownia] nie udalo sie zapisac stanu bledu")


async def _build_kontrahent_kod_map() -> dict:
    """iter96: Mapa znormalizowany kontrahent -> (kod_id, kod_category) na podstawie
    najczesciej uzywanego kodu w skategoryzowanych fakturach KOSZTOWYCH.
    Uzywana przy imporcie z Fakturowni do auto-przypisania kategorii nowym fakturom."""
    invs = await db.finance_invoices.find(
        {"kod_id": {"$nin": [None, ""]}, "is_income": {"$ne": True}},
        {"_id": 0, "kontrahent": 1, "kod_id": 1, "kod_category": 1},
    ).to_list(length=None)
    counter: dict = {}
    for i in invs:
        k = (i.get("kontrahent") or "").strip().lower()
        if not k:
            continue
        key = (i["kod_id"], i.get("kod_category") or "")
        counter.setdefault(k, {})
        counter[k][key] = counter[k].get(key, 0) + 1
    return {k: max(v.items(), key=lambda x: x[1])[0] for k, v in counter.items()}


async def _do_fakturownia_sync(year: int, month: int, user_id: str = "cron_system",
                                 skip_removal: bool = False) -> dict:
    """Logika pobierania faktur z Fakturowni - wywolywalna z endpointu i crona.
    skip_removal=True - nie usuwaj pozycji ktorych brak w Fakturowni (uzywane w range mode,
    gdzie globalny cleanup robimy raz na koncu, by uniknac usuwania pozycji z sell_date w innym
    miesiacu niz aktualnie pobierany).
    """
    settings = await db.finance_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    api_token = settings.get("fakturownia_api_key")
    domain = settings.get("fakturownia_domain")
    if not api_token or not domain:
        raise HTTPException(
            status_code=400,
            detail="Brak konfiguracji Fakturowni. Ustaw klucz API i subdomene w Narzedziach.",
        )
    yr, mo = year, month
    date_from = f"{yr:04d}-{mo:02d}-01"
    # iter95dr: poprawne obliczenie ostatniego dnia miesiaca (uwzglednia lata przestepne).
    # Wczesniej hardcoded 29 dla lutego powodowal puste odpowiedzi w lata nieprzestepne (np. 2026).
    last_day = calendar.monthrange(yr, mo)[1]
    date_to = f"{yr:04d}-{mo:02d}-{last_day:02d}"

    base_url = f"https://{domain}.fakturownia.pl/invoices.json"
    all_invoices: list = []
    # Pobieramy dwa zbiory: faktury KOSZTOWE (income=no) i SPRZEDAZOWE (income=yes)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for income_mode in ("no", "yes"):
                page = 1
                while True:
                    params = {
                        "api_token": api_token,
                        "income": income_mode,
                        "include_positions": "true",
                        "period": "more",
                        "date_from": date_from,
                        "date_to": date_to,
                        "page": str(page),
                        "per_page": "100",
                    }
                    resp = await client.get(base_url, params=params)
                    if resp.status_code == 401:
                        await _record_fakturownia_sync_error("Nieprawidlowy klucz API")
                        raise HTTPException(status_code=400, detail="Fakturownia: nieprawidlowy klucz API")
                    if resp.status_code == 404:
                        await _record_fakturownia_sync_error(f"Subdomena '{domain}' nie istnieje")
                        raise HTTPException(status_code=400, detail=f"Fakturownia: subdomena '{domain}' nie istnieje")
                    resp.raise_for_status()
                    data = resp.json()
                    page_invoices = data if isinstance(data, list) else data.get("invoices", [])
                    if not page_invoices:
                        break
                    # Oznacz typ faktury dla pozniejszego processingu
                    for inv in page_invoices:
                        inv["_income_type"] = income_mode  # "yes" = sprzedazowa, "no" = kosztowa
                    all_invoices.extend(page_invoices)
                    if len(page_invoices) < 100:
                        break
                    page += 1
                    if page > 50:
                        break
    except httpx.HTTPError as e:
        logger.error(f"[fakturownia] HTTP error: {e}")
        await _record_fakturownia_sync_error(f"Blad polaczenia: {type(e).__name__}")
        raise HTTPException(status_code=502, detail=f"Blad polaczenia z Fakturownia: {e}")

    # Pobierz istniejace wpisy fakturownia PO position_id GLOBALNIE (nie ograniczamy do roku/miesiaca,
    # bo sell_date faktury moze byc w innym miesiacu niz issue_date i przesuwac wpis miedzy miesiacami)
    existing = await db.finance_zapisy.find(
        {"source": "fakturownia"},
        {"_id": 0, "id": 1, "fakturownia_position_id": 1, "kod_id": 1, "budowa_id": 1, "notes": 1, "deleted_at": 1},
    ).to_list(length=None)
    existing_by_pos = {e.get("fakturownia_position_id"): e for e in existing if e.get("fakturownia_position_id")}

    # Naglowki faktur - mapa po fakturownia_invoice_id
    existing_invoices = await db.finance_invoices.find(
        {"source": "fakturownia"},
        {"_id": 0, "id": 1, "fakturownia_invoice_id": 1, "kod_id": 1, "budowa_id": 1, "notes": 1, "deleted_at": 1},
    ).to_list(length=None)
    existing_inv_by_fid = {e.get("fakturownia_invoice_id"): e for e in existing_invoices}

    # iter96: auto-kod dla faktur kosztowych po historii kontrahenta
    kontrahent_kod_map = await _build_kontrahent_kod_map()

    created = 0
    updated = 0
    skipped = 0
    invoices_created = 0
    invoices_updated = 0
    new_position_ids: set = set()
    new_invoice_fids: set = set()

    for inv in all_invoices:
        inv_id = inv.get("id")
        is_income = inv.get("_income_type") == "yes"  # sprzedazowa
        issue_date = inv.get("sell_date") or inv.get("issue_date") or inv.get("transaction_date")
        if not issue_date:
            issue_date = f"{yr:04d}-{mo:02d}-01"
        kontrahent = (inv.get("buyer_name") or inv.get("seller_name") or "").strip()
        nr_fakt = (inv.get("number") or "").strip()
        inv_netto = float(inv.get("price_net") or 0)
        inv_brutto = float(inv.get("price_gross") or 0)
        positions = inv.get("positions") or []

        try:
            d = datetime.strptime(issue_date, "%Y-%m-%d")
            iso_date = issue_date
            year_v, month_v = d.year, d.month
        except ValueError:
            iso_date = date_from
            year_v, month_v = yr, mo

        # Auto-kod: sprzedazowe -> PZS; kosztowe -> najczestszy kod tego kontrahenta (iter96)
        if is_income:
            auto_kod_id, auto_kod_category = "PZS", "PZS"
        else:
            auto_kod_id, auto_kod_category = kontrahent_kod_map.get(
                kontrahent.strip().lower(), (None, None))

        # Status platnosci - Fakturownia zwraca:
        #   status: "paid" / "new" / "sent" / "partial" / "overdue" / "cancelled"
        #   paid_date: "YYYY-MM-DD" (gdy oplacona); czasem brak pola
        #   paid_at: timestamp
        #   paid: kwota juz zaplacona (string, np. "1234.50") - dla partial platnosci
        # Wczesniej blednie szukalismy "payment_date" - takiego pola Fakturownia nie zwraca,
        # przez co WSZYSTKIE faktury mialy paid=False.
        status_val = (inv.get("status") or "").lower()
        paid_date_val = inv.get("paid_date") or inv.get("payment_date") or None
        if not paid_date_val and inv.get("paid_at"):
            paid_date_val = str(inv["paid_at"])[:10]
        # Kwota juz zaplacona (dla czesciowych platnosci). UWAGA: "paid" w API to AMOUNT,
        # nie boolean!
        paid_amount_val = float(inv.get("paid") or 0)
        # Status "paid" w Fakturowni = pelna zaplata. UWAGA: Fakturownia zwraca paid_date
        # rowniez dla faktur CZESCIOWO oplaconych (z status="partial"), wiec opieranie sie
        # na paid_date prowadziloby do bledu (faktura partial bylaby liczona jako oplacona).
        is_paid = status_val == "paid"

        # ==== UPSERT naglowek faktury ====
        new_invoice_fids.add(inv_id)
        existing_inv = existing_inv_by_fid.get(inv_id)
        if existing_inv:
            # iter95dv: jezeli faktura byla soft-deleted przez admina — NIE wskrzeszamy
            if existing_inv.get("deleted_at"):
                invoice_internal_id = existing_inv["id"]
                # Mimo to pamietajmy ID zeby pozycje sie nie tworzyly z parent_invoice_id = None
                # Ale skoro faktura jest usunieta, pozycje tez maja deleted_at (iter95dv) -> pomijamy
                continue
            inv_set = {
                "date": iso_date, "year": year_v, "month": month_v,
                "kontrahent": kontrahent,
                "netto": round(inv_netto, 2),
                "brutto": round(inv_brutto, 2),
                "nr_faktury": nr_fakt,
                "is_income": is_income,
                "payment_to": inv.get("payment_to") or None,
                "payment_date": paid_date_val,
                "paid": is_paid,
                "paid_amount": round(paid_amount_val, 2),
                "fakturownia_status": status_val or None,
                "updated_at": datetime.now().isoformat(),
                "updated_by": user_id,
            }
            # Jezeli faktura nie ma jeszcze kodu - ustaw auto-kod (PZS / kod kontrahenta)
            if auto_kod_id and not existing_inv.get("kod_id"):
                inv_set["kod_id"] = auto_kod_id
                inv_set["kod_category"] = auto_kod_category
            await db.finance_invoices.update_one(
                {"id": existing_inv["id"]}, {"$set": inv_set}
            )
            invoice_internal_id = existing_inv["id"]
            invoices_updated += 1
        else:
            invoice_internal_id = str(uuid.uuid4())
            inv_doc = {
                "id": invoice_internal_id,
                "date": iso_date, "year": year_v, "month": month_v,
                "kontrahent": kontrahent,
                "netto": round(inv_netto, 2),
                "brutto": round(inv_brutto, 2),
                "kod_id": auto_kod_id,
                "kod_category": auto_kod_category,
                "budowa_id": None,
                "nr_faktury": nr_fakt,
                "is_income": is_income,
                "payment_to": inv.get("payment_to") or None,
                "payment_date": paid_date_val,
                "paid": is_paid,
                "paid_amount": round(paid_amount_val, 2),
                "fakturownia_status": status_val or None,
                "notes": "",
                "source": "fakturownia",
                "fakturownia_invoice_id": inv_id,
                "created_at": datetime.now().isoformat(),
                "created_by": user_id,
            }
            await db.finance_invoices.insert_one(inv_doc)
            invoices_created += 1

        # ==== UPSERT pozycje ====
        if not positions:
            positions = [{
                "id": f"inv_{inv_id}_total",
                "name": "(brak pozycji - kwota laczna)",
                "total_price_net": inv_netto,
                "total_price_gross": inv_brutto,
            }]

        for pos_idx, pos in enumerate(positions):
            raw_id = pos.get("id")
            pos_id = str(raw_id) if raw_id else f"inv_{inv_id}_idx{pos_idx}"
            netto = float(pos.get("total_price_net") or pos.get("price_net") or 0)
            brutto = float(pos.get("total_price_gross") or pos.get("price_gross") or 0)
            name = (pos.get("name") or "").strip()
            new_position_ids.add(pos_id)
            if not netto and not brutto:
                skipped += 1
                continue
            existing_z = existing_by_pos.get(pos_id)

            if existing_z:
                # iter95dv: jezeli zapis byl soft-deleted przez admina — NIE wskrzeszamy go
                # (manualne usuniecie z UI to swiadoma decyzja, ponowny sync musi to respektowac)
                if existing_z.get("deleted_at"):
                    skipped += 1
                    continue
                set_doc = {
                    "date": iso_date, "year": year_v, "month": month_v,
                    "kontrahent": kontrahent, "netto": round(netto, 2),
                    "brutto": round(brutto, 2),
                    "nr_faktury": nr_fakt, "pozycja_nazwa": name,
                    "is_income": is_income,
                    "parent_invoice_id": invoice_internal_id,
                    "updated_at": datetime.now().isoformat(),
                    "updated_by": user_id,
                }
                # NOWA logika: pozycje NIE dostaja auto-kodu PZS - admin decyduje czy przypisac
                # do calej faktury (naglowek) czy per pozycja
                await db.finance_zapisy.update_one(
                    {"id": existing_z["id"]}, {"$set": set_doc},
                )
                updated += 1
            else:
                doc = {
                    "id": str(uuid.uuid4()),
                    "date": iso_date, "year": year_v, "month": month_v,
                    "kontrahent": kontrahent,
                    "netto": round(netto, 2), "brutto": round(brutto, 2),
                    "kod_id": None, "kod_category": None,
                    "budowa_id": None,
                    "nr_faktury": nr_fakt,
                    "pozycja_nazwa": name,
                    "is_income": is_income,
                    "notes": "",
                    "source": "fakturownia",
                    "fakturownia_invoice_id": inv_id,
                    "fakturownia_position_id": pos_id,
                    "parent_invoice_id": invoice_internal_id,
                    "created_at": datetime.now().isoformat(),
                    "created_by": user_id,
                }
                await db.finance_zapisy.insert_one(doc)
                created += 1

    # Usun pozycje ktorych juz NIE ma w Fakturowni TYLKO te bez przypisanego kod_id
    # ALE TYLKO w obrebie pobranego okresu (yr,mo) - inne miesiace zostawiamy.
    removed = 0
    if not skip_removal:
        for pos_id, ez in existing_by_pos.items():
            if pos_id in new_position_ids:
                continue
            if ez.get("kod_id"):
                continue
            # Sprawdz miesiac istniejacego wpisu - jezeli jest w naszym pobieranym okresie, mozemy usunac
            full = await db.finance_zapisy.find_one(
                {"id": ez["id"]}, {"_id": 0, "year": 1, "month": 1}
            )
            if full and full.get("year") == yr and full.get("month") == mo:
                await db.finance_zapisy.delete_one({"id": ez["id"]})
                removed += 1

    summary = {
        "year": yr, "month": mo,
        "invoices_fetched": len(all_invoices),
        "invoices_created": invoices_created,
        "invoices_updated": invoices_updated,
        "positions_created": created,
        "positions_updated": updated,
        "positions_removed": removed,
        "skipped_empty": skipped,
    }
    await db.finance_settings.update_one(
        {"id": "main"},
        {"$set": {"last_fakturownia_sync_at": datetime.now().isoformat(),
                   "last_fakturownia_sync_summary": summary,
                   "last_fakturownia_sync_status": "ok",
                   "last_fakturownia_sync_error": None},
         "$setOnInsert": {"id": "main"}},
        upsert=True,
    )
    return summary


# ============= GLOBAL UNPAID SYNC (bez filtra daty) =============
async def _do_fakturownia_unpaid_sync_global(user_id: str = "cron_system") -> dict:
    """Pobiera WSZYSTKIE niezaplacone faktury z Fakturowni (bez filtra daty)
    i upsertuje TYLKO naglowki do finance_invoices. Nie tworzy pozycji.

    Cel: zapewnic ze stare niezaplacone faktury (z poprzednich lat lub miesiecy
    przed wlaczeniem regularnego synca) pojawia sie w Payment Summary i Zapisy.

    Zachowuje admin assignment (kod_id, budowa_id) - tylko aktualizuje pola
    dotyczace platnosci.
    """
    settings = await db.finance_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    api_token = settings.get("fakturownia_api_key")
    domain = settings.get("fakturownia_domain")
    if not api_token or not domain:
        raise HTTPException(
            status_code=400,
            detail="Brak konfiguracji Fakturowni. Ustaw klucz API i subdomene w Narzedziach.",
        )

    base_url = f"https://{domain}.fakturownia.pl/invoices.json"
    all_invoices: list = []  # zawiera ZAROWNO paid jak i unpaid
    try:
        async with httpx.AsyncClient(timeout=30.0) as cli:
            for income_mode in ("no", "yes"):
                page = 1
                while True:
                    params = {
                        "api_token": api_token,
                        "income": income_mode,
                        "include_positions": "false",
                        "page": str(page),
                        "per_page": "100",
                    }
                    resp = await cli.get(base_url, params=params)
                    if resp.status_code == 401:
                        raise HTTPException(status_code=400, detail="Fakturownia: nieprawidlowy klucz API")
                    if resp.status_code != 200:
                        break
                    data = resp.json()
                    invs = data if isinstance(data, list) else data.get("invoices", [])
                    if not invs:
                        break
                    for inv in invs:
                        inv["_income_type"] = income_mode
                        all_invoices.append(inv)
                    if len(invs) < 100:
                        break
                    page += 1
                    if page > 100:
                        break
    except httpx.HTTPError as e:
        logger.error(f"[fakturownia_unpaid] HTTP error: {e}")
        raise HTTPException(status_code=502, detail=f"Blad polaczenia z Fakturownia: {e}")

    existing = await db.finance_invoices.find(
        {"source": "fakturownia"},
        {"_id": 0, "id": 1, "fakturownia_invoice_id": 1, "kod_id": 1, "budowa_id": 1},
    ).to_list(length=None)
    existing_by_fid = {e.get("fakturownia_invoice_id"): e for e in existing}

    # iter96: auto-kod dla faktur kosztowych po historii kontrahenta
    kontrahent_kod_map = await _build_kontrahent_kod_map()

    created = 0
    updated = 0
    marked_paid = 0  # ilosc faktur, ktore istnialy w bazie jako unpaid, ale w Fakturowni byly paid -> teraz zaktualizowane na paid

    def _parse_date(s: Optional[str]) -> Optional[tuple]:
        """Probuje ISO YYYY-MM-DD oraz DD.MM.YYYY. Zwraca (iso_string, year, month) lub None."""
        if not s:
            return None
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
            try:
                d = datetime.strptime(s, fmt)
                return (d.strftime("%Y-%m-%d"), d.year, d.month)
            except (ValueError, TypeError):
                continue
        return None

    for inv in all_invoices:
        inv_id = inv.get("id")
        is_income = inv.get("_income_type") == "yes"
        st = (inv.get("status") or "").lower()
        is_paid_in_fak = st == "paid" or bool(inv.get("paid_date"))
        # Spróbuj kolejno: issue_date (czesto ISO), sell_date (czesto DD.MM.YYYY), transaction_date
        parsed = (_parse_date(inv.get("issue_date"))
                  or _parse_date(inv.get("sell_date"))
                  or _parse_date(inv.get("transaction_date")))
        if not parsed:
            continue
        issue_date, year_v, month_v = parsed

        kontrahent = (inv.get("buyer_name") or inv.get("seller_name") or "").strip()
        nr_fakt = (inv.get("number") or "").strip()
        inv_netto = float(inv.get("price_net") or 0)
        inv_brutto = float(inv.get("price_gross") or 0)
        status_val = (inv.get("status") or "").lower()
        paid_amt_raw = float(inv.get("paid") or 0)
        # Jezeli faktura jest paid w Fakturowni, ale Fakturownia nie zwraca paid (np. paid przez paid_date) - uzyj brutto
        paid_amt = inv_brutto if is_paid_in_fak and paid_amt_raw < 0.01 else paid_amt_raw
        payment_date_iso = None
        if is_paid_in_fak:
            pd = _parse_date(inv.get("paid_date")) or parsed
            payment_date_iso = pd[0] if pd else issue_date

        existing_inv = existing_by_fid.get(inv_id)
        if existing_inv:
            update_doc = {
                "payment_to": inv.get("payment_to") or None,
                "paid": is_paid_in_fak,
                "paid_amount": round(paid_amt, 2),
                "payment_date": payment_date_iso,
                "fakturownia_status": status_val or None,
                "updated_at": datetime.now().isoformat(),
                "updated_by": user_id,
            }
            await db.finance_invoices.update_one(
                {"id": existing_inv["id"]},
                {"$set": update_doc}
            )
            updated += 1
            if is_paid_in_fak:
                marked_paid += 1
        else:
            # Pomijamy tworzenie wpisow dla zaplaconych faktur ktore nigdy nie byly w App
            # (chyba zeby unpaid - wtedy musimy je utworzyc by user wiedzial o dlugu)
            if is_paid_in_fak:
                continue
            # iter96: sprzedazowe -> PZS; kosztowe -> najczestszy kod tego kontrahenta
            if is_income:
                auto_kod_id, auto_kod_category = "PZS", "PZS"
            else:
                auto_kod_id, auto_kod_category = kontrahent_kod_map.get(
                    kontrahent.strip().lower(), (None, None))
            doc = {
                "id": str(uuid.uuid4()),
                "date": issue_date,
                "year": year_v, "month": month_v,
                "kontrahent": kontrahent,
                "netto": round(inv_netto, 2),
                "brutto": round(inv_brutto, 2),
                "kod_id": auto_kod_id,
                "kod_category": auto_kod_category,
                "budowa_id": None,
                "nr_faktury": nr_fakt,
                "is_income": is_income,
                "payment_to": inv.get("payment_to") or None,
                "payment_date": None,
                "paid": False,
                "paid_amount": round(paid_amt, 2),
                "fakturownia_status": status_val or None,
                "notes": "",
                "source": "fakturownia",
                "fakturownia_invoice_id": inv_id,
                "created_at": datetime.now().isoformat(),
                "created_by": user_id,
            }
            await db.finance_invoices.insert_one(doc)
            created += 1

    return {
        "fetched_total": len(all_invoices),
        "invoices_created": created,
        "invoices_updated": updated,
        "marked_paid": marked_paid,
    }


@router.post("/finance/sync-fakturownia-unpaid")
async def sync_fakturownia_unpaid(current_user: dict = Depends(get_current_admin)):
    """Manualny global sync wszystkich niezaplaconych faktur.
    Uzupelnia stare faktury ktore wypadly z zakresu regularnego synca."""
    return await _do_fakturownia_unpaid_sync_global(current_user["sub"])


# ============= PAYMENT DISCREPANCY (Fakturownia vs App) =============
@router.get("/finance/payment-discrepancy")
async def payment_discrepancy(
    year: Optional[int] = Query(None, description="Filtruj po roku (sell_date)"),
    _user: dict = Depends(get_current_admin),
):
    """Porownuje sume niezaplaconych faktur w App vs Fakturownia.
    Zwraca diff w PLN i flaga has_discrepancy.

    Zwraca zarowno brutto jak i netto - Fakturownia raporty domyslnie pokazuja netto.
    Z parametrem `year` ogranicza zakres do faktur o sell_date w danym roku."""
    # App side
    app_match = {"source": "fakturownia", "paid": {"$ne": True}}
    if year is not None:
        app_match["year"] = year
    pipe = [{"$match": app_match},
            {"$group": {"_id": "$is_income",
                         "brutto": {"$sum": {"$subtract": ["$brutto", {"$ifNull": ["$paid_amount", 0]}]}},
                         "netto": {"$sum": {"$cond": [
                             {"$gt": ["$brutto", 0]},
                             {"$multiply": [
                                 "$netto",
                                 {"$divide": [
                                     {"$subtract": ["$brutto", {"$ifNull": ["$paid_amount", 0]}]},
                                     "$brutto",
                                 ]},
                             ]},
                             "$netto",
                         ]}},
                         "count": {"$sum": 1}}}]
    app_payables_brutto = 0.0
    app_payables_netto = 0.0
    app_receivables_brutto = 0.0
    app_receivables_netto = 0.0
    app_payables_count = 0
    app_receivables_count = 0
    async for r in db.finance_invoices.aggregate(pipe):
        if r["_id"]:
            app_receivables_brutto = float(r["brutto"])
            app_receivables_netto = float(r["netto"])
            app_receivables_count = r["count"]
        else:
            app_payables_brutto = float(r["brutto"])
            app_payables_netto = float(r["netto"])
            app_payables_count = r["count"]

    # Fakturownia side
    settings = await db.finance_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    api_token = settings.get("fakturownia_api_key")
    domain = settings.get("fakturownia_domain")
    fak_payables_brutto = 0.0
    fak_payables_netto = 0.0
    fak_receivables_brutto = 0.0
    fak_receivables_netto = 0.0
    fak_payables_count = 0
    fak_receivables_count = 0
    fakturownia_ok = False

    if api_token and domain:
        try:
            # Z filtrem rok uzywamy date_from/date_to, bez - pobieramy wszystko
            extra_params = {}
            if year is not None:
                extra_params["date_from"] = f"{year:04d}-01-01"
                extra_params["date_to"] = f"{year:04d}-12-31"
                extra_params["period"] = "more"
            async with httpx.AsyncClient(timeout=30.0) as cli:
                for income_mode, is_inc in (("no", False), ("yes", True)):
                    page = 1
                    while True:
                        params = {"api_token": api_token,
                                  "income": income_mode,
                                  "page": str(page),
                                  "per_page": "100",
                                  "include_positions": "false",
                                  **extra_params}
                        resp = await cli.get(
                            f"https://{domain}.fakturownia.pl/invoices.json",
                            params=params,
                        )
                        if resp.status_code != 200:
                            break
                        invs = resp.json()
                        invs = invs if isinstance(invs, list) else invs.get("invoices", [])
                        if not invs:
                            break
                        for inv in invs:
                            st = (inv.get("status") or "").lower()
                            if st == "paid" or inv.get("paid_date"):
                                continue
                            pg = float(inv.get("price_gross") or 0)
                            pn = float(inv.get("price_net") or 0)
                            paid_amt = float(inv.get("paid") or 0)
                            # Korekty maja ujemny brutto - nie klampujemy do 0,
                            # zeby zgadzalo sie z raportem Fakturowni ktory odejmuje korekty.
                            remaining = pg - paid_amt
                            if is_inc:
                                fak_receivables_brutto += remaining
                                fak_receivables_netto += pn * (remaining / pg) if pg else 0
                                fak_receivables_count += 1
                            else:
                                fak_payables_brutto += remaining
                                fak_payables_netto += pn * (remaining / pg) if pg else 0
                                fak_payables_count += 1
                        if len(invs) < 100:
                            break
                        page += 1
                        if page > 100:
                            break
            fakturownia_ok = True
        except Exception as e:
            logger.warning(f"[payment_discrepancy] Fakturownia fetch failed: {e}")

    payables_diff_brutto = round(fak_payables_brutto - app_payables_brutto, 2)
    payables_diff_netto = round(fak_payables_netto - app_payables_netto, 2)
    receivables_diff_brutto = round(fak_receivables_brutto - app_receivables_brutto, 2)
    receivables_diff_netto = round(fak_receivables_netto - app_receivables_netto, 2)

    return {
        "year": year,
        "app": {
            "payables": {"brutto": round(app_payables_brutto, 2),
                          "netto": round(app_payables_netto, 2),
                          "count": app_payables_count},
            "receivables": {"brutto": round(app_receivables_brutto, 2),
                             "netto": round(app_receivables_netto, 2),
                             "count": app_receivables_count},
        },
        "fakturownia": {
            "available": fakturownia_ok,
            "payables": {"brutto": round(fak_payables_brutto, 2),
                          "netto": round(fak_payables_netto, 2),
                          "count": fak_payables_count},
            "receivables": {"brutto": round(fak_receivables_brutto, 2),
                             "netto": round(fak_receivables_netto, 2),
                             "count": fak_receivables_count},
        },
        "diff": {
            "payables_brutto": payables_diff_brutto,
            "payables_netto": payables_diff_netto,
            "receivables_brutto": receivables_diff_brutto,
            "receivables_netto": receivables_diff_netto,
            "payables_count": fak_payables_count - app_payables_count,
            "receivables_count": fak_receivables_count - app_receivables_count,
        },
        "has_discrepancy": fakturownia_ok and (
            abs(payables_diff_netto) > 1.0 or abs(receivables_diff_netto) > 1.0
        ),
    }


@router.get("/finance/discrepancy-details")
async def discrepancy_details(
    year: Optional[int] = Query(None),
    _user: dict = Depends(get_current_admin),
):
    """Zwraca konkretne faktury powodujace rozbieznosc App vs Fakturownia."""
    def fmt_pln(v):
        try:
            return f"{float(v):,.2f}".replace(",", " ").replace(".", ",") + " zł"
        except (ValueError, TypeError):
            return "0,00 zł"

    settings = await db.finance_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    api_token = settings.get("fakturownia_api_key")
    domain = settings.get("fakturownia_domain")
    if not api_token or not domain:
        raise HTTPException(400, "Brak konfiguracji Fakturownia (uzupelnij w Ustawieniach)")

    # === Pobierz wszystkie faktury z Fakturowni ===
    fak_by_num: dict = {}  # number -> dict
    extra_params = {}
    if year is not None:
        extra_params["date_from"] = f"{year:04d}-01-01"
        extra_params["date_to"] = f"{year:04d}-12-31"
        extra_params["period"] = "more"

    try:
        async with httpx.AsyncClient(timeout=30.0) as cli:
            for income_mode, is_inc in (("no", False), ("yes", True)):
                page = 1
                while True:
                    params = {"api_token": api_token, "income": income_mode,
                              "page": str(page), "per_page": "100",
                              "include_positions": "false", **extra_params}
                    resp = await cli.get(f"https://{domain}.fakturownia.pl/invoices.json", params=params)
                    if resp.status_code != 200:
                        break
                    invs = resp.json()
                    invs = invs if isinstance(invs, list) else invs.get("invoices", [])
                    if not invs:
                        break
                    for inv in invs:
                        num = inv.get("number") or ""
                        if not num:
                            continue
                        pg = float(inv.get("price_gross") or 0)
                        pn = float(inv.get("price_net") or 0)
                        paid_amt = float(inv.get("paid") or 0)
                        st = (inv.get("status") or "").lower()
                        is_paid = st == "paid" or bool(inv.get("paid_date"))
                        fak_by_num[num] = {
                            "number": num,
                            "fakturownia_invoice_id": inv.get("id"),
                            "buyer_name": inv.get("buyer_name") or "",
                            "seller_name": inv.get("seller_name") or "",
                            "is_income": is_inc,
                            "brutto_total": round(pg, 2),
                            "netto_total": round(pn, 2),
                            "paid_amount": round(paid_amt, 2),
                            "remaining_brutto": round(pg - paid_amt, 2) if not is_paid else 0.0,
                            "remaining_netto": round(pn * ((pg - paid_amt) / pg), 2) if pg and not is_paid else 0.0,
                            "is_paid": is_paid,
                            "sell_date": inv.get("sell_date") or "",
                            "url": f"https://{domain}.fakturownia.pl/invoices/{inv.get('id')}",
                        }
                    if len(invs) < 100:
                        break
                    page += 1
                    if page > 100:
                        break
    except Exception as e:
        raise HTTPException(502, f"Blad polaczenia z Fakturownia: {e}")

    # === Pobierz faktury z App ===
    app_match = {"source": "fakturownia"}
    if year is not None:
        app_match["year"] = year
    app_by_fid: dict = {}  # fakturownia_invoice_id -> doc
    app_by_num: dict = {}  # nr_faktury -> doc (fallback)
    async for inv in db.finance_invoices.find(app_match, {"_id": 0}):
        num = inv.get("nr_faktury") or inv.get("number") or inv.get("invoice_number") or ""
        fid = inv.get("fakturownia_invoice_id")
        brutto = float(inv.get("brutto") or 0)
        netto = float(inv.get("netto") or 0)
        paid_amount = float(inv.get("paid_amount") or 0)
        is_paid = bool(inv.get("paid"))
        rem_b = 0.0 if is_paid else round(brutto - paid_amount, 2)
        rem_n = 0.0 if is_paid else (round(netto * ((brutto - paid_amount) / brutto), 2) if brutto else 0)
        rec = {
            "number": num,
            "fakturownia_invoice_id": fid,
            "is_income": bool(inv.get("is_income")),
            "remaining_brutto": rem_b,
            "remaining_netto": rem_n,
            "is_paid": is_paid,
            "paid_amount": paid_amount,
            "buyer_name": inv.get("buyer_name") or inv.get("kontrahent") or "",
        }
        if fid:
            app_by_fid[fid] = rec
        if num:
            app_by_num[num] = rec

    # === Znajdz rozbieznosci - lacz po fakturownia_invoice_id, fallback po numerze ===
    items = []
    matched_app_keys = set()
    # Faktury z Fakturowni
    for num, f in fak_by_num.items():
        fid = f.get("fakturownia_invoice_id")
        a = (app_by_fid.get(fid) if fid else None) or app_by_num.get(num)
        if a:
            matched_app_keys.add(a.get("fakturownia_invoice_id") or a.get("number"))
        f_rem = f.get("remaining_netto", 0)
        a_rem = (a or {}).get("remaining_netto", 0)
        diff = round(f_rem - a_rem, 2)
        if abs(diff) < 0.01:
            continue
        # Klasyfikacja
        if not a:
            reason = "Brak w App (jest w Fakturownia)"
            kind = "missing_app"
        elif f["is_paid"] and not a["is_paid"]:
            reason = f"Zapłacone w Fakturownia ({fmt_pln(f.get('paid_amount', 0))}), w App nadal nieopłacone"
            kind = "fak_paid_app_unpaid"
        elif a["is_paid"] and not f["is_paid"]:
            reason = "Zapłacone w App, w Fakturownia nadal nieopłacone"
            kind = "app_paid_fak_unpaid"
        elif abs(f.get("paid_amount", 0) - a.get("paid_amount", 0)) > 0.01:
            reason = f"Różna częściowa płatność (Fak: {fmt_pln(f.get('paid_amount', 0))}, App: {fmt_pln(a.get('paid_amount', 0))})"
            kind = "partial_payment_diff"
        else:
            reason = "Inna rozbieżność kwotowa (różne netto/brutto)"
            kind = "amount_diff"
        items.append({
            "number": num,
            "buyer_name": f.get("buyer_name") or (a or {}).get("buyer_name") or "",
            "is_income": f.get("is_income", False),
            "fak_remaining_netto": f_rem,
            "app_remaining_netto": a_rem,
            "diff_netto": diff,
            "reason": reason,
            "kind": kind,
            "url": f.get("url"),
            "sell_date": f.get("sell_date", ""),
        })
    # Faktury w App, ktorych nie ma w Fakturowni
    all_app_recs = list(app_by_fid.values()) + [v for k, v in app_by_num.items() if v.get("fakturownia_invoice_id") not in app_by_fid]
    seen = set()
    for a in all_app_recs:
        key = a.get("fakturownia_invoice_id") or a.get("number")
        if key in seen or key in matched_app_keys:
            continue
        seen.add(key)
        if a["is_paid"]:
            continue  # jesli zaplacone w App a nie ma w Fak - OK
        a_rem = a.get("remaining_netto", 0)
        if abs(a_rem) < 0.01:
            continue
        items.append({
            "number": a.get("number", "?"),
            "buyer_name": a.get("buyer_name", ""),
            "is_income": a.get("is_income", False),
            "fak_remaining_netto": 0,
            "app_remaining_netto": a_rem,
            "diff_netto": round(-a_rem, 2),
            "reason": "Brak w Fakturownia (jest tylko w App)",
            "kind": "missing_fak",
            "url": None,
            "sell_date": "",
        })

    # Posortuj od najwiekszej rozbieznosci
    items.sort(key=lambda x: abs(x["diff_netto"]), reverse=True)
    return {
        "year": year,
        "total_diff_netto": round(sum(i["diff_netto"] for i in items if not i["is_income"]), 2),
        "total_diff_netto_income": round(sum(i["diff_netto"] for i in items if i["is_income"]), 2),
        "count": len(items),
        "items": items,
    }




@router.post("/finance/sync-from-fakturownia")
async def sync_from_fakturownia(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    from_year: Optional[int] = Query(None, description="Pobierz od roku (wlacznie)"),
    from_month: Optional[int] = Query(None, ge=1, le=12),
    current_user: dict = Depends(get_current_admin),
):
    """Pobiera faktury kosztowe z Fakturowni.

    Tryby:
    - Pojedynczy miesiac: ?year=2026&month=5
    - Zakres od daty do dzisiaj: ?from_year=2026&from_month=1 (pobierze wszystkie miesiace 01-bieżący)
    - Bez parametrow: biezacy miesiac

    Kazda POZYCJA faktury staje sie osobnym wpisem w finance_zapisy.
    Idempotentnie - re-sync NIE rusza wpisow ktore admin juz dopisal kodem.
    """
    now = datetime.now()
    # Tryb zakresu (from_year+from_month -> dzis)
    if from_year is not None and from_month is not None:
        results = []
        y, m = from_year, from_month
        while (y, m) <= (now.year, now.month):
            # W range mode: skip per-month removal, zrobimy globalny cleanup na koncu
            res = await _do_fakturownia_sync(y, m, current_user["sub"], skip_removal=True)
            results.append(res)
            # Zbieraj wszystkie nowo pobrane position_ids z calego zakresu
            # (informacja ta jest niedostepna w response - musimy zrobic inaczej)
            if m == 12:
                y, m = y + 1, 1
            else:
                m += 1
        # GLOBALNY CLEANUP: usun wszystkie wpisy fakturownia z naszego zakresu (year,month w from..to)
        # ktore nie maja kod_id i ktorych position_id NIE istnieje juz w Fakturowni.
        # Pobierz ponownie wszystkie aktualne position_ids z Fakturowni w naszym zakresie -
        # uzyjemy zoptymalizowanego skrotu: zaktualizowane wpisy maja `updated_at` z ostatniej minuty.
        # Prostsze podejscie: pobierz wszystkie pos_id z Fakturowni dla calego zakresu i porownaj.
        settings = await db.finance_settings.find_one({"id": "main"}, {"_id": 0}) or {}
        api_token = settings.get("fakturownia_api_key")
        domain = settings.get("fakturownia_domain")
        valid_pos_ids: set = set()
        if api_token and domain:
            y2, m2 = from_year, from_month
            while (y2, m2) <= (now.year, now.month):
                date_from = f"{y2:04d}-{m2:02d}-01"
                last_day = calendar.monthrange(y2, m2)[1]
                date_to = f"{y2:04d}-{m2:02d}-{last_day:02d}"
                async with httpx.AsyncClient(timeout=30.0) as client:
                    for inc_mode in ("no", "yes"):
                        page = 1
                        while True:
                            params = {"api_token": api_token, "income": inc_mode,
                                       "include_positions": "true", "period": "more",
                                       "date_from": date_from, "date_to": date_to,
                                       "page": str(page), "per_page": "100"}
                            resp = await client.get(f"https://{domain}.fakturownia.pl/invoices.json",
                                                     params=params)
                            if resp.status_code != 200:
                                break
                            invs = resp.json()
                            if not isinstance(invs, list):
                                invs = invs.get("invoices", [])
                            if not invs:
                                break
                            for inv in invs:
                                for pos_idx, pos in enumerate(inv.get("positions", [])):
                                    raw = pos.get("id")
                                    pid = str(raw) if raw else f"inv_{inv.get('id')}_idx{pos_idx}"
                                    valid_pos_ids.add(pid)
                            if len(invs) < 100:
                                break
                            page += 1
                            if page > 50:
                                break
                if m2 == 12:
                    y2, m2 = y2 + 1, 1
                else:
                    m2 += 1
        # Usun wpisy fakturownia bez kod_id w zakresie ktorych pos_id NIE ma w valid_pos_ids
        orphan_filter = {
            "source": "fakturownia",
            "kod_id": None,
            "fakturownia_position_id": {"$nin": list(valid_pos_ids)},
            "$or": [
                {"year": yy, "month": mm}
                for yy, mm in _iter_months(from_year, from_month, now.year, now.month)
            ],
        }
        del_res = await db.finance_zapisy.delete_many(orphan_filter)
        total_removed = del_res.deleted_count

        total_created = sum(r["positions_created"] for r in results)
        total_updated = sum(r["positions_updated"] for r in results)
        total_invoices = sum(r["invoices_fetched"] for r in results)
        return {
            "mode": "range",
            "from": f"{from_year:04d}-{from_month:02d}",
            "to": f"{now.year:04d}-{now.month:02d}",
            "months_processed": len(results),
            "invoices_fetched": total_invoices,
            "positions_created": total_created,
            "positions_updated": total_updated,
            "positions_removed": total_removed,
            "per_month": results,
        }
    # Pojedynczy miesiac
    yr, mo = year or now.year, month or now.month
    return await _do_fakturownia_sync(yr, mo, current_user["sub"])


# ============= CRON: auto-sync Fakturowni co 30 minut =============
# Konfigurowalny start (default: styczen 2026)
SYNC_FROM_YEAR = 2026
SYNC_FROM_MONTH = 1


async def cron_fakturownia_sync():
    """Wywolywane przez scheduler co 30 minut. Cicho ignoruje brak konfiguracji.
    Pobiera WSZYSTKIE miesiace od SYNC_FROM_YEAR-SYNC_FROM_MONTH do biezacego.
    Idempotentnie - nie dubluje, nie nadpisuje wpisow ktore admin juz przypisal kodem.
    """
    try:
        settings = await db.finance_settings.find_one({"id": "main"}, {"_id": 0}) or {}
        if not (settings.get("fakturownia_api_key") and settings.get("fakturownia_domain")):
            logger.debug("[cron_fakturownia] brak konfiguracji - skip")
            return
        now = datetime.now()
        total_created = total_updated = 0
        for y, m in _iter_months(SYNC_FROM_YEAR, SYNC_FROM_MONTH, now.year, now.month):
            res = await _do_fakturownia_sync(y, m, "cron_system", skip_removal=True)
            total_created += res["positions_created"]
            total_updated += res["positions_updated"]

        # Globalny cleanup: pobierz wszystkie valid pos_ids w zakresie
        api_token = settings["fakturownia_api_key"]
        domain = settings["fakturownia_domain"]
        valid_pos_ids: set = set()
        async with httpx.AsyncClient(timeout=30.0) as client:
            for y, m in _iter_months(SYNC_FROM_YEAR, SYNC_FROM_MONTH, now.year, now.month):
                date_from = f"{y:04d}-{m:02d}-01"
                last_day = calendar.monthrange(y, m)[1]
                date_to = f"{y:04d}-{m:02d}-{last_day:02d}"
                for inc_mode in ("no", "yes"):
                    page = 1
                    while True:
                        params = {"api_token": api_token, "income": inc_mode,
                                   "include_positions": "true", "period": "more",
                                   "date_from": date_from, "date_to": date_to,
                                   "page": str(page), "per_page": "100"}
                        resp = await client.get(f"https://{domain}.fakturownia.pl/invoices.json",
                                                 params=params)
                        if resp.status_code != 200:
                            break
                        invs = resp.json()
                        if not isinstance(invs, list):
                            invs = invs.get("invoices", [])
                        if not invs:
                            break
                        for inv in invs:
                            for pos_idx, pos in enumerate(inv.get("positions", [])):
                                raw = pos.get("id")
                                pid = str(raw) if raw else f"inv_{inv.get('id')}_idx{pos_idx}"
                                valid_pos_ids.add(pid)
                        if len(invs) < 100:
                            break
                        page += 1
                        if page > 50:
                            break

        del_res = await db.finance_zapisy.delete_many({
            "source": "fakturownia",
            "kod_id": None,
            "fakturownia_position_id": {"$nin": list(valid_pos_ids)},
            "$or": [{"year": yy, "month": mm}
                     for yy, mm in _iter_months(SYNC_FROM_YEAR, SYNC_FROM_MONTH, now.year, now.month)],
        })
        total_removed = del_res.deleted_count

        # Globalny unpaid sync - dopelnia stare niezaplacone faktury spoza zakresu
        try:
            unpaid_res = await _do_fakturownia_unpaid_sync_global("cron_system")
            logger.info(f"[cron_fakturownia] unpaid sync: created={unpaid_res['invoices_created']}, "
                        f"updated={unpaid_res['invoices_updated']}, total={unpaid_res['fetched_unpaid']}")
        except Exception as ue:
            logger.warning(f"[cron_fakturownia] unpaid sync failed: {ue}")
        logger.info(f"[cron_fakturownia] OK: {total_created} nowych, "
                     f"{total_updated} zaktualizowanych, "
                     f"{total_removed} usunietych "
                     f"(zakres {SYNC_FROM_YEAR:04d}-{SYNC_FROM_MONTH:02d} -> {now.year:04d}-{now.month:02d})")
        # Zapis sukcesu w settings (czysci poprzedni blad jesli byl)
        await db.finance_settings.update_one(
            {"id": "main"},
            {"$set": {"last_fakturownia_sync_at": datetime.now().isoformat(),
                       "last_fakturownia_sync_status": "ok",
                       "last_fakturownia_sync_error": None}},
        )
    except HTTPException as e:
        logger.warning(f"[cron_fakturownia] {e.detail}")
        await db.finance_settings.update_one(
            {"id": "main"},
            {"$set": {"last_fakturownia_sync_at": datetime.now().isoformat(),
                       "last_fakturownia_sync_status": "error",
                       "last_fakturownia_sync_error": f"HTTP {e.status_code}: {e.detail}"}},
        )
    except Exception as e:
        logger.error(f"[cron_fakturownia] nieoczekiwany blad: {e}", exc_info=True)
        await db.finance_settings.update_one(
            {"id": "main"},
            {"$set": {"last_fakturownia_sync_at": datetime.now().isoformat(),
                       "last_fakturownia_sync_status": "error",
                       "last_fakturownia_sync_error": f"{type(e).__name__}: {e}"}},
        )





# ============= Test polaczenia z Fakturownia =============
@router.post("/finance/test-fakturownia")
async def test_fakturownia(current_user: dict = Depends(get_current_admin)):
    """Testuje polaczenie z Fakturownia API. Zwraca info o koncie lub blad."""
    import asyncio
    import requests as _req  # sync fallback (omija httpx + Python 3.14 typing bug)
    settings = await db.finance_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    api_token = settings.get("fakturownia_api_key")
    domain = settings.get("fakturownia_domain")
    if not api_token or not domain:
        raise HTTPException(status_code=400, detail="Brak konfiguracji - ustaw klucz API i subdomene")
    # Defensywnie - jeszcze raz wyczysc subdomene gdyby zostala zapisana w starym formacie
    domain = domain.strip().lower().replace("https://", "").replace("http://", "").split("/")[0]
    if domain.endswith(".fakturownia.pl"):
        domain = domain[: -len(".fakturownia.pl")]
    url = f"https://{domain}.fakturownia.pl/account.json"

    def _do_request():
        return _req.get(url, params={"api_token": api_token}, timeout=15)

    try:
        resp = await asyncio.to_thread(_do_request)
        if resp.status_code == 401:
            return {"ok": False, "error": "Nieprawidlowy klucz API"}
        if resp.status_code == 403:
            return {"ok": False, "error": "Brak uprawnien dla tego klucza"}
        if resp.status_code == 404:
            return {"ok": False, "error": f"Subdomena '{domain}' nie istnieje"}
        if resp.status_code >= 400:
            return {"ok": False, "error": f"Fakturownia odpowiedziala HTTP {resp.status_code}"}
        try:
            data = resp.json()
        except Exception:
            return {"ok": False, "error": "Fakturownia zwrocila nieprawidlowa odpowiedz (nie-JSON)"}
        return {
            "ok": True,
            "company_name": data.get("company_name") or data.get("name") or "",
            "prefix": data.get("prefix") or domain,
        }
    except _req.exceptions.Timeout:
        return {"ok": False, "error": f"Timeout - Fakturownia nie odpowiada w 15s (domena: {domain})"}
    except _req.exceptions.ConnectionError as e:
        return {"ok": False, "error": f"Blad polaczenia: {e}"}
    except Exception as e:
        logger.exception("[test-fakturownia] nieoczekiwany blad")
        return {"ok": False, "error": f"Nieoczekiwany blad: {type(e).__name__}: {e}"}


