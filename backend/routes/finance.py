"""Finanse - bilans firmowy z Rachunkiem wynikow i Sprzedaza per budowa.

Struktura zgodna z Excel "Bilans 2026 nowy poprawny":
- KP (Koszty Pracownikow): wynagrodzenia, ZUS, wynagr. na stawkach
- KBB (Koszty Bezposrednie Budowy): materialy, najmy, podwyk., transport
- KSB (Koszty Stale Bezposrednie): paliwa, samochody, odziez, sprzet
- KSP (Koszty Stale Posrednie): biuro, ksiegowosc, opl.bankowe
- PZS (Przychody Sprzedazy), PPE (Podatek PPE), PV (Podatek VAT)
- G (Godziny przepracowane)

Logika obliczen:
- SUMIFS(zapisy.netto, zapisy.kod_kosztu, KAT, zapisy.miesiac, MM, zapisy.budowa?, B)
- Kaucja GIR = 2% z (przychod budowy GIR), Kaucja DW = 2% z (przychod budowy DW)
- WYNIK NETTO = Przychody - Koszty + Podatek - KGIR - KDW
- SPRZEDAZ per budowa: marża I, II, III z alokacją kosztów slawkowych pro-rata
"""
import logging
import uuid
import httpx
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from datetime import datetime
from typing import Optional, List

# === Globalny scheduler dla cron jobow z biezacym uzerem systemowym ===
SYSTEM_USER = {"sub": "cron_system", "role": "admin"}

from pydantic import BaseModel, Field

from database import db
from auth import get_current_admin
from audit_log import log_audit, soft_delete, soft_delete_filter
from period_lock import assert_period_open, parse_date_to_period

router = APIRouter()
logger = logging.getLogger(__name__)


# ===== GUS / White List Ministry of Finance =====

@router.get("/finance/gus-lookup/{nip}")
async def gus_lookup(nip: str, _user: dict = Depends(get_current_admin)):
    """Pobiera dane podmiotu z bialej listy podatnikow VAT (Ministerstwo Finansow).
    API: https://wl-api.mf.gov.pl/api/search/nip/{nip}?date=YYYY-MM-DD
    Bez kluczy. Limit ~10 zapytan/min na IP."""
    nip_clean = "".join(ch for ch in nip if ch.isdigit())
    if len(nip_clean) != 10:
        raise HTTPException(400, "Nieprawidlowy NIP - oczekiwano 10 cyfr")
    today = datetime.now().strftime("%Y-%m-%d")
    url = f"https://wl-api.mf.gov.pl/api/search/nip/{nip_clean}?date={today}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Blad polaczenia z biala lista: {e}")
    if r.status_code == 400:
        raise HTTPException(400, "Bialy List odrzucil zapytanie (sprawdz NIP)")
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"Bialy List HTTP {r.status_code}")
    data = r.json() or {}
    subject = ((data.get("result") or {}).get("subject")) or None
    if not subject:
        raise HTTPException(404, f"NIP {nip_clean} nie istnieje w bialej liscie podatnikow")
    name = subject.get("name", "")
    address = subject.get("workingAddress") or subject.get("residenceAddress") or ""
    full = name
    if address:
        full = f"{name}, {address}"
    full = f"{full}, NIP: {nip_clean}".strip(", ")
    return {
        "nip": nip_clean,
        "name": name,
        "address": address,
        "regon": subject.get("regon") or "",
        "krs": subject.get("krs") or "",
        "status": subject.get("statusVat") or "",
        "formatted": full,  # gotowy tekst do wstawienia w pole `zamawiajacy`
    }


# iter95z: Lista zapisanych kontrahentow (dla autocomplete w nowej budowie)

@router.get("/finance/kontrahenci")
async def get_kontrahenci(_user: dict = Depends(get_current_admin)):
    """Zwraca unikalne wpisy kontrahentow uzytych w finance_budowy (pola zamawiajacy + wykonawca).

    Frontend uzywa do listy rozwijanej zeby nie wpisywac NIP-u kazdorazowo dla
    znanego kontrahenta.
    """
    seen = set()
    rows = []
    cursor = db.finance_budowy.find(
        {"$or": [
            {"zamawiajacy": {"$exists": True, "$ne": ""}},
            {"wykonawca": {"$exists": True, "$ne": ""}},
        ]},
        {"_id": 0, "zamawiajacy": 1, "wykonawca": 1},
    )
    async for d in cursor:
        for field, kind in (("zamawiajacy", "zamawiajacy"), ("wykonawca", "wykonawca")):
            text = (d.get(field) or "").strip()
            if not text:
                continue
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
            # parsuj nip z 'NIP: 1234567890' na koncu
            import re
            m = re.search(r"NIP:?\s*(\d{10})", text)
            nip = m.group(1) if m else None
            # nazwa = czesc przed pierwszym przecinkiem
            name = text.split(",", 1)[0].strip()
            rows.append({
                "name": name,
                "nip": nip,
                "text": text,
                "kind": kind,
            })
    rows.sort(key=lambda x: x["name"].upper())
    return {"rows": rows}



# ============= KODY (seed z Excela Kody!B2-B34) =============
# Kazdy kod ma: id (skrot uzywany w UI), nazwa, kategoria (PZS/PPE/PV/G/KP/KBB/KSB/KSP)
KODY_SEED = [
    # Przychody i podatki
    {"id": "PZS", "name": "Przychody ze sprzedazy netto", "category": "PZS", "order": 1},
    {"id": "PZSV", "name": "Przychody ze sprzedazy VAT", "category": "PZSV", "order": 2},
    {"id": "PPE", "name": "Podatek PPE", "category": "PPE", "order": 3},
    {"id": "PV", "name": "Podatek VAT", "category": "PV", "order": 4},
    {"id": "G", "name": "Ilosc przepracowanych godzin", "category": "G", "order": 5},
    # KP - Koszty Pracownikow (Rachunek wynikow 19-22)
    {"id": "KP_WYNAGRODZENIA", "name": "Wynagrodzenia pracownikow budowy", "category": "KP", "order": 10},
    {"id": "KP_ZUS", "name": "ZUS pracownikow budowy", "category": "KP", "order": 11},
    {"id": "KP_STAWKI", "name": "Wynagrodzenia pracownikow na stawkach", "category": "KP", "order": 12},
    # KBB - Koszty Bezposrednie Budowy (R-W 23-37)
    {"id": "KBB_STAL", "name": "Stal + tracone", "category": "KBB", "order": 20},
    {"id": "KBB_BETON", "name": "Beton", "category": "KBB", "order": 21},
    {"id": "KBB_MURARSKIE", "name": "Murarskie + tracone", "category": "KBB", "order": 22},
    {"id": "KBB_POZOSTALE", "name": "Pozostale materialy", "category": "KBB", "order": 23},
    {"id": "KBB_SZALUNKI", "name": "Szalunki", "category": "KBB", "order": 24},
    {"id": "KBB_TRANSPORT", "name": "Transport", "category": "KBB", "order": 25},
    {"id": "KBB_MAT_SZAL", "name": "Materialy szalunkow traconych", "category": "KBB", "order": 26},
    {"id": "KBB_CZYSZCZENIE", "name": "Czyszczenie + uszkodzenia", "category": "KBB", "order": 27},
    {"id": "KBB_NAJEM_MASZYN", "name": "Najem maszyn", "category": "KBB", "order": 28},
    {"id": "KBB_NAJEM_DZWIGU", "name": "Najem dzwigu", "category": "KBB", "order": 29},
    {"id": "KBB_PODWYKONAWCY", "name": "Uslugi podwykonawcow", "category": "KBB", "order": 30},
    {"id": "KBB_KIEROWNIK", "name": "Najem kierownika", "category": "KBB", "order": 31},
    {"id": "KBB_POPRAWKOWE", "name": "Materialy poprawkowe", "category": "KBB", "order": 32},
    # KSB - Koszty Stale Bezposrednie (R-W 39-43)
    {"id": "KSB_ODZIEZ", "name": "Odziez i badania pracownikow", "category": "KSB", "order": 40},
    {"id": "KSB_AUTO", "name": "Koszty naprawy i ubezpieczenia samochodow", "category": "KSB", "order": 41},
    {"id": "KSB_PALIWA", "name": "Paliwa", "category": "KSB", "order": 42},
    {"id": "KSB_NAPRAWY_SPRZETU", "name": "Naprawy sprzetu", "category": "KSB", "order": 43},
    {"id": "KSB_HILTI", "name": "Najem Hilti", "category": "KSB", "order": 44},
    # KSP - Koszty Stale Posrednie (R-W 45-50)
    {"id": "KSP_BIURO", "name": "Artykuly biurowe i drukarnie", "category": "KSP", "order": 50},
    {"id": "KSP_SOFT", "name": "Oprogramowania i media", "category": "KSP", "order": 51},
    {"id": "KSP_BANK", "name": "Oplaty bankowe", "category": "KSP", "order": 52},
    {"id": "KSP_KSIEGOWOSC", "name": "Uslugi ksiegowe", "category": "KSP", "order": 53},
    {"id": "KSP_STAWKI", "name": "Koszty slawek", "category": "KSP", "order": 54},
    {"id": "KSP_UKLADY", "name": "Koszty ukladow", "category": "KSP", "order": 55},
]
KAUCJA_PROCENT = 0.02  # 2% dla GIR i DW (z Kody!H15, I15)


