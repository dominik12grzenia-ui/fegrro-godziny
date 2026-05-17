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
    code: Optional[str] = None  # opcjonalny "G15" lub krotka nazwa
    show_in_hours: bool = False
    is_gir: bool = False  # dla obliczania Kaucji GIR (2%)
    is_dw: bool = False  # dla obliczania Kaucji DW (2%)
    notes: Optional[str] = None


class BudowaUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    show_in_hours: Optional[bool] = None
    is_gir: Optional[bool] = None
    is_dw: Optional[bool] = None
    notes: Optional[str] = None


class ZapisCreate(BaseModel):
    date: str  # YYYY-MM-DD - data sprzedazy/wystawienia
    kontrahent: Optional[str] = None
    netto: float
    brutto: Optional[float] = None
    kod_id: str  # z finance_kody (np. KBB_BETON, PZS, KP_WYNAGRODZENIA)
    budowa_id: Optional[str] = None  # finance_budowy.id - jezeli koszt budowy
    nr_faktury: Optional[str] = None
    pozycja_nazwa: Optional[str] = None
    notes: Optional[str] = None


class ZapisUpdate(BaseModel):
    date: Optional[str] = None
    kontrahent: Optional[str] = None
    netto: Optional[float] = None
    brutto: Optional[float] = None
    kod_id: Optional[str] = None
    budowa_id: Optional[str] = None
    nr_faktury: Optional[str] = None
    pozycja_nazwa: Optional[str] = None
    notes: Optional[str] = None


# ============= KODY =============
@router.get("/finance/kody")
async def list_kody(current_user: dict = Depends(get_current_admin)):
    await ensure_kody_seed()
    rows = await db.finance_kody.find({}, {"_id": 0}).sort("order", 1).to_list(length=None)
    return {"rows": rows}


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
    current_user: dict = Depends(get_current_admin),
):
    q = {} if include_archived else {"$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}]}
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
        "is_gir": bool(payload.is_gir),
        "is_dw": bool(payload.is_dw),
        "notes": payload.notes or "",
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
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
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
        {"_id": 0, "month": 1, "kod_id": 1, "kod_category": 1, "netto": 1, "budowa_id": 1},
    ).to_list(length=None)

    # Agregacja: sum_by_kod[kod_id][month] = netto
    sum_by_kod: dict = {}
    sum_by_cat: dict = {}  # category -> {month: netto}
    for z in zapisy:
        m = z["month"]
        kod = z["kod_id"]
        cat = z.get("kod_category") or ""
        v = float(z.get("netto") or 0)
        sum_by_kod.setdefault(kod, {}).setdefault(m, 0.0)
        sum_by_kod[kod][m] += v
        sum_by_cat.setdefault(cat, {}).setdefault(m, 0.0)
        sum_by_cat[cat][m] += v

    # Kaucje: GIR i DW = 2% z przychodu PZS dla budow z is_gir/is_dw
    gir_budowy = await db.finance_budowy.find({"is_gir": True}, {"_id": 0, "id": 1}).to_list(length=None)
    dw_budowy = await db.finance_budowy.find({"is_dw": True}, {"_id": 0, "id": 1}).to_list(length=None)
    gir_ids = {b["id"] for b in gir_budowy}
    dw_ids = {b["id"] for b in dw_budowy}
    kaucja_gir = {m: 0.0 for m in range(1, 13)}
    kaucja_dw = {m: 0.0 for m in range(1, 13)}
    for z in zapisy:
        if z.get("kod_id") == "PZS":
            m = z["month"]
            v = float(z.get("netto") or 0)
            bid = z.get("budowa_id")
            if bid in gir_ids:
                kaucja_gir[m] += v * KAUCJA_PROCENT
            if bid in dw_ids:
                kaucja_dw[m] += v * KAUCJA_PROCENT

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


