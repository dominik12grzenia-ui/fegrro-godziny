"""Finanse: raporty (Rachunek Wynikow, Payment Summary, Sprzedaz per budowa).

Wydzielone z routes/finance.py (iter95bf split). Endpointy:
- GET /finance/rachunek-wynikow
- GET /finance/payment-summary
- GET /finance/sprzedaz

Plus helper `_compute_sprzedaz_data` re-eksportowany przez routes.finance
(uzywany przez routes/budget.py).
"""
import logging
from fastapi import APIRouter, Depends, Query
from datetime import datetime
from typing import Optional

from database import db
from auth import get_current_admin

router = APIRouter()
logger = logging.getLogger(__name__)

# ============= RACHUNEK WYNIKOW =============
@router.get("/finance/rachunek-wynikow")
async def rachunek_wynikow(
    year: int = Query(...),
    current_user: dict = Depends(get_current_admin),
):
    """Buduje tabele Rachunku Wynikow 12 msc x kategorie - identycznie jak w Excelu."""
    from routes.finance import ensure_kody_seed  # late import (cykl)
    await ensure_kody_seed()
    # iter95dv: ignoruj soft-deleted zapisy/faktury (deleted_at != None).
    # Wczesniej RW liczyl je dalej -> usuniete pozycje "wracaly" do sum.
    _not_deleted = {"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}
    # Pobierz wszystkie zapisy w tym roku
    zapisy = await db.finance_zapisy.find(
        {"year": year, **_not_deleted},
        {"_id": 0, "month": 1, "kod_id": 1, "kod_category": 1, "netto": 1, "budowa_id": 1,
         "parent_invoice_id": 1},
    ).to_list(length=None)

    # Pobierz naglowki faktur z tego roku - dla kazdej faktury z kod_id obliczamy "reszta"
    # = netto faktury - suma przypisanych pozycji tej samej faktury. Reszta wnosi do aggregacji.
    invoices = await db.finance_invoices.find(
        {"year": year, **_not_deleted},
        {"_id": 0, "id": 1, "month": 1, "netto": 1, "kod_id": 1, "kod_category": 1, "budowa_id": 1},
    ).to_list(length=None)
    # Mapa: invoice_id -> suma przypisanych pozycji
    assigned_pos_by_inv: dict = {}
    for z in zapisy:
        if z.get("kod_id") and z.get("parent_invoice_id"):
            assigned_pos_by_inv[z["parent_invoice_id"]] = (
                assigned_pos_by_inv.get(z["parent_invoice_id"], 0.0) + float(z.get("netto") or 0)
            )
    # Wirtualne zapisy z resztami faktur
    # iter94d: gdy naglówek faktury nie ma budowa_id ale ma pozycje-dzieci przypisane
    # do budowy - dziedziczymy budowa_id do reszty faktury (najwiekszy udzial dzieci).
    children_by_inv: dict = {}
    for z in zapisy:
        pid = z.get("parent_invoice_id")
        if pid and z.get("budowa_id"):
            children_by_inv.setdefault(pid, {}).setdefault(z["budowa_id"], 0.0)
            children_by_inv[pid][z["budowa_id"]] += float(z.get("netto") or 0)
    virtual_zapisy = []
    for inv in invoices:
        if not inv.get("kod_id"):
            continue
        remainder = float(inv.get("netto") or 0) - assigned_pos_by_inv.get(inv["id"], 0.0)
        if remainder <= 0:
            continue
        eff_budowa_id = inv.get("budowa_id")
        if not eff_budowa_id:
            child_shares = children_by_inv.get(inv["id"], {})
            if child_shares:
                eff_budowa_id = max(child_shares.items(), key=lambda x: x[1])[0]
        virtual_zapisy.append({
            "month": inv["month"],
            "kod_id": inv["kod_id"],
            "kod_category": inv.get("kod_category") or "",
            "netto": round(remainder, 2),
            "budowa_id": eff_budowa_id,
        })
    zapisy_all = zapisy + virtual_zapisy

    # Agregacja: sum_by_kod[kod_id][month] = netto
    # iter94c: liczymy TYLKO zapisy przypisane do budów (budowa_id != null).
    # Nieprzypisane sumujemy osobno do sekcji "unassigned" dla informacji.
    sum_by_kod: dict = {}
    sum_by_cat: dict = {}  # category -> {month: netto}
    unassigned_by_cat: dict = {}  # nieprzypisane per kategoria + miesiąc
    for z in zapisy_all:
        if not z.get("kod_id"):
            continue
        m = z["month"]
        kod = z["kod_id"]
        cat = z.get("kod_category") or ""
        v = float(z.get("netto") or 0)
        if z.get("budowa_id"):
            sum_by_kod.setdefault(kod, {}).setdefault(m, 0.0)
            sum_by_kod[kod][m] += v
            sum_by_cat.setdefault(cat, {}).setdefault(m, 0.0)
            sum_by_cat[cat][m] += v
        else:
            unassigned_by_cat.setdefault(cat, {}).setdefault(m, 0.0)
            unassigned_by_cat[cat][m] += v

    # Kaucje: GIR i DW = % per-budowa z przychodu PZS dla budow z is_gir/is_dw
    gir_budowy = await db.finance_budowy.find(
        {"is_gir": True}, {"_id": 0, "id": 1, "kaucja_gir_pct": 1}
    ).to_list(length=None)
    dw_budowy = await db.finance_budowy.find(
        {"is_dw": True}, {"_id": 0, "id": 1, "kaucja_dw_pct": 1}
    ).to_list(length=None)
    gir_pct = {b["id"]: float(b.get("kaucja_gir_pct") or 2.0) / 100.0 for b in gir_budowy}
    dw_pct = {b["id"]: float(b.get("kaucja_dw_pct") or 2.0) / 100.0 for b in dw_budowy}
    kaucja_gir = {m: 0.0 for m in range(1, 13)}
    kaucja_dw = {m: 0.0 for m in range(1, 13)}
    for z in zapisy_all:
        if z.get("kod_id") == "PZS" and z.get("budowa_id"):
            m = z["month"]
            v = float(z.get("netto") or 0)
            bid = z.get("budowa_id")
            if bid in gir_pct:
                kaucja_gir[m] += v * gir_pct[bid]
            if bid in dw_pct:
                kaucja_dw[m] += v * dw_pct[bid]

    def month_arr(d: dict, mfn=lambda x: x) -> list:
        return [round(mfn(d.get(m, 0.0)), 2) for m in range(1, 13)]

    def sum_arr(arr: list) -> float:
        return round(sum(arr), 2)

    # Buduj wiersze
    przychody = month_arr(sum_by_cat.get("PZS", {}))
    podatek = month_arr(sum_by_cat.get("PPE", {}))
    godziny = month_arr(sum_by_cat.get("G", {}))
    kp_total = month_arr(sum_by_cat.get("KP", {}))
    kbb_total = month_arr(sum_by_cat.get("KBB", {}))
    ksb_total = month_arr(sum_by_cat.get("KSB", {}))
    ksp_total = month_arr(sum_by_cat.get("KSP", {}))
    koszty_total = [round(kp_total[i] + kbb_total[i] + ksb_total[i] + ksp_total[i], 2) for i in range(12)]
    kaucja_gir_arr = [round(kaucja_gir[m], 2) for m in range(1, 13)]
    kaucja_dw_arr = [round(kaucja_dw[m], 2) for m in range(1, 13)]
    wynik = [round(przychody[i] - koszty_total[i] - podatek[i] - kaucja_gir_arr[i] - kaucja_dw_arr[i], 2)
             for i in range(12)]

    # Wskazniki per R-G
    def ratio(a, b):
        return round(a / b, 2) if b > 0 else 0

    koszt_rg_firma_prac = [
        ratio(kp_total[i] + ksb_total[i] + ksp_total[i], godziny[i]) for i in range(12)
    ]
    przychody_rg = [ratio(przychody[i] + podatek[i], godziny[i]) for i in range(12)]
    koszty_rg = [ratio(koszty_total[i] + podatek[i], godziny[i]) for i in range(12)]
    koszty_budowy_rg = [ratio(kbb_total[i], godziny[i]) for i in range(12)]
    koszty_ogolne_rg = [ratio(ksb_total[i] + ksp_total[i], godziny[i]) for i in range(12)]

    # Wiersze szczegolowe per kod (rozwijalne)
    all_kody = await db.finance_kody.find({}, {"_id": 0}).sort("order", 1).to_list(length=None)
    kp_rows = []
    for k in all_kody:
        if k["category"] == "KP":
            arr = month_arr(sum_by_kod.get(k["id"], {}))
            kp_rows.append({"kod_id": k["id"], "name": k["name"], "monthly": arr, "total": sum_arr(arr)})
    kbb_rows = []
    for k in all_kody:
        if k["category"] == "KBB":
            arr = month_arr(sum_by_kod.get(k["id"], {}))
            kbb_rows.append({"kod_id": k["id"], "name": k["name"], "monthly": arr, "total": sum_arr(arr)})
    ksb_rows = []
    for k in all_kody:
        if k["category"] == "KSB":
            arr = month_arr(sum_by_kod.get(k["id"], {}))
            ksb_rows.append({"kod_id": k["id"], "name": k["name"], "monthly": arr, "total": sum_arr(arr)})
    ksp_rows = []
    for k in all_kody:
        if k["category"] == "KSP":
            arr = month_arr(sum_by_kod.get(k["id"], {}))
            ksp_rows.append({"kod_id": k["id"], "name": k["name"], "monthly": arr, "total": sum_arr(arr)})

    return {
        "year": year,
        "summary": {
            "przychody_netto": {"monthly": przychody, "total": sum_arr(przychody)},
            "suma_kosztow": {"monthly": koszty_total, "total": sum_arr(koszty_total)},
            "podatek": {"monthly": podatek, "total": sum_arr(podatek)},
            "kaucja_gir": {"monthly": kaucja_gir_arr, "total": sum_arr(kaucja_gir_arr)},
            "kaucja_dw": {"monthly": kaucja_dw_arr, "total": sum_arr(kaucja_dw_arr)},
            "wynik_netto": {"monthly": wynik, "total": sum_arr(wynik)},
            "godziny": {"monthly": godziny, "total": sum_arr(godziny)},
        },
        "ratios": {
            "koszt_rg_firma_pracownik": koszt_rg_firma_prac,
            "przychody_rg": przychody_rg,
            "koszty_rg": koszty_rg,
            "koszty_budowy_rg": koszty_budowy_rg,
            "koszty_ogolne_rg": koszty_ogolne_rg,
        },
        "groups": {
            "kp": {
                "label": "Koszty pracownikow",
                "monthly": kp_total,
                "total": sum_arr(kp_total),
                "rows": kp_rows,
            },
            "kbb": {
                "label": "Koszty budowy",
                "monthly": kbb_total,
                "total": sum_arr(kbb_total),
                "rows": kbb_rows,
            },
            "ksb": {
                "label": "Koszty stale bezposrednie",
                "monthly": ksb_total,
                "total": sum_arr(ksb_total),
                "rows": ksb_rows,
            },
            "ksp": {
                "label": "Koszty stale posrednie",
                "monthly": ksp_total,
                "total": sum_arr(ksp_total),
                "rows": ksp_rows,
            },
        },
        # iter94c: nieprzypisane koszty/przychody — informacyjnie, nie wliczane do wyniku
        "unassigned": {
            "pzs": {"monthly": month_arr(unassigned_by_cat.get("PZS", {})),
                     "total": round(sum(unassigned_by_cat.get("PZS", {}).values()), 2),
                     "label": "Przychody nieprzypisane"},
            "kp": {"monthly": month_arr(unassigned_by_cat.get("KP", {})),
                    "total": round(sum(unassigned_by_cat.get("KP", {}).values()), 2),
                    "label": "Koszty pracowników nieprzypisane"},
            "kbb": {"monthly": month_arr(unassigned_by_cat.get("KBB", {})),
                     "total": round(sum(unassigned_by_cat.get("KBB", {}).values()), 2),
                     "label": "Koszty budowy nieprzypisane"},
            "ksb": {"monthly": month_arr(unassigned_by_cat.get("KSB", {})),
                     "total": round(sum(unassigned_by_cat.get("KSB", {}).values()), 2),
                     "label": "Koszty stałe bezpośrednie nieprzypisane"},
            "ksp": {"monthly": month_arr(unassigned_by_cat.get("KSP", {})),
                     "total": round(sum(unassigned_by_cat.get("KSP", {}).values()), 2),
                     "label": "Koszty stałe pośrednie nieprzypisane"},
            "ppe": {"monthly": month_arr(unassigned_by_cat.get("PPE", {})),
                     "total": round(sum(unassigned_by_cat.get("PPE", {}).values()), 2),
                     "label": "Podatek PPE nieprzypisany"},
        },
    }


# ============= PAYMENT SUMMARY (naleznosci/zobowiazania/przeterminowane) =============
@router.get("/finance/payment-summary")
async def payment_summary(
    year: Optional[int] = Query(None, description="Filtruj po roku (issue_date)"),
    _user: dict = Depends(get_current_admin),
):
    """Zwraca podsumowanie platnosci na podstawie pol payment_to/payment_date
    z `finance_invoices` (zasilane z Fakturowni).

    - receivables: nieoplacone faktury SPRZEDAZOWE (kontrahenci nam winni)
    - payables: nieoplacone faktury KOSZTOWE (my winni dostawcom)
    - overdue_receivables: receivables z payment_to < dzis
    - overdue_payables: payables z payment_to < dzis

    Zwraca zarowno netto jak i brutto (Fakturownia raporty domyslnie pokazuja netto).
    Obsluguje czesciowe platnosci - liczy "kwote pozostala" (brutto - paid_amount).
    """
    today = datetime.now().date().isoformat()
    # iter95dv: pomin soft-deleted faktury w Payment Summary
    q = {"paid": {"$ne": True}, "source": "fakturownia",
         "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}
    if year is not None:
        q["year"] = year
    invoices = await db.finance_invoices.find(
        q,
        {"_id": 0, "id": 1, "date": 1, "kontrahent": 1, "nr_faktury": 1,
         "netto": 1, "brutto": 1, "is_income": 1, "payment_to": 1,
         "payment_date": 1, "paid": 1, "paid_amount": 1,
         "fakturownia_status": 1},
    ).to_list(length=5000)

    receivables: list = []
    payables: list = []
    for inv in invoices:
        is_income = bool(inv.get("is_income"))
        brutto = float(inv.get("brutto") or 0)
        netto = float(inv.get("netto") or 0)
        paid_amt = float(inv.get("paid_amount") or 0)
        # Kwota pozostala do zaplaty (czesciowe platnosci).
        # UWAGA: korekty maja ujemny brutto - nie klampujemy do 0,
        # zeby zgadzalo sie z raportem Fakturowni ktory odejmuje korekty.
        remaining_brutto = brutto - paid_amt
        # Netto pozostale proporcjonalnie do brutto
        remaining_netto = round(netto * (remaining_brutto / brutto), 2) if brutto != 0 else 0.0
        item = {
            "id": inv["id"],
            "date": inv.get("date"),
            "kontrahent": inv.get("kontrahent") or "",
            "nr_faktury": inv.get("nr_faktury") or "",
            "netto": round(netto, 2),
            "brutto": round(brutto, 2),
            "remaining_netto": remaining_netto,
            "remaining_brutto": round(remaining_brutto, 2),
            "paid_amount": round(paid_amt, 2),
            "payment_to": inv.get("payment_to"),
            "overdue": bool(inv.get("payment_to") and inv["payment_to"] < today),
        }
        if is_income:
            receivables.append(item)
        else:
            payables.append(item)

    def sum_field(items, field):
        return round(sum(i[field] for i in items), 2)

    def sum_overdue(items, field):
        return round(sum(i[field] for i in items if i["overdue"]), 2)

    # Sortuj rosnacao po payment_to (najpilniejsze pierwsze)
    receivables.sort(key=lambda x: x.get("payment_to") or "9999-12-31")
    payables.sort(key=lambda x: x.get("payment_to") or "9999-12-31")

    return {
        "today": today,
        "year": year,
        "receivables": {
            "total_brutto": sum_field(receivables, "remaining_brutto"),
            "total_netto": sum_field(receivables, "remaining_netto"),
            "overdue_brutto": sum_overdue(receivables, "remaining_brutto"),
            "overdue_netto": sum_overdue(receivables, "remaining_netto"),
            "count": len(receivables),
            "overdue_count": sum(1 for i in receivables if i["overdue"]),
            "items": receivables[:50],
        },
        "payables": {
            "total_brutto": sum_field(payables, "remaining_brutto"),
            "total_netto": sum_field(payables, "remaining_netto"),
            "overdue_brutto": sum_overdue(payables, "remaining_brutto"),
            "overdue_netto": sum_overdue(payables, "remaining_netto"),
            "count": len(payables),
            "overdue_count": sum(1 for i in payables if i["overdue"]),
            "items": payables[:50],
        },
    }




# ============= SPRZEDAZ per budowa =============
async def _compute_sprzedaz_data(year: int, month: Optional[int] = None,
                                  date_start: Optional[str] = None,
                                  date_end: Optional[str] = None,
                                  months_list: Optional[list] = None) -> dict:
    """Wewnetrzna funkcja - liczy tabele Sprzedaz per budowa.
    Uzywana przez endpoint /finance/sprzedaz oraz przez budget allocations
    (zeby zachowac IDENTYCZNA logike rozdziau kosztow nieprzypisanych).

    `date_start`/`date_end` - opcjonalne, format YYYY-MM-DD - nadpisuja filtr year/month
    (uzywane przez budget gdy ograniczamy zakres do aktywnosci budowy).

    iter94: `months_list` - opcjonalna lista miesiecy (1-12) do zsumowania.
    Priorytet: date_start/end > months_list > month > caly rok.

    Zwraca: {year, rows, totals, helper}
    helper zawiera surowe pule i sumy uzywane do alokacji.
    """
    from routes.finance import ensure_kody_seed  # late import (cykl)
    await ensure_kody_seed()
    budowy = await db.finance_budowy.find({}, {"_id": 0}).sort("name", 1).to_list(length=None)
    # iter95dv: pomin soft-deleted zapisy/faktury w raporcie sprzedazy
    _not_deleted = {"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}
    if date_start and date_end:
        # Filtr po zakresie dat (uzywane przez budget)
        date_q = {"$gte": date_start, "$lte": date_end}
        zap_filter = {"date": date_q, **_not_deleted}
        inv_filter = {"date": date_q, **_not_deleted}
    else:
        zap_filter = {"year": year, **_not_deleted}
        inv_filter = {"year": year, **_not_deleted}
        # iter94: months_list ma priorytet nad month
        if months_list:
            zap_filter["month"] = {"$in": months_list}
            inv_filter["month"] = {"$in": months_list}
        elif month is not None:
            zap_filter["month"] = month
            inv_filter["month"] = month
    zapisy = await db.finance_zapisy.find(
        zap_filter,
        {"_id": 0, "kod_id": 1, "kod_category": 1, "netto": 1, "budowa_id": 1,
         "parent_invoice_id": 1},
    ).to_list(length=None)
    invoices = await db.finance_invoices.find(
        inv_filter,
        {"_id": 0, "id": 1, "netto": 1, "kod_id": 1, "kod_category": 1, "budowa_id": 1},
    ).to_list(length=None)
    assigned_pos_by_inv: dict = {}
    for z in zapisy:
        if z.get("kod_id") and z.get("parent_invoice_id"):
            assigned_pos_by_inv[z["parent_invoice_id"]] = (
                assigned_pos_by_inv.get(z["parent_invoice_id"], 0.0) + float(z.get("netto") or 0)
            )
    for inv in invoices:
        if not inv.get("kod_id"):
            continue
        remainder = float(inv.get("netto") or 0) - assigned_pos_by_inv.get(inv["id"], 0.0)
        if remainder <= 0:
            continue
        zapisy.append({
            "kod_id": inv["kod_id"],
            "kod_category": inv.get("kod_category") or "",
            "netto": round(remainder, 2),
            "budowa_id": inv.get("budowa_id"),
        })

    def sum_by_kod(kod_id, budowa_id=None):
        return sum(
            float(z.get("netto") or 0)
            for z in zapisy
            if z.get("kod_id") == kod_id and (budowa_id is None or z.get("budowa_id") == budowa_id)
        )

    def sum_by_cat(category, budowa_id=None):
        return sum(
            float(z.get("netto") or 0)
            for z in zapisy
            if z.get("kod_category") == category and (budowa_id is None or z.get("budowa_id") == budowa_id)
        )

    total_pzs = sum_by_cat("PZS")
    total_ksp = sum_by_cat("KSP")
    total_ppe = sum_by_cat("PPE")
    kp_stawki_unassigned = sum(
        float(z.get("netto") or 0)
        for z in zapisy
        if z.get("kod_category") == "KP" and not z.get("budowa_id")
    )
    ksp_stawki_unassigned = sum(
        float(z.get("netto") or 0)
        for z in zapisy
        if z.get("kod_id") == "KSP_STAWKI" and not z.get("budowa_id")
    )
    ksp_uklady_unassigned = sum(
        float(z.get("netto") or 0)
        for z in zapisy
        if z.get("kod_id") == "KSP_UKLADY" and not z.get("budowa_id")
    )
    # iter94: koszty budowy (KBB) i koszty stale bezposrednie (KSB) bez przypisania
    # do budowy - wczesniej byly ignorowane w Sprzedazy, przez co suma kosztow
    # rozjezdzala sie z Rachunkiem Wynikow. Teraz alokujemy je proporcjonalnie
    # do udzialu KP danej budowy (analogicznie do kp_stawki_unassigned przez H).
    kbb_unassigned = sum(
        float(z.get("netto") or 0)
        for z in zapisy
        if z.get("kod_category") == "KBB" and not z.get("budowa_id")
    )
    ksb_unassigned = sum(
        float(z.get("netto") or 0)
        for z in zapisy
        if z.get("kod_category") == "KSB" and not z.get("budowa_id")
    )
    assigned_kp_sum = sum(
        float(z.get("netto") or 0)
        for z in zapisy
        if z.get("kod_category") == "KP" and z.get("budowa_id")
    )
    assigned_kbb_sum = sum(
        float(z.get("netto") or 0)
        for z in zapisy
        if z.get("kod_category") == "KBB" and z.get("budowa_id")
    )

    def safe_div(a, b):
        return a / b if b > 0 else 0.0

    rows = []
    for idx, b in enumerate(budowy, 1):
        bid = b["id"]
        E = sum_by_cat("PZS", bid)
        F = sum_by_cat("KP", bid)
        Ib = sum_by_cat("KBB", bid)
        N = sum_by_cat("KSB", bid)
        # iter94c: dodatkowe kategorie liczone tylko dla tej budowy (nie z puli globalnej)
        KSP_bid = sum_by_cat("KSP", bid)
        PPE_bid = sum_by_cat("PPE", bid)
        G = safe_div(F, assigned_kp_sum)
        H = kp_stawki_unassigned * G  # pokazane w kolumnie 'KP-alok' (info, nie w Z)
        J = safe_div(F + Ib, assigned_kbb_sum + assigned_kp_sum)
        K = ksp_stawki_unassigned * J  # pokazane w kolumnie 'KBB-alok' (info)
        # Marze pokazywane w szczegolach - liczone jak wczesniej dla kompatybilnosci widoku.
        L_brutto = E - (F + H + Ib + K)
        M_pct = safe_div(L_brutto, E)
        O_aloc = ksp_uklady_unassigned * G
        P_marza1 = L_brutto - N - O_aloc
        Q_pct = safe_div(P_marza1, E)
        ksp_other = total_ksp - ksp_stawki_unassigned - ksp_uklady_unassigned
        R_aloc = ksp_other * G
        S_marza2 = P_marza1 - R_aloc
        T_pct = safe_div(S_marza2, E)
        U_aloc = total_ppe * safe_div(E, total_pzs)
        V_marza3 = S_marza2 - U_aloc
        W_pct = safe_div(V_marza3, E)
        Y = E
        # iter94c: kolumna 'Koszt' (visible) - TYLKO koszty przypisane do tej budowy
        # (bez re-alokacji nieprzypisanych). Dzieki temu SUM(Koszt) w Sprzedazy = SUMA KOSZTOW w RW.
        Z = F + Ib + N + KSP_bid + PPE_bid
        AA = E * (float(b.get("kaucja_gir_pct") or 2.0) / 100.0) if b.get("is_gir") else 0.0
        AB = E * (float(b.get("kaucja_dw_pct") or 2.0) / 100.0) if b.get("is_dw") else 0.0
        AC = Y - Z - AA - AB
        AD_pct = safe_div(AC, Y)
        AE = sum_by_kod("G", bid)
        AF = safe_div(Y, AE) if AE > 0 else 0
        AG = safe_div(AC, AE) if AE > 0 else 0
        AH = safe_div(Z, AE) if AE > 0 else 0
        AI = F + H + Ib + K

        rows.append({
            "nr": idx,
            "budowa_id": bid,
            "name": b["name"],
            "is_archived": b.get("is_archived", False),
            "is_gir": b.get("is_gir", False),
            "is_dw": b.get("is_dw", False),
            "details": {
                "sprzedaz": round(E, 2),
                "kp": round(F, 2),
                "kp_udzial": round(G, 4),
                "kp_aloc": round(H, 2),
                "kbb": round(Ib, 2),
                "kbb_kp_udzial": round(J, 4),
                "kbb_aloc": round(K, 2),
                "marza_brutto": round(L_brutto, 2),
                "marza_brutto_pct": round(M_pct, 4),
                "ksb": round(N, 2),
                "ksp_uklady_aloc": round(O_aloc, 2),
                "marza1": round(P_marza1, 2),
                "marza1_pct": round(Q_pct, 4),
                "ksp_aloc": round(R_aloc, 2),
                "marza2": round(S_marza2, 2),
                "marza2_pct": round(T_pct, 4),
                "podatek_aloc": round(U_aloc, 2),
                "marza3": round(V_marza3, 2),
                "marza3_pct": round(W_pct, 4),
            },
            "visible": {
                "przychod": round(Y, 2),
                "koszt": round(Z, 2),
                "kaucja_gir": round(AA, 2),
                "kaucja_dw": round(AB, 2),
                "roznica": round(AC, 2),
                "zysk_pct": round(AD_pct, 4),
                "godziny": round(AE, 2),
                "przychod_rg": round(AF, 2),
                "zysk_rg": round(AG, 2),
                "koszt_rg": round(AH, 2),
                "koszt_zmienny": round(AI, 2),
            },
        })

    sum_visible = {k: round(sum(r["visible"][k] for r in rows), 2) for k in
                   ["przychod", "koszt", "kaucja_gir", "kaucja_dw", "roznica", "godziny", "koszt_zmienny"]}
    sum_visible["zysk_pct"] = round(safe_div(sum_visible["roznica"], sum_visible["przychod"]), 4)
    sum_visible["przychod_rg"] = round(safe_div(sum_visible["przychod"], sum_visible["godziny"]), 2) if sum_visible["godziny"] > 0 else 0
    sum_visible["zysk_rg"] = round(safe_div(sum_visible["roznica"], sum_visible["godziny"]), 2) if sum_visible["godziny"] > 0 else 0
    sum_visible["koszt_rg"] = round(safe_div(sum_visible["koszt"], sum_visible["godziny"]), 2) if sum_visible["godziny"] > 0 else 0

    sum_details_keys = ["sprzedaz", "kp", "kp_aloc", "kbb", "kbb_aloc",
                        "marza_brutto",
                        "ksb", "ksp_uklady_aloc", "marza1", "ksp_aloc", "marza2",
                        "podatek_aloc", "marza3"]
    sum_details = {k: round(sum(r["details"][k] for r in rows), 2) for k in sum_details_keys}
    sd_sprzedaz = sum_details["sprzedaz"]
    sum_details["marza_brutto_pct"] = round(safe_div(sum_details["marza_brutto"], sd_sprzedaz), 4)
    sum_details["marza1_pct"] = round(safe_div(sum_details["marza1"], sd_sprzedaz), 4)
    sum_details["marza2_pct"] = round(safe_div(sum_details["marza2"], sd_sprzedaz), 4)
    sum_details["marza3_pct"] = round(safe_div(sum_details["marza3"], sd_sprzedaz), 4)

    # iter94c: sekcja "unassigned" — kwoty NIEPRZYPISANE do zadnej budowy (nie wliczane do totali).
    unass_pzs = sum(float(z.get("netto") or 0) for z in zapisy
                    if z.get("kod_category") == "PZS" and not z.get("budowa_id"))
    unass_kp = kp_stawki_unassigned
    unass_kbb = kbb_unassigned
    unass_ksb = ksb_unassigned
    unass_ksp = sum(float(z.get("netto") or 0) for z in zapisy
                     if z.get("kod_category") == "KSP" and not z.get("budowa_id"))
    unass_ppe = sum(float(z.get("netto") or 0) for z in zapisy
                     if z.get("kod_category") == "PPE" and not z.get("budowa_id"))

    return {
        "year": year,
        "rows": rows,
        "totals": {"visible": sum_visible, "details": sum_details},
        "unassigned": {
            "przychody": round(unass_pzs, 2),
            "kp": round(unass_kp, 2),
            "kbb": round(unass_kbb, 2),
            "ksb": round(unass_ksb, 2),
            "ksp": round(unass_ksp, 2),
            "ppe": round(unass_ppe, 2),
            "suma_kosztow": round(unass_kp + unass_kbb + unass_ksb + unass_ksp + unass_ppe, 2),
        },
        "helper": {
            "total_pzs": total_pzs,
            "total_ksp": total_ksp,
            "total_ppe": total_ppe,
            "kp_stawki_unassigned": kp_stawki_unassigned,
            "ksp_stawki_unassigned": ksp_stawki_unassigned,
            "ksp_uklady_unassigned": ksp_uklady_unassigned,
            "assigned_kp_sum": assigned_kp_sum,
            "assigned_kbb_sum": assigned_kbb_sum,
        },
    }


async def _compute_rachunek_wynikow_totals(year: int, months_list: Optional[list] = None) -> dict:
    """iter94b/94c: Zwraca sumy roczne z Rachunku Wynikow — LICZONE TYLKO Z POZYCJI
    PRZYPISANYCH DO BUDOWY (budowa_id != null). Nieprzypisane sumowane osobno
    jako pole `unassigned_*` — informacyjnie, nie wliczane do wyniku.

    Efekt: Dashboard / Sprzedaz per budowa / Rachunek Wynikow pokazują IDENTYCZNE
    sumy (bo wszystkie liczą tylko przypisane do budów).
    """
    from routes.finance import ensure_kody_seed
    await ensure_kody_seed()
    _not_deleted = {"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}
    q = {"year": year, **_not_deleted}
    if months_list:
        q["month"] = {"$in": months_list}
    zapisy = await db.finance_zapisy.find(
        q, {"_id": 0, "month": 1, "kod_id": 1, "kod_category": 1, "netto": 1,
             "budowa_id": 1, "parent_invoice_id": 1}
    ).to_list(length=None)
    invoices = await db.finance_invoices.find(
        q, {"_id": 0, "id": 1, "month": 1, "netto": 1, "kod_id": 1,
             "kod_category": 1, "budowa_id": 1}
    ).to_list(length=None)
    # Virtual zapisy z reszt faktur — dziedziczą budowa_id z faktury.
    # iter94d: gdy naglowek faktury nie ma budowa_id ale pozycje-dzieci sa przypisane -
    # dziedziczymy budowa najwiekszego udzialu (typowy przypadek gdy uzytkownik
    # przypisuje pozycje na fakturze zamiast samego naglowka).
    assigned_pos_by_inv: dict = {}
    children_by_inv: dict = {}
    for z in zapisy:
        if z.get("kod_id") and z.get("parent_invoice_id"):
            pid = z["parent_invoice_id"]
            assigned_pos_by_inv[pid] = assigned_pos_by_inv.get(pid, 0.0) + float(z.get("netto") or 0)
            if z.get("budowa_id"):
                children_by_inv.setdefault(pid, {}).setdefault(z["budowa_id"], 0.0)
                children_by_inv[pid][z["budowa_id"]] += float(z.get("netto") or 0)
    virtual_zapisy = []
    for inv in invoices:
        if not inv.get("kod_id"):
            continue
        remainder = float(inv.get("netto") or 0) - assigned_pos_by_inv.get(inv["id"], 0.0)
        if remainder <= 0:
            continue
        eff_budowa_id = inv.get("budowa_id")
        if not eff_budowa_id:
            child_shares = children_by_inv.get(inv["id"], {})
            if child_shares:
                eff_budowa_id = max(child_shares.items(), key=lambda x: x[1])[0]
        virtual_zapisy.append({
            "month": inv["month"],
            "kod_id": inv["kod_id"],
            "kod_category": inv.get("kod_category") or "",
            "netto": round(remainder, 2),
            "budowa_id": eff_budowa_id,
        })
    zapisy_all = zapisy + virtual_zapisy

    # PRZYPISANE (budowa_id != null) — trafiaja do totals
    totals = {"PZS": 0.0, "PPE": 0.0, "KP": 0.0, "KBB": 0.0, "KSB": 0.0, "KSP": 0.0}
    # NIEPRZYPISANE (budowa_id == null) — do informacji, nie wliczane
    unassigned = {"PZS": 0.0, "PPE": 0.0, "KP": 0.0, "KBB": 0.0, "KSB": 0.0, "KSP": 0.0}
    for z in zapisy_all:
        if not z.get("kod_id"):
            continue
        cat = z.get("kod_category") or ""
        if cat not in totals:
            continue
        v = float(z.get("netto") or 0)
        if z.get("budowa_id"):
            totals[cat] += v
        else:
            unassigned[cat] += v

    # Kaucje GIR/DW — % z PZS dla budów z is_gir/is_dw (dotyczy tylko przypisanych)
    gir_budowy = await db.finance_budowy.find(
        {"is_gir": True}, {"_id": 0, "id": 1, "kaucja_gir_pct": 1}
    ).to_list(length=None)
    dw_budowy = await db.finance_budowy.find(
        {"is_dw": True}, {"_id": 0, "id": 1, "kaucja_dw_pct": 1}
    ).to_list(length=None)
    gir_pct = {b["id"]: float(b.get("kaucja_gir_pct") or 2.0) / 100.0 for b in gir_budowy}
    dw_pct = {b["id"]: float(b.get("kaucja_dw_pct") or 2.0) / 100.0 for b in dw_budowy}
    kaucja_gir_sum = 0.0
    kaucja_dw_sum = 0.0
    for z in zapisy_all:
        if z.get("kod_id") == "PZS" and z.get("budowa_id"):
            v = float(z.get("netto") or 0)
            bid = z["budowa_id"]
            if bid in gir_pct:
                kaucja_gir_sum += v * gir_pct[bid]
            if bid in dw_pct:
                kaucja_dw_sum += v * dw_pct[bid]

    koszty_operacyjne = totals["KP"] + totals["KBB"] + totals["KSB"] + totals["KSP"]
    koszty_full = koszty_operacyjne + totals["PPE"] + kaucja_gir_sum + kaucja_dw_sum
    unass_koszty = unassigned["KP"] + unassigned["KBB"] + unassigned["KSB"] + unassigned["KSP"] + unassigned["PPE"]
    return {
        "przychody": round(totals["PZS"], 2),
        "podatek": round(totals["PPE"], 2),
        "kp": round(totals["KP"], 2),
        "kbb": round(totals["KBB"], 2),
        "ksb": round(totals["KSB"], 2),
        "ksp": round(totals["KSP"], 2),
        "kaucja_gir": round(kaucja_gir_sum, 2),
        "kaucja_dw": round(kaucja_dw_sum, 2),
        "koszty_operacyjne": round(koszty_operacyjne, 2),
        "koszty_full": round(koszty_full, 2),
        # iter94c: informacyjnie - nie wliczane do wyniku
        "unassigned_revenue": round(unassigned["PZS"], 2),
        "unassigned_costs": round(unass_koszty, 2),
        "unassigned_by_category": {
            "PZS": round(unassigned["PZS"], 2),
            "KP": round(unassigned["KP"], 2),
            "KBB": round(unassigned["KBB"], 2),
            "KSB": round(unassigned["KSB"], 2),
            "KSP": round(unassigned["KSP"], 2),
            "PPE": round(unassigned["PPE"], 2),
        },
    }



@router.get("/finance/sprzedaz")
async def sprzedaz(
    year: int = Query(...),
    month: Optional[int] = Query(None, ge=1, le=12),
    months: Optional[str] = Query(None, description="CSV list of months to include, np. '1,2,3,7'. Nadpisuje 'month' gdy podane."),
    current_user: dict = Depends(get_current_admin),
):
    """Buduje tabele Sprzedaz per budowa - identycznie jak w Excelu Sprzedaż.

    iter94: 'months' pozwala wybrac konkretne miesiace do zsumowania
    (np. wyklucz sierpien-listopad urlopowe). Priorytet: months > month > caly rok.
    """
    months_list: Optional[list] = None
    if months:
        try:
            months_list = sorted({int(m.strip()) for m in months.split(",") if m.strip() and 1 <= int(m.strip()) <= 12})
            if not months_list:
                months_list = None
        except (ValueError, TypeError):
            months_list = None
    data = await _compute_sprzedaz_data(year, month, months_list=months_list)
    return {"year": data["year"], "rows": data["rows"], "totals": data["totals"],
             "unassigned": data.get("unassigned", {})}