async def ensure_kody_seed():
    """Zapewnia ze kolekcja finance_kody zawiera wszystkie kody. Wywolywane przy startup."""
    existing = await db.finance_kody.find({}, {"_id": 0, "id": 1}).to_list(length=None)
    existing_ids = {k["id"] for k in existing}
    new_kody = [k for k in KODY_SEED if k["id"] not in existing_ids]
    if new_kody:
        await db.finance_kody.insert_many(new_kody)
        logger.info(f"[finance] seeded {len(new_kody)} kody")


# ============= MODELS =============
class BudowaCreate(BaseModel):
    name: str
    code: Optional[str] = None
    show_in_hours: bool = True  # default TRUE - admin chce zwykle przypisywac pracownikow
    has_budget: bool = True  # iter93: czy budowa ma byc widoczna w module Budzet
    is_gir: bool = False
    kaucja_gir_pct: Optional[float] = 2.0  # domyslnie 2%, ale admin moze zmienic
    is_dw: bool = False
    kaucja_dw_pct: Optional[float] = 2.0
    koszt_budowy_pct: Optional[float] = 0.0  # % do kolumny J w kosztorysie (G * koszt_budowy_pct)
    notes: Optional[str] = None
    # Dane do generowania protokolu miesiecznego
    zamawiajacy: Optional[str] = None
    umowa_nr: Optional[str] = None
    umowa_data: Optional[str] = None  # YYYY-MM-DD lub free text "15.09.2025 + ANEKS NR 1"
    wykonawca: Optional[str] = "FEGRRO SP. Z O.O. NIP: 589-206-61-74"
    color: Optional[str] = None  # iter95y: hex kolor np. "#3F5235" - uzywany w tabeli godzin


class BudowaUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    show_in_hours: Optional[bool] = None
    has_budget: Optional[bool] = None  # iter93
    is_gir: Optional[bool] = None
    kaucja_gir_pct: Optional[float] = None
    is_dw: Optional[bool] = None
    kaucja_dw_pct: Optional[float] = None
    koszt_budowy_pct: Optional[float] = None
    notes: Optional[str] = None
    zamawiajacy: Optional[str] = None
    umowa_nr: Optional[str] = None
    umowa_data: Optional[str] = None
    wykonawca: Optional[str] = None
    color: Optional[str] = None  # iter95y


class ZapisCreate(BaseModel):
    date: str  # YYYY-MM-DD - data sprzedazy/wystawienia
    kontrahent: Optional[str] = None
    netto: float
    brutto: Optional[float] = None
    kod_id: str  # z finance_kody (np. KBB_BETON, PZS, KP_WYNAGRODZENIA)
    budowa_id: Optional[str] = None  # finance_budowy.id - jezeli koszt budowy
    budget_line_id: Optional[str] = None  # przypisanie do konkretnej pozycji budzetu
    nr_faktury: Optional[str] = None
    pozycja_nazwa: Optional[str] = None
    notes: Optional[str] = None
    is_invoice: Optional[bool] = False
    is_income: Optional[bool] = False


class ZapisUpdate(BaseModel):
    date: Optional[str] = None
    kontrahent: Optional[str] = None
    netto: Optional[float] = None
    brutto: Optional[float] = None
    kod_id: Optional[str] = None
    budowa_id: Optional[str] = None
    budget_line_id: Optional[str] = None
    nr_faktury: Optional[str] = None
    pozycja_nazwa: Optional[str] = None
    notes: Optional[str] = None


class InvoiceUpdate(BaseModel):
    """Aktualizacja naglowka faktury - admin moze przypisac kod_id/budowa_id/notes."""
    kod_id: Optional[str] = None
    budowa_id: Optional[str] = None
    notes: Optional[str] = None
    # Pozwalamy tez na 'unassign' poprzez przeslanie None - rozni sie od exclude_unset
    clear_kod: Optional[bool] = False
    clear_budowa: Optional[bool] = False


# ============= KODY =============
class KodCreate(BaseModel):
    """Admin tworzy nowy kod kosztowy w danej kategorii (KP/KBB/KSB/KSP/G/PZS/PZSV/PV/PPE)."""
    id: str  # unikalny string ID, np. "KSB_TELEFONY" lub auto-generowany
    name: str
    category: str  # KP/KBB/KSB/KSP/G/PZS/PZSV/PV/PPE
    order: Optional[int] = 100


class KodUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    order: Optional[int] = None


@router.get("/finance/kody")
async def list_kody(current_user: dict = Depends(get_current_admin)):
    await ensure_kody_seed()
    rows = await db.finance_kody.find({}, {"_id": 0}).sort("order", 1).to_list(length=None)
    return {"rows": rows}


@router.post("/finance/kody")
async def create_kod(payload: KodCreate, current_user: dict = Depends(get_current_admin)):
    valid_cats = ["PZS", "PZSV", "PPE", "PV", "G", "KP", "KBB", "KSB", "KSP"]
    if payload.category not in valid_cats:
        raise HTTPException(status_code=400, detail=f"Nieprawidlowa kategoria. Dostepne: {valid_cats}")
    kid = payload.id.strip().upper().replace(" ", "_")
    if not kid:
        raise HTTPException(status_code=400, detail="ID kodu nie moze byc puste")
    existing = await db.finance_kody.find_one({"id": kid})
    if existing:
        raise HTTPException(status_code=400, detail=f"Kod o ID '{kid}' juz istnieje")
    doc = {
        "id": kid,
        "name": payload.name.strip(),
        "category": payload.category,
        "order": payload.order or 999,
        "is_custom": True,  # flaga: utworzony przez admina, nie z seed
        "created_at": datetime.now().isoformat(),
        "created_by": current_user["sub"],
    }
    await db.finance_kody.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/finance/kody/{kod_id}")