# ============= SPRZEDAZ per budowa =============
@router.get("/finance/sprzedaz")
async def sprzedaz(
    year: int = Query(...),
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
    zapisy = await db.finance_zapisy.find(
        {"year": year},
        {"_id": 0, "kod_id": 1, "kod_category": 1, "netto": 1, "budowa_id": 1},
    ).to_list(length=None)

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
    kp_stawki_unassigned = sum(
        float(z.get("netto") or 0)
        for z in zapisy
        if z.get("kod_id") == "KP_STAWKI" and not z.get("budowa_id")
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
        AA = E * KAUCJA_PROCENT if b.get("is_gir") else 0.0
        AB = E * KAUCJA_PROCENT if b.get("is_dw") else 0.0
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

    return {
        "year": year,
        "rows": rows,
        "totals": {
            "visible": sum_visible,
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
    }


class SettingsUpdate(BaseModel):
    fakturownia_api_key: Optional[str] = None
    fakturownia_domain: Optional[str] = None  # np. "mojafirma" -> mojafirma.fakturownia.pl


@router.put("/finance/settings")
async def update_finance_settings(
    payload: SettingsUpdate, current_user: dict = Depends(get_current_admin)
):
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    upd["updated_at"] = datetime.now().isoformat()
    upd["updated_by"] = current_user["sub"]
    await db.finance_settings.update_one(
        {"id": "main"}, {"$set": upd, "$setOnInsert": {"id": "main"}}, upsert=True
    )
    return {"message": "Zapisano ustawienia"}


# ============= AUTO-SYNC: GODZINY + WYPLATY -> ZAPISY =============
@router.post("/finance/sync-current-month")
async def sync_current_month(current_user: dict = Depends(get_current_admin)):
    """Automatyczna synchronizacja DLA BIEZACEGO MIESIACA (today.year/today.month):
    - Dla kazdej aktywnej budowy z show_in_hours=True i z linkiem do construction_sites:
      * Pobiera godziny z hour_entries pogrupowane per pracownik+budowa
      * Pobiera payroll_records dla pracownikow ktorzy mieli godziny
      * Alokuje pro-rata wg godzin pracownika na danej budowie:
        - KP_WYNAGRODZENIA = hours_amount + bonus + driver + other_plus - other_minus
        - kod=G: suma godzin
        - (kary/zaliczki traktowane jako odejmowanie od wynagrodzenia - juz w hours_amount kalkulacji w wyplatach)
    - Stare zsynchronizowane wpisy (source=auto_*) sa nadpisywane.
    - NIE rusza recznych wpisow (source=manual) ani innych miesiecy.
    """
    now = datetime.now()
    year, month = now.year, now.month
    start = f"{year:04d}-{month:02d}-01"
    end = f"{year:04d}-{month:02d}-31"

    # Mapowanie construction_site.id -> finance_budowy.id (przez finance_budowa_id)
    sites = await db.construction_sites.find(
        {"finance_budowa_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "finance_budowa_id": 1, "name": 1},
    ).to_list(length=None)
    site_to_bud = {s["id"]: s["finance_budowa_id"] for s in sites}
    if not site_to_bud:
        return {
            "year": year, "month": month,
            "message": "Brak budow finansowych z linkiem do listy godzin (show_in_hours=true)",
            "g_zapisy": 0, "kp_zapisy": 0,
        }

    # 1) Agreguj godziny z hour_entries per (employee_id, site_id) w biezacym miesiacu
    pipeline_hours = [
        {"$match": {"work_date": {"$gte": start, "$lte": end},
                     "site_id": {"$in": list(site_to_bud.keys())}}},
        {"$group": {
            "_id": {"emp": "$employee_id", "site": "$site_id"},
            "hours": {"$sum": {"$convert": {"input": "$hours_worked",
                                              "to": "double", "onError": 0, "onNull": 0}}},
        }},
    ]
    hours_by_emp_site: dict = {}
    hours_per_site: dict = {}  # bud_id -> suma godzin
    hours_per_emp: dict = {}  # emp_id -> suma godzin (total dla pro-rata)
    async for r in db.hour_entries.aggregate(pipeline_hours):
        emp = r["_id"].get("emp")
        site = r["_id"].get("site")
        h = float(r.get("hours") or 0)
        if not emp or not site:
            continue
        bud_id = site_to_bud.get(site)
        if not bud_id:
            continue
        hours_by_emp_site[(emp, bud_id)] = hours_by_emp_site.get((emp, bud_id), 0) + h
        hours_per_site[bud_id] = hours_per_site.get(bud_id, 0) + h
        hours_per_emp[emp] = hours_per_emp.get(emp, 0) + h

    # 2) Pobierz payroll_records dla biezacego miesiaca (tylko pracownicy ktorzy maja godziny)
    emp_ids = list(hours_per_emp.keys())
    payroll_recs = {}
    if emp_ids:
        recs = await db.payroll_records.find(
            {"year": year, "month": month, "employee_id": {"$in": emp_ids}},
            {"_id": 0},
        ).to_list(length=None)
        payroll_recs = {r["employee_id"]: r for r in recs}

    # Pobierz auto-advances i auto-penalties per pracownik
    adv_rows = await db.advances.find(
        {"year": year, "month": month, "employee_id": {"$in": emp_ids}},
        {"_id": 0, "employee_id": 1, "amount": 1},
    ).to_list(length=None)
    auto_adv = {}
    for a in adv_rows:
        auto_adv[a["employee_id"]] = auto_adv.get(a["employee_id"], 0) + float(a.get("amount") or 0)
    pen_rows = await db.penalties.find(
        {"year": year, "month": month, "employee_id": {"$in": emp_ids}},
        {"_id": 0, "employee_id": 1, "amount": 1},
    ).to_list(length=None)
    auto_pen = {}
    for p in pen_rows:
        auto_pen[p["employee_id"]] = auto_pen.get(p["employee_id"], 0) + float(p.get("amount") or 0)

    # 3) Oblicz alokacje per budowa: KP_WYNAGRODZENIA (kara+premia+kierowca razem w jednej kategorii KP).
    # Per budowa sumujemy alokowane kwoty od kazdego pracownika.
    kp_per_budowa: dict = {bid: 0.0 for bid in site_to_bud.values()}
    for (emp, bud_id), h in hours_by_emp_site.items():
        emp_total_h = hours_per_emp.get(emp, 0)
        if emp_total_h <= 0:
            continue
        ratio = h / emp_total_h
        rec = payroll_recs.get(emp, {})
        is_fixed = bool(rec.get("is_fixed_salary"))
        rate = float(rec.get("rate") or 0)
        fixed_amt = float(rec.get("fixed_salary_amount") or 0)
        bonus = float(rec.get("bonus_zl") or 0)
        driver = float(rec.get("driver_zl") or 0)
        o_minus = float(rec.get("other_minus_zl") or 0)
        o_plus = float(rec.get("other_plus_zl") or 0)
        if is_fixed:
            hours_amount = fixed_amt
        else:
            hours_amount = emp_total_h * rate
        emp_adv = auto_adv.get(emp, 0)
        emp_pen = auto_pen.get(emp, 0)
        # KP koszt firmy = wynagrodzenie + bonus + driver + other_plus - other_minus
        # (zaliczki i kary nie sa kosztem dla firmy - to potracenia z wynagrodzenia pracownika.
        # Dla rachunku wynikow liczy sie pelne KP brutto)
        # Jednak user mowi: "Suma wyplaty kary i premii oraz kierowcy powinna byc tez dodana"
        # Interpretacja: wpiszmy WYPLATA TOTAL (kwota faktycznie wyplacana) jako koszt KP
        # Wyplata = hours_amount - adv - pen - other_minus + bonus + driver + other_plus
        # Ale to nie jest koszt firmy, koszt firmy = hours_amount + bonus + driver + o_plus - o_minus
        # Aby precyzyjnie: zapisuje 3 osobne wpisy: WYNAGRODZENIE (KP_WYNAGRODZENIA), BONUS+KIEROWCA (KP_STAWKI),
        # ale prosciej i czytelniej dla usera: 1 wpis na budowa "Wyplaty {miesiac}" = suma kosztu firmy
        # Final: KP_WYNAGRODZENIA per budowa = ratio * (hours_amount + bonus + driver + o_plus - o_minus - adv - pen)
        # User chce: "Suma wyplaty kary i premii oraz kierowcy" -> kwota faktycznie wyplacana
        wyplata_emp = hours_amount - emp_adv - emp_pen - o_minus + bonus + driver + o_plus
        kp_per_budowa[bud_id] = kp_per_budowa.get(bud_id, 0) + wyplata_emp * ratio

    # 4) Usun stare auto-zapisy dla tego miesiaca i wstaw nowe
    deleted = await db.finance_zapisy.delete_many({
        "year": year, "month": month, "source": {"$in": ["auto_hours", "auto_payroll"]},
    })

    iso_date = f"{year:04d}-{month:02d}-{min(now.day, 28):02d}"  # bezpiecznie max 28 dla luty
    new_zapisy = []
    # Zapisy KOD=G per budowa
    for bud_id, h_sum in hours_per_site.items():
        if h_sum <= 0:
            continue
        new_zapisy.append({
            "id": str(uuid.uuid4()),
            "date": iso_date, "year": year, "month": month,
            "kontrahent": f"AUTO: Godziny {year}-{month:02d}",
            "netto": round(h_sum, 2), "brutto": round(h_sum, 2),
            "kod_id": "G", "kod_category": "G",
            "budowa_id": bud_id,
            "nr_faktury": "", "notes": "Auto-sync z tabeli godzin",
            "source": "auto_hours",
            "created_at": datetime.now().isoformat(),
            "created_by": current_user["sub"],
        })
    # Zapisy KP_WYNAGRODZENIA per budowa
    for bud_id, kp_sum in kp_per_budowa.items():
        if abs(kp_sum) < 0.01:
            continue
        new_zapisy.append({
            "id": str(uuid.uuid4()),
            "date": iso_date, "year": year, "month": month,
            "kontrahent": f"AUTO: Wyplaty {year}-{month:02d}",
            "netto": round(kp_sum, 2), "brutto": round(kp_sum, 2),
            "kod_id": "KP_WYNAGRODZENIA", "kod_category": "KP",
            "budowa_id": bud_id,
            "nr_faktury": "", "notes": "Auto-sync wyplat (wynagrodzenie + bonus + kierowca + inne - zaliczki - kary)",
            "source": "auto_payroll",
            "created_at": datetime.now().isoformat(),
            "created_by": current_user["sub"],
        })
    if new_zapisy:
        await db.finance_zapisy.insert_many(new_zapisy)

    summary = {
        "year": year, "month": month,
        "deleted_old_auto": deleted.deleted_count,
        "g_zapisy": sum(1 for z in new_zapisy if z["kod_id"] == "G"),
        "kp_zapisy": sum(1 for z in new_zapisy if z["kod_id"] == "KP_WYNAGRODZENIA"),
        "total_godziny": round(sum(hours_per_site.values()), 2),
        "total_kp": round(sum(kp_per_budowa.values()), 2),
    }
    await db.finance_settings.update_one(
        {"id": "main"},
        {"$set": {"last_sync_at": datetime.now().isoformat(), "last_sync_summary": summary},
         "$setOnInsert": {"id": "main"}},
        upsert=True,
    )
    return summary


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
    page = 1
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                params = {
                    "api_token": api_token,
                    "income": "no",
                    "include_positions": "true",
                    "period": "more",
                    "date_from": date_from,
                    "date_to": date_to,
                    "page": str(page),
                    "per_page": "100",
                }
                resp = await client.get(base_url, params=params)
                if resp.status_code == 401:
                    raise HTTPException(status_code=400, detail="Fakturownia: nieprawidlowy klucz API")
                if resp.status_code == 404:
                    raise HTTPException(status_code=400, detail=f"Fakturownia: subdomena '{domain}' nie istnieje")
                resp.raise_for_status()
                data = resp.json()
                page_invoices = data if isinstance(data, list) else data.get("invoices", [])
                if not page_invoices:
                    break
                all_invoices.extend(page_invoices)
                if len(page_invoices) < 100:
                    break
                page += 1
                if page > 50:
                    break
    except httpx.HTTPError as e:
        logger.error(f"[fakturownia] HTTP error: {e}")
        raise HTTPException(status_code=502, detail=f"Blad polaczenia z Fakturownia: {e}")

    # Pobierz istniejace wpisy fakturownia PO position_id GLOBALNIE (nie ograniczamy do roku/miesiaca,
    # bo sell_date faktury moze byc w innym miesiacu niz issue_date i przesuwac wpis miedzy miesiacami)
    existing = await db.finance_zapisy.find(
        {"source": "fakturownia"},
        {"_id": 0, "id": 1, "fakturownia_position_id": 1, "kod_id": 1, "budowa_id": 1, "notes": 1},
    ).to_list(length=None)
    existing_by_pos = {e.get("fakturownia_position_id"): e for e in existing if e.get("fakturownia_position_id")}

    created = 0
    updated = 0
    skipped = 0
    new_position_ids: set = set()

    for inv in all_invoices:
        inv_id = inv.get("id")
        issue_date = inv.get("sell_date") or inv.get("issue_date") or inv.get("transaction_date")
        if not issue_date:
            issue_date = f"{yr:04d}-{mo:02d}-01"
        kontrahent = (inv.get("buyer_name") or inv.get("seller_name") or "").strip()
        nr_fakt = (inv.get("number") or "").strip()
        positions = inv.get("positions") or []
        if not positions:
            positions = [{
                "id": f"inv_{inv_id}_total",
                "name": "(brak pozycji - kwota laczna)",
                "total_price_net": float(inv.get("price_net") or 0),
                "total_price_gross": float(inv.get("price_gross") or 0),
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
            try:
                d = datetime.strptime(issue_date, "%Y-%m-%d")
                iso_date = issue_date
                year_v, month_v = d.year, d.month
            except ValueError:
                iso_date = date_from
                year_v, month_v = yr, mo

            if existing_z:
                # NIE rusza kwoty/danych - admin moze chciec zachowac stan po recznej edycji
                # Tylko aktualizuje dane wtedy gdy admin jeszcze nie przypisal kodu
                if not existing_z.get("kod_id"):
                    await db.finance_zapisy.update_one(
                        {"id": existing_z["id"]},
                        {"$set": {
                            "date": iso_date, "year": year_v, "month": month_v,
                            "kontrahent": kontrahent, "netto": round(netto, 2),
                            "brutto": round(brutto, 2),
                            "nr_faktury": nr_fakt, "pozycja_nazwa": name,
                            "updated_at": datetime.now().isoformat(),
                            "updated_by": user_id,
                        }},
                    )
                    updated += 1
                else:
                    skipped += 1  # juz dopisana przez admina - nie ruszam
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
                    "notes": "",
                    "source": "fakturownia",
                    "fakturownia_invoice_id": inv_id,
                    "fakturownia_position_id": pos_id,
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
        "positions_created": created,
        "positions_updated": updated,
        "positions_removed": removed,
        "skipped_empty": skipped,
    }
    await db.finance_settings.update_one(
        {"id": "main"},
        {"$set": {"last_fakturownia_sync_at": datetime.now().isoformat(),
                   "last_fakturownia_sync_summary": summary},
         "$setOnInsert": {"id": "main"}},
        upsert=True,
    )
    return summary


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
                    page = 1
                    while True:
                        params = {"api_token": api_token, "income": "no",
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
                page = 1
                while True:
                    params = {"api_token": api_token, "income": "no",
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
        logger.info(f"[cron_fakturownia] OK: {total_created} nowych, "
                     f"{total_updated} zaktualizowanych, "
                     f"{total_removed} usunietych "
                     f"(zakres {SYNC_FROM_YEAR:04d}-{SYNC_FROM_MONTH:02d} -> {now.year:04d}-{now.month:02d})")
    except HTTPException as e:
        logger.warning(f"[cron_fakturownia] {e.detail}")
    except Exception as e:
        logger.error(f"[cron_fakturownia] nieoczekiwany blad: {e}", exc_info=True)





# ============= Test polaczenia z Fakturownia =============
@router.post("/finance/test-fakturownia")
async def test_fakturownia(current_user: dict = Depends(get_current_admin)):
    """Testuje polaczenie z Fakturownia API. Zwraca info o koncie lub blad."""
    settings = await db.finance_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    api_token = settings.get("fakturownia_api_key")
    domain = settings.get("fakturownia_domain")
    if not api_token or not domain:
        raise HTTPException(status_code=400, detail="Brak konfiguracji - ustaw klucz API i subdomene")
    url = f"https://{domain}.fakturownia.pl/account.json"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params={"api_token": api_token})
            if resp.status_code == 401:
                return {"ok": False, "error": "Nieprawidlowy klucz API"}
            if resp.status_code == 404:
                return {"ok": False, "error": f"Subdomena '{domain}' nie istnieje"}
            resp.raise_for_status()
            data = resp.json()
            return {
                "ok": True,
                "company_name": data.get("company_name") or data.get("name") or "",
                "prefix": data.get("prefix") or domain,
            }
    except httpx.HTTPError as e:
        return {"ok": False, "error": f"Blad polaczenia: {e}"}

