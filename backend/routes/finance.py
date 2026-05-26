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


@router.get("/finance/budowy")
async def list_budowy(
    include_archived: bool = Query(False),
    has_budget: Optional[bool] = Query(None, description="iter93: filtr po has_budget"),
    current_user: dict = Depends(get_current_admin),
):
    q: dict = {} if include_archived else {"$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}]}
    if has_budget is True:
        # Default = True dla starszych rekordow ktore nie maja flagi
        q["$and"] = [{"$or": [{"has_budget": {"$ne": False}}]}]
    elif has_budget is False:
        q["has_budget"] = False
    rows = await db.finance_budowy.find(q, {"_id": 0}).sort("name", 1).to_list(length=None)
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
        "is_archived": False,
        "created_at": datetime.now().isoformat(),
        "created_by": current_user["sub"],
    }
    await db.finance_budowy.insert_one(doc)
    # Jezeli show_in_hours = True, dodaj do sites collection
    if payload.show_in_hours:
        await _sync_to_sites(bid, name)
    doc.pop("_id", None)
    return doc


@router.put("/finance/budowy/{budowa_id}")
async def update_budowa(
    budowa_id: str,
    payload: BudowaUpdate,
    current_user: dict = Depends(get_current_admin),
):
    existing = await db.finance_budowy.find_one({"id": budowa_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Budowa nie znaleziona")
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "name" in upd:
        upd["name"] = upd["name"].strip()
    upd["updated_at"] = datetime.now().isoformat()
    upd["updated_by"] = current_user["sub"]
    await db.finance_budowy.update_one({"id": budowa_id}, {"$set": upd})

    # Sync z sites collection
    new_show = upd.get("show_in_hours", existing.get("show_in_hours", False))
    old_show = existing.get("show_in_hours", False)
    new_name = upd.get("name", existing.get("name"))
    if new_show and not old_show:
        await _sync_to_sites(budowa_id, new_name)
    elif old_show and not new_show:
        await _remove_from_sites(budowa_id)
    elif new_show and "name" in upd:
        # nazwa sie zmienila - update site
        await db.construction_sites.update_one(
            {"finance_budowa_id": budowa_id}, {"$set": {"name": new_name}}
        )
    return {"message": "Zaktualizowano"}


@router.post("/finance/budowy/{budowa_id}/archive")
async def archive_budowa(budowa_id: str, current_user: dict = Depends(get_current_admin)):
    """Archiwizuje budowe w finansach. Dane zapisow zostaja. Usuwa z sites (lista godzin)."""
    res = await db.finance_budowy.update_one(
        {"id": budowa_id},
        {"$set": {
            "is_archived": True,
            "show_in_hours": False,
            "archived_at": datetime.now().isoformat(),
            "archived_by": current_user["sub"],
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Budowa nie znaleziona")
    await _remove_from_sites(budowa_id)
    return {"message": "Zarchiwizowano"}


@router.post("/finance/budowy/{budowa_id}/unarchive")
async def unarchive_budowa(budowa_id: str, current_user: dict = Depends(get_current_admin)):
    res = await db.finance_budowy.update_one(
        {"id": budowa_id},
        {"$set": {"is_archived": False, "archived_at": None}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Budowa nie znaleziona")
    return {"message": "Przywrocono"}


@router.delete("/finance/budowy/{budowa_id}")
async def delete_budowa(budowa_id: str, current_user: dict = Depends(get_current_admin)):
    """Trwale usuniecie. Nie pozwala jezeli sa zapisy z ta budowa."""
    cnt = await db.finance_zapisy.count_documents({"budowa_id": budowa_id})
    if cnt > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Nie mozna usunac - jest {cnt} zapisow finansowych. Zarchiwizuj zamiast usuwac.",
        )
    await db.finance_budowy.delete_one({"id": budowa_id})
    await _remove_from_sites(budowa_id)
    return {"message": "Usunieto"}


async def _sync_to_sites(budowa_id: str, name: str):
    """Dodaje budowe do construction_sites jezeli jeszcze nie istnieje (po finance_budowa_id)."""
    existing = await db.construction_sites.find_one(
        {"finance_budowa_id": budowa_id}, {"_id": 0, "id": 1}
    )
    if existing:
        return
    site_doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "finance_budowa_id": budowa_id,  # link
        "is_active": True,
        "address": "",
        "category": "budowa",
        "visible_to_foremen": True,
        "created_at": datetime.now().isoformat(),
    }
    await db.construction_sites.insert_one(site_doc)


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
    q = {}
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
    return doc


@router.put("/finance/zapisy/{zapis_id}")
async def update_zapis(zapis_id: str, payload: ZapisUpdate, current_user: dict = Depends(get_current_admin)):
    existing = await db.finance_zapisy.find_one({"id": zapis_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Zapis nie znaleziony")
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
    return {"message": "Zaktualizowano"}


@router.delete("/finance/zapisy/{zapis_id}")
async def delete_zapis(zapis_id: str, current_user: dict = Depends(get_current_admin)):
    res = await db.finance_zapisy.delete_one({"id": zapis_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zapis nie znaleziony")
    return {"message": "Usunieto"}


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
    q_inv: dict = {}
    q_zap: dict = {}
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
        {"parent_invoice_id": {"$in": inv_ids}}, {"_id": 0}
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
    existing = await db.finance_invoices.find_one({"id": invoice_id}, {"_id": 0})
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
    """Usuwa naglowek faktury + KASKADA wszystkie jej pozycje."""
    res = await db.finance_invoices.delete_one({"id": invoice_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Faktura nie znaleziona")
    del_pos = await db.finance_zapisy.delete_many({"parent_invoice_id": invoice_id})
    return {"message": "Usunieto", "positions_deleted": del_pos.deleted_count}


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


# ============= RACHUNEK WYNIKOW =============
@router.get("/finance/rachunek-wynikow")
async def rachunek_wynikow(
    year: int = Query(...),
    current_user: dict = Depends(get_current_admin),
):
    """Buduje tabele Rachunku Wynikow 12 msc x kategorie - identycznie jak w Excelu."""
    await ensure_kody_seed()
    # Pobierz wszystkie zapisy w tym roku
    zapisy = await db.finance_zapisy.find(
        {"year": year},
        {"_id": 0, "month": 1, "kod_id": 1, "kod_category": 1, "netto": 1, "budowa_id": 1,
         "parent_invoice_id": 1},
    ).to_list(length=None)

    # Pobierz naglowki faktur z tego roku - dla kazdej faktury z kod_id obliczamy "reszta"
    # = netto faktury - suma przypisanych pozycji tej samej faktury. Reszta wnosi do aggregacji.
    invoices = await db.finance_invoices.find(
        {"year": year},
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
    virtual_zapisy = []
    for inv in invoices:
        if not inv.get("kod_id"):
            continue
        remainder = float(inv.get("netto") or 0) - assigned_pos_by_inv.get(inv["id"], 0.0)
        if remainder <= 0:
            continue
        virtual_zapisy.append({
            "month": inv["month"],
            "kod_id": inv["kod_id"],
            "kod_category": inv.get("kod_category") or "",
            "netto": round(remainder, 2),
            "budowa_id": inv.get("budowa_id"),
        })
    zapisy_all = zapisy + virtual_zapisy

    # Agregacja: sum_by_kod[kod_id][month] = netto
    sum_by_kod: dict = {}
    sum_by_cat: dict = {}  # category -> {month: netto}
    for z in zapisy_all:
        if not z.get("kod_id"):
            continue
        m = z["month"]
        kod = z["kod_id"]
        cat = z.get("kod_category") or ""
        v = float(z.get("netto") or 0)
        sum_by_kod.setdefault(kod, {}).setdefault(m, 0.0)
        sum_by_kod[kod][m] += v
        sum_by_cat.setdefault(cat, {}).setdefault(m, 0.0)
        sum_by_cat[cat][m] += v

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
        if z.get("kod_id") == "PZS":
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
    q = {"paid": {"$ne": True}, "source": "fakturownia"}
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



# ============= SPRZEDAZ per budowa =============
@router.get("/finance/sprzedaz")
async def sprzedaz(
    year: int = Query(...),
    month: Optional[int] = Query(None, ge=1, le=12),
    current_user: dict = Depends(get_current_admin),
):
    """Buduje tabele Sprzedaz per budowa - identycznie jak w Excelu Sprzedaż.

    Kolumny per budowa:
    - E: Sprzedaz (PZS)
    - F: KP (Wynagrodzenia z budowy) | G: udzial F w sumie | H: alokacja KP "stawkowych" pro-rata
    - I: KBB | J: udzial I+F w (sumie I+F) | K: alokacja KSP_STAWKI pro-rata
    - L: Marza brutto (E - I - F - H - K) - uwaga: kolumny K, H to alokacje pomocniczne
    - M: %
    - N: KSB | O: alokacja KSP_UKLADY pro-rata
    - P: Marza I (L - N - O)
    - Q: %
    - R: KSP allokacja pro-rata wg G
    - S: Marza II (P - R)
    - T: %
    - U: Podatek allokacja pro-rata wg E
    - V: Marza III (S - U)
    - W: %
    - Y: Przychod (= E)
    - Z: Koszt (= F+H+I+K+N+O+R+U)
    - AA: Kaucja GIR (= 2% * PZS dla GIR-budowy)
    - AB: Kaucja DW (= 2% * PZS dla DW-budowy)
    - AC: Roznica = Y + Z (Z jest ujemny w Z+ logice; tu sumujemy)
    - AD: Zysk %
    - AE: Ilosc godzin
    - AF: Przychod / godziny
    - AG: Zysk / godziny
    - AH: Koszt / godziny
    - AI: Koszt zmienny (= F+H+I+K) - bez stałych
    """
    await ensure_kody_seed()
    budowy = await db.finance_budowy.find({}, {"_id": 0}).sort("name", 1).to_list(length=None)
    zap_filter = {"year": year}
    if month is not None:
        zap_filter["month"] = month
    zapisy = await db.finance_zapisy.find(
        zap_filter,
        {"_id": 0, "kod_id": 1, "kod_category": 1, "netto": 1, "budowa_id": 1,
         "parent_invoice_id": 1},
    ).to_list(length=None)
    # Faktury - reszty
    inv_filter = {"year": year}
    if month is not None:
        inv_filter["month"] = month
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

    # Sumaryczne kwoty z zapisow
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

    # SUMA - rok (dla alokacji pro-rata)
    total_pzs = sum_by_cat("PZS")
    total_ksp = sum_by_cat("KSP")
    total_ppe = sum_by_cat("PPE")
    # "Slawkowe" - alokowane pro-rata: traktujemy je jako te bez budowa_id (czyli nieprzypisane)
    # UWAGA: alokujemy WSZYSTKIE zapisy KP bez budowy (KP_STAWKI, KP_WYNAGRODZENIA z auto-sync, itd.),
    # zeby Leszek (i inni pracownicy bez przypisanej budowy) nie wyciekal z rentownosci per budowa.
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
    # SUMA KP/KBB przypisane do budow (suma F i I w Excelu - to suma F23 i I23)
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
        # Alokacje pro-rata
        # G = F / suma F (udzial w KP)
        G = safe_div(F, assigned_kp_sum)
        # H = (KP_STAWKI niezprzypisane) * G - alokacja pro-rata
        H = kp_stawki_unassigned * G
        # J = (F+I) / (suma F+I)
        J = safe_div(F + Ib, assigned_kbb_sum + assigned_kp_sum)
        # K = (KSP_STAWKI niezprzypisane) * J
        K = ksp_stawki_unassigned * J
        # Marza brutto = E - koszty zmienne (F+H+I+K). Konwencja: koszty dodatnie.
        L_brutto = E - (F + H + Ib + K)
        M_pct = safe_div(L_brutto, E)
        O_aloc = ksp_uklady_unassigned * G  # alokacja KSP_UKLADY pro-rata G
        P_marza1 = L_brutto - N - O_aloc
        Q_pct = safe_div(P_marza1, E)
        # R = KSP (oprocz KSP_STAWKI i KSP_UKLADY ktore juz alokowane) * G
        ksp_other = total_ksp - ksp_stawki_unassigned - ksp_uklady_unassigned
        R_aloc = ksp_other * G
        S_marza2 = P_marza1 - R_aloc
        T_pct = safe_div(S_marza2, E)
        U_aloc = total_ppe * safe_div(E, total_pzs)  # podatek pro-rata po sprzedazy
        V_marza3 = S_marza2 - U_aloc
        W_pct = safe_div(V_marza3, E)

        # Y-AI (widoczne od razu)
        Y = E
        Z = F + H + Ib + K + N + O_aloc + R_aloc + U_aloc
        AA = E * (float(b.get("kaucja_gir_pct") or 2.0) / 100.0) if b.get("is_gir") else 0.0
        AB = E * (float(b.get("kaucja_dw_pct") or 2.0) / 100.0) if b.get("is_dw") else 0.0
        AC = Y - Z - AA - AB  # zysk netto (Roznica)
        AD_pct = safe_div(AC, Y)
        # godziny z aplikacji - z hour_entries dla tej budowy (sites z finance_budowa_id=bid)
        # tu liczymy z finance_zapisy kod G:
        AE = sum_by_kod("G", bid)
        AF = safe_div(Y, AE) if AE > 0 else 0
        AG = safe_div(AC, AE) if AE > 0 else 0
        AH = safe_div(Z, AE) if AE > 0 else 0
        AI = F + H + Ib + K  # koszty zmienne

        rows.append({
            "nr": idx,
            "budowa_id": bid,
            "name": b["name"],
            "is_archived": b.get("is_archived", False),
            "is_gir": b.get("is_gir", False),
            "is_dw": b.get("is_dw", False),
            # hidden detail columns (E-X)
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
            # visible columns (Y-AI)
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

    # Suma (footer)
    sum_visible = {k: round(sum(r["visible"][k] for r in rows), 2) for k in
                    ["przychod", "koszt", "kaucja_gir", "kaucja_dw", "roznica", "godziny", "koszt_zmienny"]}
    sum_visible["zysk_pct"] = round(safe_div(sum_visible["roznica"], sum_visible["przychod"]), 4)
    sum_visible["przychod_rg"] = round(safe_div(sum_visible["przychod"], sum_visible["godziny"]), 2) if sum_visible["godziny"] > 0 else 0
    sum_visible["zysk_rg"] = round(safe_div(sum_visible["roznica"], sum_visible["godziny"]), 2) if sum_visible["godziny"] > 0 else 0
    sum_visible["koszt_rg"] = round(safe_div(sum_visible["koszt"], sum_visible["godziny"]), 2) if sum_visible["godziny"] > 0 else 0

    # Suma kolumn szczegolowych (details). Procenty liczone z sumarycznych wartosci, NIE jako srednia.
    sum_details_keys = ["sprzedaz", "kp", "kp_aloc", "kbb", "kbb_aloc", "marza_brutto",
                         "ksb", "ksp_uklady_aloc", "marza1", "ksp_aloc", "marza2",
                         "podatek_aloc", "marza3"]
    sum_details = {k: round(sum(r["details"][k] for r in rows), 2) for k in sum_details_keys}
    sd_sprzedaz = sum_details["sprzedaz"]
    sum_details["marza_brutto_pct"] = round(safe_div(sum_details["marza_brutto"], sd_sprzedaz), 4)
    sum_details["marza1_pct"] = round(safe_div(sum_details["marza1"], sd_sprzedaz), 4)
    sum_details["marza2_pct"] = round(safe_div(sum_details["marza2"], sd_sprzedaz), 4)
    sum_details["marza3_pct"] = round(safe_div(sum_details["marza3"], sd_sprzedaz), 4)

    return {
        "year": year,
        "rows": rows,
        "totals": {
            "visible": sum_visible,
            "details": sum_details,
        },
    }



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
    last_day = 31 if mo in (1, 3, 5, 7, 8, 10, 12) else (30 if mo != 2 else 29)
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
        {"_id": 0, "id": 1, "fakturownia_position_id": 1, "kod_id": 1, "budowa_id": 1, "notes": 1},
    ).to_list(length=None)
    existing_by_pos = {e.get("fakturownia_position_id"): e for e in existing if e.get("fakturownia_position_id")}

    # Naglowki faktur - mapa po fakturownia_invoice_id
    existing_invoices = await db.finance_invoices.find(
        {"source": "fakturownia"},
        {"_id": 0, "id": 1, "fakturownia_invoice_id": 1, "kod_id": 1, "budowa_id": 1, "notes": 1},
    ).to_list(length=None)
    existing_inv_by_fid = {e.get("fakturownia_invoice_id"): e for e in existing_invoices}

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

        # Auto-kod dla sprzedazowych
        auto_kod_id = "PZS" if is_income else None
        auto_kod_category = "PZS" if is_income else None

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
            # Jezeli sprzedazowa i jeszcze nie ma kodu - ustaw PZS
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
            auto_kod_id = "PZS" if is_income else None
            auto_kod_category = "PZS" if is_income else None
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
                last_day = 31 if m2 in (1,3,5,7,8,10,12) else (30 if m2 != 2 else 29)
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
                last_day = 31 if m in (1,3,5,7,8,10,12) else (30 if m != 2 else 29)
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