async def update_kod(kod_id: str, payload: KodUpdate, current_user: dict = Depends(get_current_admin)):
    existing = await db.finance_kody.find_one({"id": kod_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Kod nie znaleziony")
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "category" in upd:
        valid_cats = ["PZS", "PZSV", "PPE", "PV", "G", "KP", "KBB", "KSB", "KSP"]
        if upd["category"] not in valid_cats:
            raise HTTPException(status_code=400, detail=f"Nieprawidlowa kategoria. Dostepne: {valid_cats}")
        # Update kod_category w istniejacych zapisach/invoices
        await db.finance_zapisy.update_many({"kod_id": kod_id}, {"$set": {"kod_category": upd["category"]}})
        await db.finance_invoices.update_many({"kod_id": kod_id}, {"$set": {"kod_category": upd["category"]}})
    upd["updated_at"] = datetime.now().isoformat()
    upd["updated_by"] = current_user["sub"]
    await db.finance_kody.update_one({"id": kod_id}, {"$set": upd})
    return {"message": "Zaktualizowano"}


@router.delete("/finance/kody/{kod_id}")
async def delete_kod(kod_id: str, current_user: dict = Depends(get_current_admin)):
    existing = await db.finance_kody.find_one({"id": kod_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Kod nie znaleziony")
    if not existing.get("is_custom"):
        raise HTTPException(status_code=400,
                            detail="Mozna usunac tylko kody dodane recznie (is_custom). Systemowe kody (PZS, KP_WYNAGRODZENIA itd.) sa stale.")
    # Czy sa zapisy/faktury z tym kodem?
    z_count = await db.finance_zapisy.count_documents({"kod_id": kod_id})
    i_count = await db.finance_invoices.count_documents({"kod_id": kod_id})
    if z_count + i_count > 0:
        raise HTTPException(status_code=400,
                            detail=f"Nie mozna usunac - {z_count} zapisow i {i_count} faktur uzywa tego kodu. Najpierw przepisz je na inny kod.")
    await db.finance_kody.delete_one({"id": kod_id})
    return {"message": "Usunieto"}


# ============= BUDOWY (finansowe, niezalezne od sites) =============
@router.post("/finance/budowy/import-from-sites")
async def import_budowy_from_sites(current_user: dict = Depends(get_current_admin)):
    """Jednorazowy import budow z `construction_sites` ktore NIE maja jeszcze
    powiazanego rekordu w `finance_budowy` (po `finance_budowa_id`).

    Tworzy `finance_budowy` z `show_in_hours=true` i ustawia link wsteczny.
    Kategorie inne niz 'budowa' (np. 'biuro') sa pomijane.
    """
    sites = await db.construction_sites.find({}, {"_id": 0}).to_list(length=None)
    created = 0
    skipped = 0
    for s in sites:
        if s.get("finance_budowa_id"):
            skipped += 1
            continue
        if (s.get("category") or "budowa") != "budowa":
            skipped += 1
            continue
        # Czy istnieje budowa o tej samej nazwie?
        existing = await db.finance_budowy.find_one({"name": s["name"]}, {"_id": 0, "id": 1})
        if existing:
            await db.construction_sites.update_one(
                {"id": s["id"]}, {"$set": {"finance_budowa_id": existing["id"]}}
            )
            skipped += 1
            continue
        bid = str(uuid.uuid4())
        await db.finance_budowy.insert_one({
            "id": bid,
            "name": s["name"],
            "code": "",
            "show_in_hours": True,
            "is_gir": False,
            "is_dw": False,
            "notes": "Zaimportowane z tabeli godzin",
            "is_archived": False,
            "construction_site_id": s["id"],
            "created_at": datetime.now().isoformat(),
            "created_by": current_user["sub"],
        })
        await db.construction_sites.update_one(
            {"id": s["id"]}, {"$set": {"finance_budowa_id": bid}}
        )
        created += 1
    return {"created": created, "skipped": skipped, "total_sites": len(sites)}


@router.post("/finance/sync-to-sites")
async def sync_finance_to_sites(current_user: dict = Depends(get_current_admin)):
    """iter95ci/cj/ck: Pelna synchronizacja finance_budowy <-> construction_sites.

    1. Dla aktywnych finance_budowy: utworz brakujace construction_sites lub zaktualizuj is_active
    2. Dla archiwalnych/usunietych finance_budowy: usun powiazane construction_sites (orphans)
    3. Zwraca licznik: created, updated, removed, total

    Uzywaj kiedy panel Brygadzisty pokazuje budowy ktorych juz nie ma w Finansach,
    lub brakuje nowo dodanych.
    """
    # 1. Aktywne budowy (nie archived, nie deleted)
    aktywne = await db.finance_budowy.find(
        {"is_archived": {"$ne": True}, **soft_delete_filter()},
        {"_id": 0, "id": 1, "name": 1, "color": 1, "show_in_hours": 1},
    ).to_list(length=None)
    created = 0
    updated = 0
    for b in aktywne:
        is_active = bool(b.get("show_in_hours"))
        existing = await db.construction_sites.find_one(
            {"finance_budowa_id": b["id"]}, {"_id": 0, "id": 1, "is_active": 1, "name": 1},
        )
        if existing:
            patch = {}
            if existing.get("is_active") != is_active:
                patch["is_active"] = is_active
            if existing.get("name") != b["name"]:
                patch["name"] = b["name"]
            if patch:
                await db.construction_sites.update_one({"id": existing["id"]}, {"$set": patch})
                updated += 1
            continue
        # Sprawdz match po nazwie (legacy linked)
        existing_by_name = await db.construction_sites.find_one(
            {"name": b["name"], "finance_budowa_id": {"$exists": False}},
            {"_id": 0, "id": 1},
        )
        if existing_by_name:
            await db.construction_sites.update_one(
                {"id": existing_by_name["id"]},
                {"$set": {"finance_budowa_id": b["id"], "is_active": is_active, "visible_to_foremen": True}},
            )
            updated += 1
            continue
        await db.construction_sites.insert_one({
            "id": str(uuid.uuid4()),
            "name": b["name"],
            "finance_budowa_id": b["id"],
            "is_active": is_active,
            "address": "",
            "category": "budowa",
            "visible_to_foremen": True,
            "color": b.get("color"),
            "created_at": datetime.now().isoformat(),
        })
        created += 1

    # 2. Usun orphans - sites ktore wskazuja na nieistniejaca/archived/deleted finance_budowa
    valid_ids = {b["id"] for b in aktywne}
    orphans = await db.construction_sites.find(
        {"finance_budowa_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "finance_budowa_id": 1, "name": 1},
    ).to_list(length=None)
    removed = 0
    for site in orphans:
        if site["finance_budowa_id"] not in valid_ids:
            await db.construction_sites.delete_one({"id": site["id"]})
            removed += 1

    return {"ok": True, "created": created, "updated": updated, "removed": removed, "total_active": len(aktywne)}




@router.get("/finance/budowy")
async def list_budowy(
    include_archived: bool = Query(False),
    has_budget: Optional[bool] = Query(None, description="iter93: filtr po has_budget"),
    current_user: dict = Depends(get_current_admin),
):
    q: dict = {**soft_delete_filter()} if include_archived else {**soft_delete_filter(), "$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}]}
    if has_budget is True:
        # Default = True dla starszych rekordow ktore nie maja flagi
        q["$and"] = [{"$or": [{"has_budget": {"$ne": False}}]}]
    elif has_budget is False:
        q["has_budget"] = False
    rows = await db.finance_budowy.find(q, {"_id": 0}).sort("name", 1).to_list(length=None)
    # iter95y: zapewnij ze color jest w odpowiedzi (None dla legacy bez tego pola)
    for r in rows:
        if "color" not in r:
            r["color"] = None
    return {"rows": rows}


@router.post("/finance/budowy")
async def create_budowa(payload: BudowaCreate, current_user: dict = Depends(get_current_admin)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nazwa nie moze byc pusta")
    exists = await db.finance_budowy.find_one({"name": name}, {"_id": 0, "id": 1})
    if exists:
        raise HTTPException(status_code=400, detail=f"Budowa '{name}' juz istnieje")
    bid = str(uuid.uuid4())
    doc = {
        "id": bid,
        "name": name,
        "code": payload.code or "",
        "show_in_hours": bool(payload.show_in_hours),
        "has_budget": bool(payload.has_budget),  # iter93
        "is_gir": bool(payload.is_gir),
        "kaucja_gir_pct": float(payload.kaucja_gir_pct if payload.kaucja_gir_pct is not None else 2.0),
        "is_dw": bool(payload.is_dw),
        "kaucja_dw_pct": float(payload.kaucja_dw_pct if payload.kaucja_dw_pct is not None else 2.0),
        "koszt_budowy_pct": float(payload.koszt_budowy_pct if payload.koszt_budowy_pct is not None else 0.0),
        "notes": payload.notes or "",
        "zamawiajacy": payload.zamawiajacy or "",
        "umowa_nr": payload.umowa_nr or "",
        "umowa_data": payload.umowa_data or "",
        "wykonawca": payload.wykonawca or "FEGRRO SP. Z O.O. NIP: 589-206-61-74",
        "color": payload.color,  # iter95y
        "is_archived": False,
        "created_at": datetime.now().isoformat(),
        "created_by": current_user["sub"],
    }
    await db.finance_budowy.insert_one(doc)
    # iter95cj: ZAWSZE sync do construction_sites (przy show_in_hours=False site jest is_active=False).
    # Wczesniej (iter95ci): sync tylko gdy show_in_hours=True. To powodowalo ze budowy dodane
    # bez tego checkboxa nie istnialy w `construction_sites` -> panel Brygadzisty ich nie widzial.
    # Teraz zawsze tworzymy rekord ale ukrywamy go (is_active=False) gdy show_in_hours=False.
    await _sync_to_sites(bid, name, color=payload.color, is_active=bool(payload.show_in_hours))
    doc.pop("_id", None)
    await log_audit(entity="finance_budowa", entity_id=bid, action="create", user=current_user, new=doc)
    return doc


@router.put("/finance/budowy/{budowa_id}")
async def update_budowa(
    budowa_id: str,
    payload: BudowaUpdate,
    current_user: dict = Depends(get_current_admin),
):
    existing = await db.finance_budowy.find_one({"id": budowa_id, **soft_delete_filter()}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Budowa nie znaleziona")
    # iter95y: uzywamy exclude_unset zeby zachowac explicit None (np. wyczyszczenie color)
    raw = payload.model_dump(exclude_unset=True)
    # Pola ktore moga byc None na czysto (clearable)
    clearable = {"color"}
    upd = {k: v for k, v in raw.items() if v is not None or k in clearable}
    if "name" in upd and upd["name"] is not None:
        upd["name"] = upd["name"].strip()
    upd["updated_at"] = datetime.now().isoformat()
    upd["updated_by"] = current_user["sub"]
    await db.finance_budowy.update_one({"id": budowa_id}, {"$set": upd})

    # iter95cj: zamiast remove/create przy toggle show_in_hours, uzywamy is_active.
    # Rekord zawsze istnieje (zachowuje polaczenia historyczne: przypisania brygadzistow,
    # godziny, sprzet) ale jest ukryty przy show_in_hours=False.
    new_show = upd.get("show_in_hours", existing.get("show_in_hours", False))
    old_show = existing.get("show_in_hours", False)
    new_name = upd.get("name", existing.get("name"))
    if new_show != old_show or "name" in upd:
        # Sync z toggle is_active = new_show
        await _sync_to_sites(budowa_id, new_name, color=upd.get("color", existing.get("color")), is_active=bool(new_show))
        if "name" in upd:
            await db.construction_sites.update_one(
                {"finance_budowa_id": budowa_id}, {"$set": {"name": new_name}}
            )
    # iter95y: propaguj kolor do sites zeby HoursTable mial dostep
    if "color" in upd:
        await db.construction_sites.update_one(
            {"finance_budowa_id": budowa_id}, {"$set": {"color": upd["color"]}}
        )
    new_doc = await db.finance_budowy.find_one({"id": budowa_id}, {"_id": 0})
    await log_audit(entity="finance_budowa", entity_id=budowa_id, action="update",
                    user=current_user, old=existing, new=new_doc)
    return {"message": "Zaktualizowano"}


@router.post("/finance/budowy/{budowa_id}/archive")
async def archive_budowa(budowa_id: str, current_user: dict = Depends(get_current_admin)):
    """Archiwizuje budowe w finansach. Dane zapisow zostaja. Usuwa z sites (lista godzin)."""
    old = await db.finance_budowy.find_one({"id": budowa_id, **soft_delete_filter()}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Budowa nie znaleziona")
    await db.finance_budowy.update_one(
        {"id": budowa_id},
        {"$set": {
            "is_archived": True,
            "show_in_hours": False,
            "archived_at": datetime.now().isoformat(),
            "archived_by": current_user["sub"],
        }},
    )
    await _remove_from_sites(budowa_id)
    new_doc = await db.finance_budowy.find_one({"id": budowa_id}, {"_id": 0})
    await log_audit(entity="finance_budowa", entity_id=budowa_id, action="update",
                    user=current_user, old=old, new=new_doc, extra={"reason": "archive"})
    return {"message": "Zarchiwizowano"}


@router.post("/finance/budowy/{budowa_id}/unarchive")
async def unarchive_budowa(budowa_id: str, current_user: dict = Depends(get_current_admin)):
    old = await db.finance_budowy.find_one({"id": budowa_id, **soft_delete_filter()}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Budowa nie znaleziona")
    await db.finance_budowy.update_one(
        {"id": budowa_id},
        {"$set": {"is_archived": False, "archived_at": None}},
    )
    # iter95cj: przywroc budowe do construction_sites z is_active = show_in_hours
    # (archive usuwa rekord, unarchive musi go odtworzyc - inaczej brygadzista nie widzi)
    show_in_hours = bool(old.get("show_in_hours"))
    await _sync_to_sites(
        budowa_id,
        old.get("name"),
        color=old.get("color"),
        is_active=show_in_hours,
    )
    new_doc = await db.finance_budowy.find_one({"id": budowa_id}, {"_id": 0})
    await log_audit(entity="finance_budowa", entity_id=budowa_id, action="update",
                    user=current_user, old=old, new=new_doc, extra={"reason": "unarchive"})
    return {"message": "Przywrocono"}


@router.delete("/finance/budowy/{budowa_id}")
async def delete_budowa(budowa_id: str, current_user: dict = Depends(get_current_admin)):
    """iter95bo: soft-delete. Wymaga 0 aktywnych zapisow finansowych."""
    cnt = await db.finance_zapisy.count_documents({"budowa_id": budowa_id, **soft_delete_filter()})
    if cnt > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Nie mozna usunac - jest {cnt} aktywnych zapisow finansowych. Zarchiwizuj zamiast usuwac.",
        )
    deleted = await soft_delete("finance_budowy", budowa_id, current_user, entity_label="finance_budowa")
    if not deleted:
        raise HTTPException(status_code=404, detail="Budowa nie znaleziona")
    await _remove_from_sites(budowa_id)
    return {"message": "Usunieto (mozna przywrocic)"}


async def _sync_to_sites(budowa_id: str, name: str, color: Optional[str] = None, is_active: bool = True):
    """Dodaje budowe do construction_sites jezeli jeszcze nie istnieje (po finance_budowa_id).

    iter95cj: is_active kontroluje czy budowa jest widoczna dla brygadzistow.
    Pozwala to ZAWSZE utworzyc rekord (zeby polaczenie istnialo), a kontrolowac
    widocznosc przez `show_in_hours` z finance_budowy.
    """
    existing = await db.construction_sites.find_one(
        {"finance_budowa_id": budowa_id}, {"_id": 0, "id": 1}
    )
    if existing:
        # Update is_active gdy istniał (np. zmiana show_in_hours na false)
        await db.construction_sites.update_one(
            {"id": existing["id"]}, {"$set": {"is_active": is_active}}
        )
        return
    site_doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "finance_budowa_id": budowa_id,  # link
        "is_active": is_active,
        "address": "",
        "category": "budowa",
        "visible_to_foremen": True,
        "color": color,  # iter95y
        "created_at": datetime.now().isoformat(),
    }
    await db.construction_sites.insert_one(site_doc)


# Sync gdy show_in_hours zmieni sie True->True i przyszla zmiana koloru -> wywoluje sie z PUT poprzez bezposredni update na sites
async def _sync_color_to_sites(budowa_id: str, color: Optional[str]):
    await db.construction_sites.update_one(
        {"finance_budowa_id": budowa_id}, {"$set": {"color": color}}
    )


async def _remove_from_sites(budowa_id: str):
    """Usuwa wpis z construction_sites powiazany z budowa_id (jezeli istnieje)."""
    await db.construction_sites.delete_one({"finance_budowa_id": budowa_id})


# ============= ZAPISY (dziennik ksiegowy) =============
@router.get("/finance/zapisy")
async def list_zapisy(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    budowa_id: Optional[str] = Query(None),
    kod_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_admin),
):
    q = {**soft_delete_filter()}
    if year is not None and month is not None:
        start = f"{year:04d}-{month:02d}-01"
        end = f"{year:04d}-{month:02d}-31"
        q["date"] = {"$gte": start, "$lte": end}
    elif year is not None:
        q["date"] = {"$gte": f"{year:04d}-01-01", "$lte": f"{year:04d}-12-31"}
    if budowa_id:
        q["budowa_id"] = budowa_id
    if kod_id:
        q["kod_id"] = kod_id
    rows = await db.finance_zapisy.find(q, {"_id": 0}).sort("date", -1).to_list(length=None)
    return {"rows": rows, "total": len(rows)}


@router.post("/finance/zapisy")
async def create_zapis(payload: ZapisCreate, current_user: dict = Depends(get_current_admin)):
    # walidacje
    try:
        d = datetime.strptime(payload.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Nieprawidlowy format daty (YYYY-MM-DD)")
    # iter95bp: blokada zamknietego okresu
    await assert_period_open(d.year, d.month, action="dodawac")
    kod = await db.finance_kody.find_one({"id": payload.kod_id}, {"_id": 0, "id": 1, "category": 1})
    if not kod:
        raise HTTPException(status_code=400, detail=f"Nieznany kod kosztu: {payload.kod_id}")
    if payload.budowa_id:
        bud = await db.finance_budowy.find_one({"id": payload.budowa_id}, {"_id": 0, "id": 1})
        if not bud:
            raise HTTPException(status_code=400, detail="Nieznana budowa")
    # Walidacja budget_line_id (opcjonalna)
    if payload.budget_line_id:
        bl = await db.budget_lines.find_one({"id": payload.budget_line_id}, {"_id": 0, "budowa_id": 1})
        if not bl:
            raise HTTPException(status_code=400, detail="Nieznana pozycja budzetu")
    zid = str(uuid.uuid4())
    doc = {
        "id": zid,
        "date": payload.date,
        "year": d.year,
        "month": d.month,
        "kontrahent": (payload.kontrahent or "").strip(),
        "netto": float(payload.netto),
        "brutto": float(payload.brutto) if payload.brutto is not None else float(payload.netto),
        "kod_id": payload.kod_id,
        "kod_category": kod["category"],
        "budowa_id": payload.budowa_id,
        "budget_line_id": payload.budget_line_id,
        "nr_faktury": (payload.nr_faktury or "").strip(),
        "pozycja_nazwa": (payload.pozycja_nazwa or "").strip(),
        "notes": (payload.notes or "").strip(),
        "source": "manual",
        "created_at": datetime.now().isoformat(),
        "created_by": current_user["sub"],
    }
    await db.finance_zapisy.insert_one(doc)
    doc.pop("_id", None)
    await log_audit(entity="finance_zapis", entity_id=zid, action="create", user=current_user, new=doc)
    return doc


@router.put("/finance/zapisy/{zapis_id}")
async def update_zapis(zapis_id: str, payload: ZapisUpdate, current_user: dict = Depends(get_current_admin)):
    existing = await db.finance_zapisy.find_one({"id": zapis_id, **soft_delete_filter()}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Zapis nie znaleziony")
    # iter95bp: blokada zamknietego okresu (sprawdzamy STAR_DATE oraz NOW_DATE jesli zmieniana)
    old_y, old_m = parse_date_to_period(existing.get("date") or "")
    if old_y and old_m:
        await assert_period_open(old_y, old_m, action="edytowac")
    raw = payload.model_dump(exclude_unset=True)
    # budget_line_id moze byc explicitnie wyzerowany (None) - reszta None traktowana jak brak zmiany
    upd = {k: v for k, v in raw.items() if v is not None or k == "budget_line_id"}
    if "budget_line_id" in raw and raw["budget_line_id"]:
        bl = await db.budget_lines.find_one({"id": raw["budget_line_id"]}, {"_id": 0, "id": 1})
        if not bl:
            raise HTTPException(status_code=400, detail="Nieznana pozycja budzetu")
    if "date" in upd:
        try:
            d = datetime.strptime(upd["date"], "%Y-%m-%d")
            upd["year"] = d.year
            upd["month"] = d.month
        except ValueError:
            raise HTTPException(status_code=400, detail="Nieprawidlowa data")
    if "kod_id" in upd:
        kod = await db.finance_kody.find_one({"id": upd["kod_id"]}, {"_id": 0, "category": 1})
        if not kod:
            raise HTTPException(status_code=400, detail="Nieznany kod")
        upd["kod_category"] = kod["category"]
    if "netto" in upd:
        upd["netto"] = float(upd["netto"])
    if "brutto" in upd:
        upd["brutto"] = float(upd["brutto"])
    upd["updated_at"] = datetime.now().isoformat()
    upd["updated_by"] = current_user["sub"]
    await db.finance_zapisy.update_one({"id": zapis_id}, {"$set": upd})
    new_doc = await db.finance_zapisy.find_one({"id": zapis_id}, {"_id": 0})
    await log_audit(entity="finance_zapis", entity_id=zapis_id, action="update",
                    user=current_user, old=existing, new=new_doc)
    return {"message": "Zaktualizowano"}


@router.delete("/finance/zapisy/{zapis_id}")
async def delete_zapis(zapis_id: str, current_user: dict = Depends(get_current_admin)):
    # iter95bp: blokada zamknietego okresu
    existing = await db.finance_zapisy.find_one({"id": zapis_id, **soft_delete_filter()}, {"_id": 0, "date": 1})
    if existing:
        y, m = parse_date_to_period(existing.get("date") or "")
        if y and m:
            await assert_period_open(y, m, action="usuwac")
    # iter95bo: soft-delete zamiast fizycznego usuwania - sled w audit_log
    deleted = await soft_delete("finance_zapisy", zapis_id, current_user, entity_label="finance_zapis")
    if not deleted:
        raise HTTPException(status_code=404, detail="Zapis nie znaleziony")
    return {"message": "Usunieto (mozna przywrocic z panelu Audit)"}


# ============= FAKTURY (naglowki) =============
@router.get("/finance/invoices")
async def list_invoices(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    current_user: dict = Depends(get_current_admin),
):
    """Zwraca naglowki faktur + ich pozycje + zapisy standalone (manual bez parent_invoice_id).

    Wszystkie wpisy zwracane jako jednolita lista 'rows' posortowana po dacie malejaco
    z polem 'is_invoice' (True/False) i 'positions' (gdy is_invoice=True).
    """
    q_inv: dict = {**soft_delete_filter()}
    q_zap: dict = {**soft_delete_filter()}
    if year is not None and month is not None:
        start = f"{year:04d}-{month:02d}-01"
        end = f"{year:04d}-{month:02d}-31"
        q_inv["date"] = {"$gte": start, "$lte": end}
        q_zap["date"] = {"$gte": start, "$lte": end}
    elif year is not None:
        q_inv["date"] = {"$gte": f"{year:04d}-01-01", "$lte": f"{year:04d}-12-31"}
        q_zap["date"] = {"$gte": f"{year:04d}-01-01", "$lte": f"{year:04d}-12-31"}

    invoices = await db.finance_invoices.find(q_inv, {"_id": 0}).sort("date", -1).to_list(length=None)
    inv_ids = [i["id"] for i in invoices]
    # Pozycje z faktur (parent_invoice_id w inv_ids)
    positions = await db.finance_zapisy.find(
        {"parent_invoice_id": {"$in": inv_ids}, **soft_delete_filter()}, {"_id": 0}
    ).to_list(length=None)
    # Standalone zapisy (bez parent_invoice_id) w okresie
    standalone_q = {**q_zap, "$or": [{"parent_invoice_id": None}, {"parent_invoice_id": {"$exists": False}}]}
    standalone = await db.finance_zapisy.find(standalone_q, {"_id": 0}).to_list(length=None)

    pos_by_inv: dict = {}
    for p in positions:
        pos_by_inv.setdefault(p.get("parent_invoice_id"), []).append(p)

    rows = []
    for inv in invoices:
        inv_positions = sorted(pos_by_inv.get(inv["id"], []),
                                key=lambda z: z.get("pozycja_nazwa", ""))
        # Obliczamy "pozostalo": netto faktury - suma przypisanych pozycji
        assigned_positions_sum = sum(
            float(p.get("netto") or 0) for p in inv_positions if p.get("kod_id")
        )
        remainder = round(float(inv.get("netto") or 0) - assigned_positions_sum, 2)
        rows.append({
            **inv,
            "is_invoice": True,
            "positions": inv_positions,
            "assigned_positions_sum": round(assigned_positions_sum, 2),
            "remainder_netto": remainder,
        })
    for z in standalone:
        rows.append({**z, "is_invoice": False, "positions": []})
    rows.sort(key=lambda r: r.get("date") or "", reverse=True)
    return {"rows": rows, "total": len(rows)}


@router.put("/finance/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, payload: InvoiceUpdate,
                          current_user: dict = Depends(get_current_admin)):
    existing = await db.finance_invoices.find_one({"id": invoice_id, **soft_delete_filter()}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Faktura nie znaleziona")
    upd: dict = {}
    if payload.clear_kod:
        upd["kod_id"] = None
        upd["kod_category"] = None
    elif payload.kod_id is not None:
        kod = await db.finance_kody.find_one({"id": payload.kod_id}, {"_id": 0, "category": 1})
        if not kod:
            raise HTTPException(status_code=400, detail="Nieznany kod")
        upd["kod_id"] = payload.kod_id
        upd["kod_category"] = kod["category"]
    if payload.clear_budowa:
        upd["budowa_id"] = None
    elif payload.budowa_id is not None:
        bud = await db.finance_budowy.find_one({"id": payload.budowa_id}, {"_id": 0, "id": 1})
        if not bud:
            raise HTTPException(status_code=400, detail="Nieznana budowa")
        upd["budowa_id"] = payload.budowa_id
    if payload.notes is not None:
        upd["notes"] = payload.notes
    upd["updated_at"] = datetime.now().isoformat()
    upd["updated_by"] = current_user["sub"]
    await db.finance_invoices.update_one({"id": invoice_id}, {"$set": upd})

    # iter95: Propagacja budowa_id z naglowka faktury do jej pozycji (finance_zapisy).
    # Budget allocations (kolumny N/O/P/Q i sprzedaz_budowa) odpytuja TYLKO finance_zapisy,
    # wiec bez tego przypisanie budowy na poziomie naglowka nie wplywalo na budzet.
    # Zasada: aktualizujemy TYLKO pozycje, ktore NIE maja wlasnego budowa_id
    # (None lub brak pola) - per-pozycyjne przypisania pozostawiamy nienaruszone.
    if "budowa_id" in upd:
        new_bid = upd["budowa_id"]
        await db.finance_zapisy.update_many(
            {
                "parent_invoice_id": invoice_id,
                "$or": [{"budowa_id": None}, {"budowa_id": {"$exists": False}}, {"budowa_id": ""}],
            },
            {"$set": {"budowa_id": new_bid, "updated_at": datetime.now().isoformat()}},
        )
    new_doc = await db.finance_invoices.find_one({"id": invoice_id}, {"_id": 0})
    await log_audit(entity="finance_invoice", entity_id=invoice_id, action="update",
                    user=current_user, old=existing, new=new_doc)
    return {"message": "Zaktualizowano"}


@router.post("/finance/backfill-invoice-budowa-to-positions")
async def backfill_invoice_budowa_to_positions(
    current_user: dict = Depends(get_current_admin),
):
    """iter95: Jednorazowy backfill - dla kazdej faktury (finance_invoices) z budowa_id,
    propaguje budowa_id do jej pozycji (finance_zapisy) tam, gdzie pozycja nie ma
    wlasnego budowa_id (None/brak/pusty string).

    Zwraca: {invoices_processed, positions_updated}.
    """
    invoices = await db.finance_invoices.find(
        {},
        {"_id": 0, "id": 1, "budowa_id": 1, "is_income": 1, "kod_id": 1},
    ).to_list(length=None)
    updated_total = 0
    income_fixed = 0
    for inv in invoices:
        bid = inv.get("budowa_id")
        is_inc = inv.get("is_income")
        # Propaguj budowa_id (jezeli ustawiona w naglowku)
        if bid:
            res = await db.finance_zapisy.update_many(
                {
                    "parent_invoice_id": inv["id"],
                    "$or": [{"budowa_id": None}, {"budowa_id": {"$exists": False}}, {"budowa_id": ""}],
                },
                {"$set": {"budowa_id": bid, "updated_at": datetime.now().isoformat()}},
            )
            updated_total += res.modified_count
        # Propaguj is_income (jezeli ustawione w naglowku) - naprawia stare zapisy bez is_income
        if is_inc is not None:
            res2 = await db.finance_zapisy.update_many(
                {
                    "parent_invoice_id": inv["id"],
                    "$or": [{"is_income": None}, {"is_income": {"$exists": False}}],
                },
                {"$set": {"is_income": is_inc}},
            )
            income_fixed += res2.modified_count
    return {
        "invoices_processed": len(invoices),
        "positions_updated": updated_total,
        "is_income_fixed": income_fixed,
    }


@router.delete("/finance/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, current_user: dict = Depends(get_current_admin)):
    """iter95bo: soft-delete naglowka faktury + KASKADA soft-delete pozycji."""
    deleted = await soft_delete("finance_invoices", invoice_id, current_user, entity_label="finance_invoice")
    if not deleted:
        raise HTTPException(status_code=404, detail="Faktura nie znaleziona")
    from datetime import timezone as _tz
    now = datetime.now(_tz.utc)
    res = await db.finance_zapisy.update_many(
        {"parent_invoice_id": invoice_id, "deleted_at": None},
        {"$set": {"deleted_at": now, "deleted_by": current_user.get("sub")}},
    )
    return {"message": "Usunieto (mozna przywrocic)", "positions_deleted": res.modified_count}


@router.post("/finance/reset-fakturownia-data")
async def reset_fakturownia_data(
    confirm: str = Query(..., description="Musi byc 'RESET' aby potwierdzic"),
    current_user: dict = Depends(get_current_admin),
):
    """JEDNORAZOWY reset: usuwa wszystkie faktury (naglowki) i pozycje z source=fakturownia.
    Pozostawia zapisy manualne. Po resecie nalezy ponownie zsynchronizowac z Fakturowni.
    """
    if confirm != "RESET":
        raise HTTPException(status_code=400, detail="Potwierdz: confirm=RESET")
    deleted_inv = await db.finance_invoices.delete_many({"source": "fakturownia"})
    deleted_zap = await db.finance_zapisy.delete_many({"source": "fakturownia"})
    return {
        "message": "Wyczyszczono dane Fakturowni",
        "invoices_deleted": deleted_inv.deleted_count,
        "positions_deleted": deleted_zap.deleted_count,
    }


# ============= TOGGLE PAYMENT STATUS (admin moze recznie oznaczyc faktura jako oplacona) =============
@router.patch("/finance/invoices/{invoice_id}/mark-paid")
async def toggle_invoice_paid(
    invoice_id: str,
    paid: bool = Query(True),
    _user: dict = Depends(get_current_admin),
):
    """Recznie oznacza faktura jako oplacona/nieoplacona w lokalnej bazie
    (nie wysyla zmiany do Fakturowni - to robi admin sam w panelu Fakturowni
    lub przez auto-sync ktory nadpisze).
    """
    inv = await db.finance_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Faktura nie znaleziona")
    today = datetime.now().date().isoformat()
    update = {"paid": paid, "payment_date": today if paid else None,
              "updated_at": datetime.now().isoformat()}
    await db.finance_invoices.update_one({"id": invoice_id}, {"$set": update})
    return {"ok": True, "invoice_id": invoice_id, "paid": paid}



# ============= SETTINGS (Fakturownia API key) =============
@router.get("/finance/settings")
async def get_finance_settings(current_user: dict = Depends(get_current_admin)):
    """Zwraca aktualne ustawienia Finansow (Fakturownia API key, status sync)."""
    doc = await db.finance_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    # NIE wysylamy pelnego klucza - tylko ostatnie 4 znaki + flag czy ustawiony
    key = doc.get("fakturownia_api_key") or ""
    return {
        "fakturownia_api_key_set": bool(key),
        "fakturownia_api_key_preview": ("****" + key[-4:]) if len(key) >= 4 else "",
        "fakturownia_domain": doc.get("fakturownia_domain", ""),
        "last_sync_at": doc.get("last_sync_at"),
        "last_sync_summary": doc.get("last_sync_summary"),
        "last_fakturownia_sync_at": doc.get("last_fakturownia_sync_at"),
        "last_fakturownia_sync_summary": doc.get("last_fakturownia_sync_summary"),
        "last_fakturownia_sync_status": doc.get("last_fakturownia_sync_status"),
        "last_fakturownia_sync_error": doc.get("last_fakturownia_sync_error"),
    }


class SettingsUpdate(BaseModel):
    fakturownia_api_key: Optional[str] = None
    fakturownia_domain: Optional[str] = None  # np. "mojafirma" -> mojafirma.fakturownia.pl


@router.put("/finance/settings")
async def update_finance_settings(
    payload: SettingsUpdate, current_user: dict = Depends(get_current_admin)
):
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    # Defensywnie czyscimy subdomene: user moze wpisac "mojafirma.fakturownia.pl/..." lub "https://..."
    # a my chcemy sama subdomene "mojafirma".
    if "fakturownia_domain" in upd and upd["fakturownia_domain"]:
        d = upd["fakturownia_domain"].strip().lower()
        d = d.replace("https://", "").replace("http://", "")
        d = d.split("/")[0]                       # usun ewentualna sciezke
        if d.endswith(".fakturownia.pl"):
            d = d[: -len(".fakturownia.pl")]
        upd["fakturownia_domain"] = d
    upd["updated_at"] = datetime.now().isoformat()
    upd["updated_by"] = current_user["sub"]
    await db.finance_settings.update_one(
        {"id": "main"}, {"$set": upd, "$setOnInsert": {"id": "main"}}, upsert=True
    )
    return {"message": "Zapisano ustawienia"}


# ============= AUTO-SYNC: GODZINY + WYPLATY -> ZAPISY =============
async def _do_sync_month(year: int, month: int, user_id: str = "system",
                          dry_run: bool = False) -> dict:
    """Synchronizuje godziny+wyplaty dla danego miesiaca. Wewnetrzna funkcja
    uzywana przez `/sync-current-month` i `/sync-all-months`.

    Jezeli `dry_run=True` - liczy wszystko ale NIE usuwa starych zapisow
    ani nie wstawia nowych. Uzywane do bannera "Niezgodnosc kosztu" w UI
    Finance, ktory pokazuje ile by sie wyplat policzylo PO sync.
    """
    start = f"{year:04d}-{month:02d}-01"
    end = f"{year:04d}-{month:02d}-31"

    # Mapowanie construction_site.id -> finance_budowy.id (przez finance_budowa_id)
    sites = await db.construction_sites.find(
        {"finance_budowa_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "finance_budowa_id": 1, "name": 1},
    ).to_list(length=None)
    site_to_bud = {s["id"]: s["finance_budowa_id"] for s in sites}
    if not site_to_bud:
        return {"year": year, "month": month, "g_zapisy": 0, "kp_zapisy": 0,
                "message": "Brak budow finansowych z linkiem"}

    pipeline_hours = [
        {"$match": {"work_date": {"$gte": start, "$lte": end}}},
        {"$group": {
            "_id": {"emp": "$employee_id", "site": "$site_id"},
            "hours": {"$sum": {"$convert": {"input": "$hours_worked",
                                              "to": "double", "onError": 0, "onNull": 0}}},
        }},
    ]
    hours_by_emp_bud: dict = {}
    hours_per_site: dict = {}
    hours_per_emp_full: dict = {}
    async for r in db.hour_entries.aggregate(pipeline_hours):
        emp = r["_id"].get("emp")
        site = r["_id"].get("site")
        h = float(r.get("hours") or 0)
        if not emp:
            continue
        hours_per_emp_full[emp] = hours_per_emp_full.get(emp, 0) + h
        bud_id = site_to_bud.get(site) if site else None
        if bud_id:
            hours_by_emp_bud[(emp, bud_id)] = hours_by_emp_bud.get((emp, bud_id), 0) + h
            hours_per_site[bud_id] = hours_per_site.get(bud_id, 0) + h

    emp_ids = list(hours_per_emp_full.keys())

    # Doloz pracownikow z payroll_record dla tego miesiaca BEZ godzin
    payroll_only_emp_ids = await db.payroll_records.distinct(
        "employee_id", {"year": year, "month": month, "employee_id": {"$nin": emp_ids}}
    )
    for eid in payroll_only_emp_ids:
        emp_ids.append(eid)
        hours_per_emp_full[eid] = 0.0

    # KLUCZOWE: Doloz tez wszystkich AKTYWNYCH pracownikow (zgodnie z logika /api/payroll).
    # Niektorzy maja fixed_salary lub driver z poprzedniego miesiaca (fallback)
    # i nie pojawiaja sie w payroll_records[year=Y,month=M] ale w UI Wyplaty maja niezerowa wyplate.
    month_start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        month_end_iso = f"{year:04d}-12-31T23:59:59"
    else:
        month_end_iso = f"{year:04d}-{month+1:02d}-01T00:00:00"
    active_emps_query = {
        "$and": [
            {"$or": [
                {"is_deleted": {"$exists": False}},
                {"is_deleted": False},
                {"deleted_at": {"$gte": month_start}},
            ]},
            {"$or": [
                {"created_at": {"$lte": month_end_iso}},
                {"created_at": {"$exists": False}},
            ]},
            {"$or": [
                {"is_archived": {"$exists": False}},
                {"is_archived": False},
                {"archived_at": {"$gte": month_start}},
            ]},
        ],
    }
    active_emp_ids = await db.employees.distinct("id", active_emps_query)
    for eid in active_emp_ids:
        if eid not in hours_per_emp_full:
            emp_ids.append(eid)
            hours_per_emp_full[eid] = 0.0

    payroll_recs = {}
    if emp_ids:
        recs = await db.payroll_records.find(
            {"year": year, "month": month, "employee_id": {"$in": emp_ids}}, {"_id": 0},
        ).to_list(length=None)
        payroll_recs = {r["employee_id"]: r for r in recs}

    # FALLBACK: dla pracownikow bez payroll_record w danym miesiacu - wez najnowszy WCZESNIEJSZY
    # (rate, fixed, bonus, driver, other_*). Identyczna logika co /api/payroll defaults_cache.
    missing_ids = [eid for eid in emp_ids if eid not in payroll_recs]
    if missing_ids:
        cursor = db.payroll_records.find(
            {"employee_id": {"$in": missing_ids},
              "$or": [
                  {"year": {"$lt": year}},
                  {"year": year, "month": {"$lt": month}},
              ]},
            {"_id": 0, "employee_id": 1, "year": 1, "month": 1,
              "rate": 1, "is_fixed_salary": 1, "fixed_salary_amount": 1,
              "bonus_zl": 1, "driver_zl": 1, "other_plus_zl": 1, "other_minus_zl": 1},
        ).sort([("year", -1), ("month", -1)])
        async for r in cursor:
            eid = r["employee_id"]
            if eid in payroll_recs:
                continue
            payroll_recs[eid] = {
                "rate": float(r.get("rate") or 0),
                "is_fixed_salary": bool(r.get("is_fixed_salary") or False),
                "fixed_salary_amount": float(r.get("fixed_salary_amount") or 0),
                # Bonusy/dodatki NIE sa kopiowane z poprzedniego miesiaca (one sa specyficzne miesiacowo)
                "bonus_zl": 0.0,
                "driver_zl": float(r.get("driver_zl") or 0),  # driver = stale przypisanie kierowcy
                "other_plus_zl": 0.0,
                "other_minus_zl": 0.0,
            }

    pen_rows = await db.penalties.find(
        {"year": year, "month": month, "employee_id": {"$in": emp_ids}},
        {"_id": 0, "employee_id": 1, "amount": 1},
    ).to_list(length=None)
    auto_pen = {}
    for p in pen_rows:
        auto_pen[p["employee_id"]] = auto_pen.get(p["employee_id"], 0) + float(p.get("amount") or 0)

    wyplata_per_emp: dict = {}
    for emp, full_h in hours_per_emp_full.items():
        rec = payroll_recs.get(emp, {})
        is_fixed = bool(rec.get("is_fixed_salary"))
        rate = float(rec.get("rate") or 0)
        fixed_amt = float(rec.get("fixed_salary_amount") or 0)
        bonus = float(rec.get("bonus_zl") or 0)
        driver = float(rec.get("driver_zl") or 0)
        o_minus = float(rec.get("other_minus_zl") or 0)
        o_plus = float(rec.get("other_plus_zl") or 0)
        hours_amount = fixed_amt if is_fixed else (full_h * rate)
        wyplata_per_emp[emp] = hours_amount + bonus + driver + o_plus - o_minus - auto_pen.get(emp, 0)

    kp_per_budowa: dict = {bid: 0.0 for bid in site_to_bud.values()}
    kp_no_budowa: float = 0.0
    for emp, full_h in hours_per_emp_full.items():
        wyplata_emp = wyplata_per_emp.get(emp, 0)
        if abs(wyplata_emp) < 0.01:
            continue
        if full_h <= 0:
            kp_no_budowa += wyplata_emp
            continue
        allocated_ratio_sum = 0.0
        for (e, bud_id), h in hours_by_emp_bud.items():
            if e != emp:
                continue
            ratio = h / full_h
            kp_per_budowa[bud_id] = kp_per_budowa.get(bud_id, 0) + wyplata_emp * ratio
            allocated_ratio_sum += ratio
        remaining_ratio = 1.0 - allocated_ratio_sum
        if remaining_ratio > 0.0001:
            kp_no_budowa += wyplata_emp * remaining_ratio

    deleted_count = 0
    if not dry_run:
        deleted = await db.finance_zapisy.delete_many({
            "year": year, "month": month, "source": {"$in": ["auto_hours", "auto_payroll"]},
        })
        deleted_count = deleted.deleted_count

    iso_date = f"{year:04d}-{month:02d}-15"
    new_zapisy = []
    for bud_id, h_sum in hours_per_site.items():
        if h_sum <= 0:
            continue
        new_zapisy.append({
            "id": str(uuid.uuid4()),
            "date": iso_date, "year": year, "month": month,
            "kontrahent": f"AUTO: Godziny {year}-{month:02d}",
            "netto": round(h_sum, 2), "brutto": round(h_sum, 2),
            "kod_id": "G", "kod_category": "G", "budowa_id": bud_id,
            "nr_faktury": "", "notes": "Auto-sync z tabeli godzin",
            "source": "auto_hours",
            "created_at": datetime.now().isoformat(), "created_by": user_id,
        })
    for bud_id, kp_sum in kp_per_budowa.items():
        if abs(kp_sum) < 0.01:
            continue
        new_zapisy.append({
            "id": str(uuid.uuid4()),
            "date": iso_date, "year": year, "month": month,
            "kontrahent": f"AUTO: Wyplaty {year}-{month:02d}",
            "netto": round(kp_sum, 2), "brutto": round(kp_sum, 2),
            "kod_id": "KP_WYNAGRODZENIA", "kod_category": "KP", "budowa_id": bud_id,
            "nr_faktury": "", "notes": "Auto-sync wyplat (wynagrodzenie + bonus + kierowca + inne - other_minus - kary, BEZ zaliczek)",
            "source": "auto_payroll",
            "created_at": datetime.now().isoformat(), "created_by": user_id,
        })
    if abs(kp_no_budowa) >= 0.01:
        new_zapisy.append({
            "id": str(uuid.uuid4()),
            "date": iso_date, "year": year, "month": month,
            "kontrahent": f"AUTO: Wyplaty {year}-{month:02d} (bez budowy)",
            "netto": round(kp_no_budowa, 2), "brutto": round(kp_no_budowa, 2),
            "kod_id": "KP_WYNAGRODZENIA", "kod_category": "KP", "budowa_id": None,
            "nr_faktury": "", "notes": "Wyplaty za godziny nieprzypisane do budow finansowych (pro-rata reszta)",
            "source": "auto_payroll",
            "created_at": datetime.now().isoformat(), "created_by": user_id,
        })
    if new_zapisy and not dry_run:
        await db.finance_zapisy.insert_many(new_zapisy)

    return {
        "year": year, "month": month,
        "deleted_old_auto": deleted_count,
        "g_zapisy": sum(1 for z in new_zapisy if z["kod_id"] == "G"),
        "kp_zapisy": sum(1 for z in new_zapisy if z["kod_id"] == "KP_WYNAGRODZENIA"),
        "total_godziny": round(sum(hours_per_site.values()), 2),
        "total_kp": round(sum(kp_per_budowa.values()) + kp_no_budowa, 2),
        "kp_no_budowa": round(kp_no_budowa, 2),
        "employees_processed": len(emp_ids),
        "dry_run": dry_run,
    }


@router.post("/finance/sync-current-month")
async def sync_current_month(current_user: dict = Depends(get_current_admin)):
    """Synchronizacja BIEZACEGO miesiaca - kompatybilnosc."""
    now = datetime.now()
    summary = await _do_sync_month(now.year, now.month, current_user["sub"])
    await db.finance_settings.update_one(
        {"id": "main"},
        {"$set": {"last_sync_at": datetime.now().isoformat(), "last_sync_summary": summary},
         "$setOnInsert": {"id": "main"}}, upsert=True,
    )
    return summary


@router.post("/finance/sync-all-months")
async def sync_all_months(
    from_year: int = Query(2026), from_month: int = Query(1, ge=1, le=12),
    current_user: dict = Depends(get_current_admin),
):
    """Resync WSZYSTKICH miesiecy od podanego do biezacego (godziny + wyplaty -> zapisy)."""
    now = datetime.now()
    yr, mo = from_year, from_month
    results = []
    while (yr, mo) <= (now.year, now.month):
        s = await _do_sync_month(yr, mo, current_user["sub"])
        results.append(s)
        if mo == 12:
            yr += 1
            mo = 1
        else:
            mo += 1
    aggregate = {
        "months_processed": len(results),
        "g_zapisy_total": sum(r.get("g_zapisy", 0) for r in results),
        "kp_zapisy_total": sum(r.get("kp_zapisy", 0) for r in results),
        "total_godziny": round(sum(r.get("total_godziny", 0) for r in results), 2),
        "total_kp": round(sum(r.get("total_kp", 0) for r in results), 2),
        "per_month": results,
    }
    await db.finance_settings.update_one(
        {"id": "main"},
        {"$set": {"last_sync_at": datetime.now().isoformat(), "last_sync_summary": aggregate}},
        upsert=True,
    )
    return aggregate


async def cron_payroll_sync():
    """Cron: codziennie o 03:00 resyncuje GODZINY+WYPLATY -> finance_zapisy
    dla wszystkich miesiecy od stycznia 2026 do biezacego (idempotentnie nadpisuje source=auto_*)."""
    try:
        now = datetime.now()
        results = []
        yr, mo = 2026, 1
        while (yr, mo) <= (now.year, now.month):
            s = await _do_sync_month(yr, mo, "cron_payroll")
            results.append(s)
            if mo == 12:
                yr += 1
                mo = 1
            else:
                mo += 1
        total_kp = round(sum(r.get("total_kp", 0) for r in results), 2)
        total_g = round(sum(r.get("total_godziny", 0) for r in results), 2)
        logger.info(f"[cron_payroll_sync] OK: {len(results)} mc, total_godziny={total_g}, total_kp={total_kp}")
        await db.finance_settings.update_one(
            {"id": "main"},
            {"$set": {"last_payroll_sync_at": datetime.now().isoformat(),
                       "last_payroll_sync_status": "ok",
                       "last_payroll_sync_summary": {
                           "months": len(results), "total_godziny": total_g, "total_kp": total_kp,
                       }}},
            upsert=True,
        )
    except Exception as e:
        logger.exception("[cron_payroll_sync] blad")
        await db.finance_settings.update_one(
            {"id": "main"},
            {"$set": {"last_payroll_sync_at": datetime.now().isoformat(),
                       "last_payroll_sync_status": "error",
                       "last_payroll_sync_error": f"{type(e).__name__}: {e}"}},
            upsert=True,
        )




# iter95be: forecast endpoints wydzielone do osobnego modulu (433 linie)
from routes.finance_forecast import router as _forecast_router
router.include_router(_forecast_router)

# iter95be: Fakturownia integration wydzielona do osobnego modulu (1079 linii)
# Re-export cron_fakturownia_sync dla server.py
from routes.finance_fakturownia import (
    router as _fakturownia_router,
    cron_fakturownia_sync,  # noqa: F401  re-export
)
router.include_router(_fakturownia_router)

# iter95bf: Reports (rachunek-wynikow, payment-summary, sprzedaz) wydzielone (~500 linii)
# Re-export _compute_sprzedaz_data dla routes/budget.py
from routes.finance_reports import (
    router as _reports_router,
    _compute_sprzedaz_data,  # noqa: F401  re-export
)
router.include_router(_reports_router)
