"""Wyceny - standalone quotations/estimates module (iter95k).

Kolekcje MongoDB:
- wyceny             - naglowki wycen (id, name, total_netto)
- wyceny_stages      - etapy wewnatrz wyceny
- wyceny_positions   - pozycje (Etap -> Pozycja)
- wyceny_lines       - linie (Pozycja -> Slot R/M/S, lub child slotu)
- wyceny_price_book  - katalog cen (category: materials/labor/equipment)

Wycena NIE jest powiazana z budowa - to standalone narzedzie ofertowe.
Struktura identyczna jak Budget: stages -> positions -> R/M/S slots -> children.
"""
import uuid
import os
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
import io

from database import db
from auth import get_current_admin

router = APIRouter()
logger = logging.getLogger(__name__)


# =========== MODELE ===========
class WycenaCreate(BaseModel):
    name: str
    notes: Optional[str] = None
    # iter95r: domyslne % dla calej wyceny
    default_gir_pct: Optional[float] = None
    default_dw_pct: Optional[float] = None
    default_koszt_pct: Optional[float] = None
    # iter95s: domyslne narzuty dla subpozycji
    default_narzut_pct: Optional[float] = None
    default_marza_pct: Optional[float] = None


class WycenaUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None
    default_gir_pct: Optional[float] = None
    default_dw_pct: Optional[float] = None
    default_koszt_pct: Optional[float] = None
    default_narzut_pct: Optional[float] = None
    default_marza_pct: Optional[float] = None
    # iter95al: dane klienta dla PDF wersji dla klienta
    client_name: Optional[str] = None
    client_nip: Optional[str] = None
    client_address: Optional[str] = None
    # iter95am: powierzchnie budynku (PC = pow. calkowita, PUM = pow. uzytkowa mieszkalna)
    pc_m2: Optional[float] = None
    pum_m2: Optional[float] = None
    # iter95an: podzial PC na podziemie/nadziemie
    pc_podziemie_m2: Optional[float] = None
    pc_nadziemie_m2: Optional[float] = None


class StageCreate(BaseModel):
    wycena_id: str
    name: str
    order: int = 0


class PositionCreate(BaseModel):
    wycena_id: str
    stage_id: str
    name: str
    order: int = 0
    # iter95u: ilosc wpisywana recznie na poziomie pozycji glownej
    quantity: Optional[float] = None
    # iter95x: jednostka miary (mb/m2/m3/szt/...)
    unit: Optional[str] = None
    # iter95q: pola dla widoku Excel-style wyceny
    kaucja_gir_pct: Optional[float] = None    # %, domyslnie 2.0
    kaucja_dw_pct: Optional[float] = None     # %, domyslnie 2.0
    koszt_budowy_pct: Optional[float] = None  # %, domyslnie 2.0
    koszt_prognozowany: Optional[float] = None  # kwota wpisywana recznie


class PositionUpdate(BaseModel):
    name: Optional[str] = None
    order: Optional[int] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    kaucja_gir_pct: Optional[float] = None
    kaucja_dw_pct: Optional[float] = None
    koszt_budowy_pct: Optional[float] = None
    koszt_prognozowany: Optional[float] = None
    # iter95am: flagi wliczania budzetu pozycji do wskaznika PC / PUM (zl/m2)
    include_in_pc: Optional[bool] = None
    include_in_pum: Optional[bool] = None
    # iter95an: podzial PC na podziemie / nadziemie
    include_in_pc_podziemie: Optional[bool] = None
    include_in_pc_nadziemie: Optional[bool] = None


class LineCreate(BaseModel):
    wycena_id: str
    stage_id: str
    position_id: str
    parent_id: Optional[str] = None
    type: str = "materials"  # materials | labor | equipment
    name: str
    unit: Optional[str] = None
    quantity: float = 0
    unit_price_netto: float = 0
    order: int = 0
    # iter95s: narzut na zapas + marza (procentowe - mnoza budzet)
    narzut_zapas_pct: Optional[float] = None
    marza_pct: Optional[float] = None
    # iter95ae: formula obliczania ilosci (np. "=100 m² * 0,24 m")
    quantity_formula: Optional[str] = None


class LineUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[float] = None
    unit_price_netto: Optional[float] = None
    type: Optional[str] = None
    order: Optional[int] = None
    narzut_zapas_pct: Optional[float] = None
    marza_pct: Optional[float] = None
    quantity_formula: Optional[str] = None


class PriceBookCreate(BaseModel):
    category: str  # materials | labor | equipment
    name: str
    unit: Optional[str] = None
    unit_price_netto: float = 0
    notes: Optional[str] = None
    # iter95l: dodatkowe pola dla materials (Excel-style)
    sub_category: Optional[str] = None       # izolacje | betony | stal | murowane | drobnica | pozostale
    oferent: Optional[str] = None            # dostawca / oferent
    opakowanie: Optional[str] = None         # wiaderko / paleta / rolka...
    pkg_qty: Optional[float] = None          # ilosc w opakowaniu (np. 20)
    pkg_unit: Optional[str] = None           # jd opakowania (kg, m2, szt)
    zapotrzebowanie: Optional[float] = None  # norma zuzycia (np. 1.5)
    zap_unit: Optional[str] = None           # jd. do jd. (kg/m2, szt/m2, mb/mb)
    liczba_warstw: Optional[float] = None    # liczba warstw
    koszty_inne_do_jd: Optional[float] = None  # iter95y: koszty inne doliczane do jednostki
    # iter95m: pola dla LABOR (robocizna)
    price_m2: Optional[float] = None         # cena za m2
    price_m3: Optional[float] = None         # cena za m3
    # iter95n: pola dla EQUIPMENT (sprzet)
    price_hour: Optional[float] = None       # koszt za godzine
    price_day: Optional[float] = None        # koszt za dzien
    price_month: Optional[float] = None      # koszt za miesiac
    wynajmujacy: Optional[str] = None        # nazwa firmy wynajmujacej
    extra_cost: Optional[float] = None       # koszty poboczne doliczane do kazdej jednostki
    extra_cost_desc: Optional[str] = None    # opis kosztow pobocznych


class PriceBookUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    unit_price_netto: Optional[float] = None
    notes: Optional[str] = None
    # iter95l: dodatkowe pola dla materials
    sub_category: Optional[str] = None
    oferent: Optional[str] = None
    opakowanie: Optional[str] = None
    pkg_qty: Optional[float] = None
    pkg_unit: Optional[str] = None
    zapotrzebowanie: Optional[float] = None
    zap_unit: Optional[str] = None
    liczba_warstw: Optional[float] = None
    koszty_inne_do_jd: Optional[float] = None
    # iter95m: labor
    price_m2: Optional[float] = None
    price_m3: Optional[float] = None
    # iter95n: equipment
    price_hour: Optional[float] = None
    price_day: Optional[float] = None
    price_month: Optional[float] = None
    wynajmujacy: Optional[str] = None
    extra_cost: Optional[float] = None
    extra_cost_desc: Optional[str] = None


VALID_CATEGORIES = {"materials", "labor", "equipment"}


def _ensure_cat(cat: str):
    if cat not in VALID_CATEGORIES:
        raise HTTPException(400, f"Kategoria musi byc jedna z: {sorted(VALID_CATEGORIES)}")


# =========== WYCENY (naglowki) ===========
@router.get("/wyceny")
async def list_wyceny(_user: dict = Depends(get_current_admin)):
    rows = await db.wyceny.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(length=1000)
    # Wzbogac o totals (suma plan_netto)
    for w in rows:
        total = 0.0
        async for ln in db.wyceny_lines.find(
            {"wycena_id": w["id"]}, {"_id": 0, "quantity": 1, "unit_price_netto": 1, "parent_id": 1, "id": 1},
        ):
            # Liczymy tylko liscie (linie ktore nie maja dzieci)
            # Proste podejscie: zliczamy wszystkie, potem odejmiemy ID rodzicow
            pass
        # Prosciej: liczymy w drugim podejsciu
        lines = await db.wyceny_lines.find({"wycena_id": w["id"]}, {"_id": 0}).to_list(length=None)
        parent_ids = {ln.get("parent_id") for ln in lines if ln.get("parent_id")}
        for ln in lines:
            if ln["id"] in parent_ids:
                continue  # ma dzieci, pomijamy
            total += float(ln.get("quantity") or 0) * float(ln.get("unit_price_netto") or 0)
        w["total_netto"] = round(total, 2)
        w["lines_count"] = len(lines)
    return {"rows": rows}


@router.post("/wyceny")
async def create_wycena(payload: WycenaCreate, current_user: dict = Depends(get_current_admin)):
    wid = str(uuid.uuid4())
    doc = {
        "id": wid,
        "name": payload.name,
        "notes": payload.notes,
        "default_gir_pct": payload.default_gir_pct if payload.default_gir_pct is not None else 2.0,
        "default_dw_pct": payload.default_dw_pct if payload.default_dw_pct is not None else 2.0,
        "default_koszt_pct": payload.default_koszt_pct if payload.default_koszt_pct is not None else 2.0,
        "default_narzut_pct": payload.default_narzut_pct if payload.default_narzut_pct is not None else 0.0,
        "default_marza_pct": payload.default_marza_pct if payload.default_marza_pct is not None else 0.0,
        "created_at": datetime.now().isoformat(),
        "created_by": current_user["sub"],
    }
    await db.wyceny.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/wyceny/{wycena_id}")
async def update_wycena(wycena_id: str, payload: WycenaUpdate,
                         current_user: dict = Depends(get_current_admin)):
    raw = payload.dict(exclude_unset=True)
    updates = dict(raw)
    updates["updated_at"] = datetime.now().isoformat()
    res = await db.wyceny.update_one({"id": wycena_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Wycena nie istnieje")
    doc = await db.wyceny.find_one({"id": wycena_id}, {"_id": 0})
    return doc


@router.delete("/wyceny/{wycena_id}")
async def delete_wycena(wycena_id: str, _user: dict = Depends(get_current_admin)):
    res = await db.wyceny.delete_one({"id": wycena_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Wycena nie istnieje")
    # Kaskadowo
    await db.wyceny_stages.delete_many({"wycena_id": wycena_id})
    await db.wyceny_positions.delete_many({"wycena_id": wycena_id})
    await db.wyceny_lines.delete_many({"wycena_id": wycena_id})
    return {"ok": True}


# =========== TEMPLATE (dane do widoku Excel-style) ===========
@router.get("/wyceny/{wycena_id}/template")
async def get_template(wycena_id: str, _user: dict = Depends(get_current_admin)):
    """Zwraca strukture wyceny: stages -> positions -> lines (+ children)."""
    wycena = await db.wyceny.find_one({"id": wycena_id}, {"_id": 0})
    if not wycena:
        raise HTTPException(404, "Wycena nie istnieje")
    stages = await db.wyceny_stages.find({"wycena_id": wycena_id}, {"_id": 0}).sort([("order", 1)]).to_list(length=None)
    positions = await db.wyceny_positions.find({"wycena_id": wycena_id}, {"_id": 0}).sort([("order", 1)]).to_list(length=None)
    lines = await db.wyceny_lines.find({"wycena_id": wycena_id}, {"_id": 0}).sort([("order", 1)]).to_list(length=None)

    pos_by_stage: dict = {}
    for p in positions:
        pos_by_stage.setdefault(p["stage_id"], []).append(p)
    lines_by_pos: dict = {}
    for ln in lines:
        lines_by_pos.setdefault(ln.get("position_id"), []).append(ln)

    # Struktura: stages[].positions[].slots[] (sloty top-level R/M/S) + slot.children
    for st in stages:
        st["positions"] = []
        for p in pos_by_stage.get(st["id"], []):
            slots = []
            all_pos_lines = lines_by_pos.get(p["id"], [])
            top_level = [ln for ln in all_pos_lines if not ln.get("parent_id")]
            children_by_parent: dict = {}
            for ln in all_pos_lines:
                if ln.get("parent_id"):
                    children_by_parent.setdefault(ln["parent_id"], []).append(ln)
            for slot in top_level:
                slot_copy = dict(slot)
                slot_copy["children"] = children_by_parent.get(slot["id"], [])
                slots.append(slot_copy)
            p_copy = dict(p)
            p_copy["slots"] = slots
            st["positions"].append(p_copy)
    return {"wycena": wycena, "stages": stages}


# =========== STAGES ===========
@router.post("/wyceny/stages")
async def create_stage(payload: StageCreate, current_user: dict = Depends(get_current_admin)):
    if not await db.wyceny.find_one({"id": payload.wycena_id}, {"_id": 0, "id": 1}):
        raise HTTPException(400, "Wycena nie istnieje")
    sid = str(uuid.uuid4())
    doc = {
        "id": sid, "wycena_id": payload.wycena_id, "name": payload.name,
        "order": payload.order,
        "created_at": datetime.now().isoformat(),
    }
    await db.wyceny_stages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/wyceny/stages/{stage_id}")
async def update_stage(stage_id: str, payload: StageCreate, _user: dict = Depends(get_current_admin)):
    updates = {"name": payload.name, "order": payload.order, "updated_at": datetime.now().isoformat()}
    res = await db.wyceny_stages.update_one({"id": stage_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Etap nie istnieje")
    return {"ok": True}


@router.delete("/wyceny/stages/{stage_id}")
async def delete_stage(stage_id: str, _user: dict = Depends(get_current_admin)):
    res = await db.wyceny_stages.delete_one({"id": stage_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Etap nie istnieje")
    # Kaskadowo
    await db.wyceny_positions.delete_many({"stage_id": stage_id})
    await db.wyceny_lines.delete_many({"stage_id": stage_id})
    return {"ok": True}


# =========== POSITIONS ===========
@router.post("/wyceny/positions")
async def create_position(payload: PositionCreate, _user: dict = Depends(get_current_admin)):
    pid = str(uuid.uuid4())
    doc = {
        "id": pid, "wycena_id": payload.wycena_id, "stage_id": payload.stage_id,
        "name": payload.name, "order": payload.order,
        "quantity": payload.quantity,
        "unit": payload.unit,
        "kaucja_gir_pct": payload.kaucja_gir_pct if payload.kaucja_gir_pct is not None else 2.0,
        "kaucja_dw_pct": payload.kaucja_dw_pct if payload.kaucja_dw_pct is not None else 2.0,
        "koszt_budowy_pct": payload.koszt_budowy_pct if payload.koszt_budowy_pct is not None else 2.0,
        "koszt_prognozowany": payload.koszt_prognozowany,
        "created_at": datetime.now().isoformat(),
    }
    await db.wyceny_positions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/wyceny/positions/{position_id}")
async def update_position(position_id: str, payload: PositionUpdate, _user: dict = Depends(get_current_admin)):
    raw = payload.dict(exclude_unset=True)
    updates = dict(raw)
    updates["updated_at"] = datetime.now().isoformat()
    res = await db.wyceny_positions.update_one({"id": position_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Pozycja nie istnieje")
    return {"ok": True}


@router.delete("/wyceny/positions/{position_id}")
async def delete_position(position_id: str, _user: dict = Depends(get_current_admin)):
    res = await db.wyceny_positions.delete_one({"id": position_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Pozycja nie istnieje")
    await db.wyceny_lines.delete_many({"position_id": position_id})
    return {"ok": True}


# iter95ao: bulk apply flagi PC/PC_pod/PC_nad/PUM na wszystkie pozycje w etapie
class StageBulkFlag(BaseModel):
    flag: str  # 'include_in_pc' | 'include_in_pc_podziemie' | 'include_in_pc_nadziemie' | 'include_in_pum'
    value: bool


ALLOWED_BULK_FLAGS = {
    "include_in_pc", "include_in_pc_podziemie", "include_in_pc_nadziemie", "include_in_pum"
}


@router.post("/wyceny/stages/{stage_id}/bulk-flag")
async def stage_bulk_flag(stage_id: str, payload: StageBulkFlag,
                          _user: dict = Depends(get_current_admin)):
    if payload.flag not in ALLOWED_BULK_FLAGS:
        raise HTTPException(400, "Nieprawidlowa flaga")
    res = await db.wyceny_positions.update_many(
        {"stage_id": stage_id},
        {"$set": {payload.flag: payload.value, "updated_at": datetime.now().isoformat()}},
    )
    return {"ok": True, "modified": res.modified_count}


# =========== LINES (slots R/M/S + children) ===========
@router.post("/wyceny/lines")
async def create_line(payload: LineCreate, _user: dict = Depends(get_current_admin)):
    if payload.type not in {"materials", "labor", "equipment"}:
        raise HTTPException(400, "Nieprawidlowy typ")
    lid = str(uuid.uuid4())
    doc = {
        "id": lid, "wycena_id": payload.wycena_id, "stage_id": payload.stage_id,
        "position_id": payload.position_id, "parent_id": payload.parent_id,
        "type": payload.type, "name": payload.name,
        "unit": payload.unit, "quantity": payload.quantity,
        "unit_price_netto": payload.unit_price_netto,
        "narzut_zapas_pct": payload.narzut_zapas_pct,
        "marza_pct": payload.marza_pct,
        "quantity_formula": payload.quantity_formula,
        "order": payload.order,
        "created_at": datetime.now().isoformat(),
    }
    await db.wyceny_lines.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/wyceny/lines/{line_id}")
async def update_line(line_id: str, payload: LineUpdate, _user: dict = Depends(get_current_admin)):
    updates = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    updates["updated_at"] = datetime.now().isoformat()
    res = await db.wyceny_lines.update_one({"id": line_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Linia nie istnieje")
    return {"ok": True}


@router.delete("/wyceny/lines/{line_id}")
async def delete_line(line_id: str, _user: dict = Depends(get_current_admin)):
    # Kaskada: usun tez dzieci
    await db.wyceny_lines.delete_many({"parent_id": line_id})
    res = await db.wyceny_lines.delete_one({"id": line_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Linia nie istnieje")
    return {"ok": True}


# =========== PRICE BOOK (Cennik) ===========
@router.get("/wyceny/cennik")
async def list_price_book(
    category: Optional[str] = Query(None),
    q: Optional[str] = Query(None),  # search by name
    _user: dict = Depends(get_current_admin),
):
    fq: dict = {}
    if category:
        _ensure_cat(category)
        fq["category"] = category
    if q:
        fq["name"] = {"$regex": q, "$options": "i"}
    rows = await db.wyceny_price_book.find(fq, {"_id": 0}).sort([("name", 1)]).to_list(length=5000)
    return {"rows": rows}


@router.post("/wyceny/cennik")
async def create_price_book(payload: PriceBookCreate, current_user: dict = Depends(get_current_admin)):
    _ensure_cat(payload.category)
    pid = str(uuid.uuid4())
    doc = {
        "id": pid, "category": payload.category, "name": payload.name,
        "unit": payload.unit, "unit_price_netto": payload.unit_price_netto,
        "notes": payload.notes,
        # iter95l: extended fields (materials)
        "sub_category": payload.sub_category,
        "oferent": payload.oferent,
        "opakowanie": payload.opakowanie,
        "pkg_qty": payload.pkg_qty,
        "pkg_unit": payload.pkg_unit,
        "zapotrzebowanie": payload.zapotrzebowanie,
        "zap_unit": payload.zap_unit,
        "liczba_warstw": payload.liczba_warstw,
        "koszty_inne_do_jd": payload.koszty_inne_do_jd,
        # iter95m: labor
        "price_m2": payload.price_m2,
        "price_m3": payload.price_m3,
        # iter95n: equipment
        "price_hour": payload.price_hour,
        "price_day": payload.price_day,
        "price_month": payload.price_month,
        "wynajmujacy": payload.wynajmujacy,
        "extra_cost": payload.extra_cost,
        "extra_cost_desc": payload.extra_cost_desc,
        "price_history": [],  # iter95m: lista wpisow {date, field, old, new}
        "created_at": datetime.now().isoformat(),
        "created_by": current_user["sub"],
    }
    await db.wyceny_price_book.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/wyceny/cennik/{item_id}")
async def update_price_book(item_id: str, payload: PriceBookUpdate, _user: dict = Depends(get_current_admin)):
    existing = await db.wyceny_price_book.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Pozycja cennika nie istnieje")
    raw = payload.dict(exclude_unset=True)
    updates = dict(raw)
    updates["updated_at"] = datetime.now().isoformat()
    # iter95m: dla labor - sledz zmiany price_m2/price_m3 w price_history
    history_entries = []
    if existing.get("category") == "labor":
        for field in ("price_m2", "price_m3", "unit_price_netto"):
            if field in raw:
                old_val = existing.get(field)
                new_val = raw[field]
                if old_val != new_val and (old_val is not None or new_val is not None):
                    history_entries.append({
                        "date": datetime.now().isoformat(),
                        "field": field,
                        "old": old_val,
                        "new": new_val,
                    })
    if history_entries:
        # Append entries do price_history
        await db.wyceny_price_book.update_one(
            {"id": item_id},
            {"$set": updates, "$push": {"price_history": {"$each": history_entries}}},
        )
    else:
        await db.wyceny_price_book.update_one({"id": item_id}, {"$set": updates})
    return {"ok": True}


@router.delete("/wyceny/cennik/{item_id}")
async def delete_price_book(item_id: str, _user: dict = Depends(get_current_admin)):
    res = await db.wyceny_price_book.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Pozycja cennika nie istnieje")
    return {"ok": True}


# iter95af/ag: zestawienie potrzebnych materialow (Bill of Materials / RFQ)
async def _build_bom(wycena_id: str):
    """Zestawienie: grupuj po nazwie, sumuj ilosci, dolicz liczbe opakowan (ceil)
    na bazie cennika (pkg_qty + zapotrzebowanie + zap_unit)."""
    import math
    wycena = await db.wyceny.find_one({"id": wycena_id}, {"_id": 0})
    if not wycena:
        raise HTTPException(404, "Wycena nie istnieje")
    lines = await db.wyceny_lines.find(
        {"wycena_id": wycena_id, "type": "materials"}, {"_id": 0}
    ).to_list(length=None)
    # Pobierz cennik materialow do dopasowania po nazwie
    cennik = await db.wyceny_price_book.find(
        {"category": "materials"}, {"_id": 0}
    ).to_list(length=None)
    cennik_by_name = {(c.get("name") or "").lower().strip(): c for c in cennik}

    grouped: dict = {}
    for ln in lines:
        name = (ln.get("name") or "").strip()
        if not name:
            continue
        unit = (ln.get("unit") or "").strip()
        qty = float(ln.get("quantity") or 0)
        if qty <= 0:
            continue
        # Grupuj po (nazwa, jednostka) - to samo co przedtem
        key = (name.lower(), unit.lower())
        if key not in grouped:
            ce = cennik_by_name.get(name.lower(), {}) or {}
            grouped[key] = {
                "name": name,
                "unit": unit,
                "quantity": 0.0,
                "occurrences": 0,
                "opakowanie": ce.get("opakowanie") or "",
                "pkg_qty": ce.get("pkg_qty"),
                "pkg_unit": ce.get("pkg_unit") or "",
                "zapotrzebowanie": ce.get("zapotrzebowanie"),
                "zap_unit": ce.get("zap_unit") or "",
            }
        grouped[key]["quantity"] += qty
        grouped[key]["occurrences"] += 1

    rows = []
    for r in grouped.values():
        # iter95ag: wylicz liczbe opakowan
        qty_in_pkg_unit = None
        num_packages = None
        pkg_qty = r.get("pkg_qty")
        zap = r.get("zapotrzebowanie")
        zap_unit = r.get("zap_unit") or ""
        pkg_unit = r.get("pkg_unit") or ""
        if pkg_qty and pkg_qty > 0:
            # Wariant 1: jednostka linii pasuje do mianownika zap_unit (np. line=m², zap=kg/m²)
            if "/" in zap_unit and zap:
                _num, denom = zap_unit.split("/", 1)
                if denom.strip() == r["unit"]:
                    qty_in_pkg_unit = r["quantity"] * zap
            # Wariant 2: jednostka linii = jd. opakowania (np. line=kg, pkg=kg)
            if qty_in_pkg_unit is None and r["unit"] and r["unit"] == pkg_unit:
                qty_in_pkg_unit = r["quantity"]
            if qty_in_pkg_unit is not None:
                num_packages = math.ceil(qty_in_pkg_unit / pkg_qty)
        rows.append({
            "name": r["name"],
            "unit": r["unit"],
            "quantity": round(r["quantity"], 3),
            "occurrences": r["occurrences"],
            "opakowanie": r["opakowanie"],
            "pkg_qty": r["pkg_qty"],
            "pkg_unit": pkg_unit,
            "qty_in_pkg_unit": round(qty_in_pkg_unit, 3) if qty_in_pkg_unit is not None else None,
            "num_packages": num_packages,
        })
    rows.sort(key=lambda r: r["name"].lower())
    return {"wycena_name": wycena.get("name", ""), "rows": rows}


@router.get("/wyceny/{wycena_id}/bom")
async def get_materials_bom(wycena_id: str, _user: dict = Depends(get_current_admin)):
    """JSON: zestawienie materialow do podgladu we frontendzie."""
    return await _build_bom(wycena_id)


@router.get("/wyceny/{wycena_id}/bom.xlsx")
async def export_bom_xlsx(wycena_id: str, _user: dict = Depends(get_current_admin)):
    data = await _build_bom(wycena_id)
    content, filename = _generate_bom_xlsx_bytes(data)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _generate_bom_xlsx_bytes(data: dict):
    """Refaktor iter95ah: generuj XLSX jako bytes - reuzywalne przez endpoint i wysylke maila."""
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    wb = Workbook()
    ws = wb.active
    ws.title = "Zestawienie materiałów"
    ws["A1"] = f"Zestawienie materiałów: {data['wycena_name']}"
    ws["A1"].font = Font(bold=True, size=14, color="D4AF37")
    ws.merge_cells("A1:E1")
    ws["A2"] = f"Data wygenerowania: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    ws["A2"].font = Font(italic=True, size=10, color="666666")
    ws.merge_cells("A2:E2")
    headers = ["L.p.", "Nazwa materiału", "Ilość zużycia", "Jednostka",
               "Opakowanie", "Wielkość opak.", "Liczba opakowań",
               "Cena netto za opak. (PLN)", "Wartość netto (PLN)", "Termin dostawy", "Uwagi"]
    header_fill = PatternFill(start_color="3F5235", end_color="3F5235", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    thin = Side(border_style="thin", color="999999")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=4, column=col, value=h)
        c.fill = header_fill; c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = border
    ws.row_dimensions[4].height = 28
    for idx, row in enumerate(data["rows"], start=1):
        r_excel = 4 + idx
        ws.cell(row=r_excel, column=1, value=idx).border = border
        ws.cell(row=r_excel, column=2, value=row["name"]).border = border
        if row.get("qty_in_pkg_unit") is not None:
            ws.cell(row=r_excel, column=3, value=round(row["qty_in_pkg_unit"], 3)).border = border
            ws.cell(row=r_excel, column=4, value=row.get("pkg_unit") or "").border = border
        else:
            ws.cell(row=r_excel, column=3, value=round(row["quantity"], 3)).border = border
            ws.cell(row=r_excel, column=4, value=row["unit"]).border = border
        ws.cell(row=r_excel, column=5, value=row.get("opakowanie") or "—").border = border
        ws.cell(row=r_excel, column=6,
                value=f"{row['pkg_qty']} {row.get('pkg_unit') or ''}" if row.get("pkg_qty") else "—").border = border
        if row.get("num_packages") is not None:
            cell_pkg = ws.cell(row=r_excel, column=7, value=row["num_packages"])
            cell_pkg.font = Font(bold=True, color="D4AF37")
        else:
            ws.cell(row=r_excel, column=7, value="—")
        ws.cell(row=r_excel, column=7).border = border
        for col in range(8, 12):
            ws.cell(row=r_excel, column=col, value="").border = border
        ws.cell(row=r_excel, column=1).alignment = Alignment(horizontal="center")
        ws.cell(row=r_excel, column=3).alignment = Alignment(horizontal="right")
        for col in (4, 5, 6, 7):
            ws.cell(row=r_excel, column=col).alignment = Alignment(horizontal="center")
    foot_row = 5 + len(data["rows"]) + 1
    ws.cell(row=foot_row, column=1,
            value="Prosimy o uzupełnienie kolumn: cena netto, wartość netto, termin dostawy i uwagi.").font = Font(italic=True, color="666666")
    ws.merge_cells(start_row=foot_row, start_column=1, end_row=foot_row, end_column=11)
    widths = {"A": 6, "B": 40, "C": 12, "D": 11, "E": 14, "F": 14, "G": 12, "H": 18, "I": 16, "J": 14, "K": 20}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w
    buf = BytesIO()
    wb.save(buf)
    safe_name = (data["wycena_name"] or "wycena").replace("/", "_").replace(" ", "_")[:50]
    filename = f"BOM_{safe_name}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return buf.getvalue(), filename


@router.get("/wyceny/{wycena_id}/bom.pdf")
async def export_bom_pdf(wycena_id: str, _user: dict = Depends(get_current_admin)):
    data = await _build_bom(wycena_id)
    content, filename = _generate_bom_pdf_bytes(data)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _generate_bom_pdf_bytes(data: dict):
    """Refaktor iter95ah: generuj PDF jako bytes."""
    from io import BytesIO
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os as _os
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    font_bold_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    base_font, bold_font = "Helvetica", "Helvetica-Bold"
    for fp in font_paths:
        if _os.path.exists(fp):
            try:
                pdfmetrics.registerFont(TTFont("DejaVu", fp)); base_font = "DejaVu"; break
            except Exception:
                pass
    for fp in font_bold_paths:
        if _os.path.exists(fp):
            try:
                pdfmetrics.registerFont(TTFont("DejaVuBold", fp)); bold_font = "DejaVuBold"; break
            except Exception:
                pass
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), rightMargin=12 * mm, leftMargin=12 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm)
    styles = getSampleStyleSheet()
    title_st = ParagraphStyle("title", parent=styles["Title"], fontName=bold_font, fontSize=16, textColor=colors.HexColor("#3F5235"))
    sub_st = ParagraphStyle("sub", parent=styles["Normal"], fontName=base_font, fontSize=9, textColor=colors.grey)
    elements = []
    elements.append(Paragraph(f"Zapytanie ofertowe — Zestawienie materiałów: {data['wycena_name']}", title_st))
    elements.append(Paragraph(f"Data wygenerowania: {datetime.now().strftime('%Y-%m-%d %H:%M')}", sub_st))
    elements.append(Spacer(1, 6 * mm))
    table_data = [["L.p.", "Nazwa materiału", "Ilość", "Jedn.", "Opak.", "Wlk. opak.",
                   "Liczba opak.", "Cena netto/opak.", "Termin", "Uwagi"]]
    for idx, row in enumerate(data["rows"], start=1):
        if row.get("qty_in_pkg_unit") is not None:
            qty_str = f"{row['qty_in_pkg_unit']:.3f}".replace(".", ",")
            unit_str = row.get("pkg_unit") or ""
        else:
            qty_str = f"{row['quantity']:.3f}".replace(".", ",")
            unit_str = row["unit"]
        pkg_size = f"{row['pkg_qty']} {row.get('pkg_unit') or ''}" if row.get("pkg_qty") else "—"
        num_pkg = str(row["num_packages"]) if row.get("num_packages") is not None else "—"
        table_data.append([
            str(idx), row["name"], qty_str, unit_str,
            row.get("opakowanie") or "—", pkg_size, num_pkg, "", "", "",
        ])
    tbl = Table(table_data, colWidths=[10 * mm, 50 * mm, 16 * mm, 12 * mm, 18 * mm,
                                        18 * mm, 16 * mm, 22 * mm, 14 * mm, 24 * mm])
    tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), base_font, 8),
        ("FONT", (0, 0), (-1, 0), bold_font, 8),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3F5235")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("ALIGN", (3, 0), (3, -1), "CENTER"),
        ("ALIGN", (4, 0), (6, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F8F8")]),
        ("TEXTCOLOR", (6, 1), (6, -1), colors.HexColor("#B8860B")),
        ("FONT", (6, 1), (6, -1), bold_font, 8),
    ]))
    elements.append(tbl)
    elements.append(Spacer(1, 10 * mm))
    elements.append(Paragraph(
        "Prosimy o uzupełnienie kolumn: <b>cena netto za opakowanie</b>, <b>termin dostawy</b> oraz <b>uwagi</b>. "
        "Liczby opakowań zostały zaokrąglone w górę do pełnych jednostek (paleta / wiaderko / rolka).",
        ParagraphStyle("foot", parent=styles["Normal"], fontName=base_font, fontSize=8, textColor=colors.grey)
    ))
    doc.build(elements)
    safe_name = (data["wycena_name"] or "wycena").replace("/", "_").replace(" ", "_")[:50]
    filename = f"BOM_{safe_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return buf.getvalue(), filename


# ============================================================
# iter95ai: Tabela hurtowni (suppliers) + wysylka BOM emailem
# ============================================================

class SupplierCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None  # iter95aq: numer telefonu
    branze: Optional[str] = None  # branze (np. "izolacje, betony")
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    branze: Optional[str] = None
    notes: Optional[str] = None


@router.get("/wyceny/suppliers")
async def list_suppliers(_user: dict = Depends(get_current_admin)):
    rows = await db.wyceny_suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(length=None)
    return {"rows": rows}


@router.post("/wyceny/suppliers")
async def create_supplier(payload: SupplierCreate, _user: dict = Depends(get_current_admin)):
    sid = str(uuid.uuid4())
    doc = {
        "id": sid, "name": payload.name, "email": payload.email,
        "phone": payload.phone or "",
        "branze": payload.branze or "", "notes": payload.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.wyceny_suppliers.insert_one(doc)
    return {"id": sid, "ok": True}


@router.patch("/wyceny/suppliers/{sid}")
async def update_supplier(sid: str, payload: SupplierUpdate, _user: dict = Depends(get_current_admin)):
    update = payload.dict(exclude_unset=True)
    if not update:
        return {"ok": True}
    r = await db.wyceny_suppliers.update_one({"id": sid}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(404, "Hurtownia nie istnieje")
    return {"ok": True}


@router.delete("/wyceny/suppliers/{sid}")
async def delete_supplier(sid: str, _user: dict = Depends(get_current_admin)):
    r = await db.wyceny_suppliers.delete_one({"id": sid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Hurtownia nie istnieje")
    return {"ok": True}


class SendBomRequest(BaseModel):
    to_email: EmailStr
    subject: Optional[str] = None
    body: Optional[str] = None
    supplier_id: Optional[str] = None  # zapisz historie


@router.post("/wyceny/{wycena_id}/bom/send")
async def send_bom_email(wycena_id: str, payload: SendBomRequest, _user: dict = Depends(get_current_admin)):
    """Wyslij zapytanie ofertowe (BOM) na maila hurtownika z zalacznikami PDF + XLSX."""
    import base64
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise HTTPException(503, "Resend nie skonfigurowany (brak RESEND_API_KEY)")
    # Z 4 ustaleń: nadawca = biuro@fegrro.pl
    from_addr = "FeGrro <biuro@fegrro.pl>"
    try:
        import httpx
    except ImportError:
        raise HTTPException(500, "httpx not installed")
    data = await _build_bom(wycena_id)
    if not data.get("rows"):
        raise HTTPException(400, "Wycena nie zawiera materiałów do wysłania")
    xlsx_bytes, xlsx_name = _generate_bom_xlsx_bytes(data)
    pdf_bytes, pdf_name = _generate_bom_pdf_bytes(data)
    # Domyslny szablon
    wycena_name = data["wycena_name"] or "—"
    subject = payload.subject or f"Zapytanie ofertowe — {wycena_name}"
    body_text = payload.body or (
        f"Dzień dobry,\n\n"
        f"W załączeniu przesyłam zestawienie materiałów do wyceny: \u201E{wycena_name}\u201D.\n"
        f"Proszę o przygotowanie oferty cenowej (cena netto za opakowanie, termin dostawy).\n\n"
        f"Termin oferty: 7 dni.\n\n"
        f"Pozdrawiam,\nFeGrro"
    )
    body_html = "<p>" + body_text.replace("\n", "<br>") + "</p>"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "from": from_addr,
                    "to": [payload.to_email],
                    "reply_to": ["biuro@fegrro.pl"],
                    "subject": subject,
                    "html": body_html,
                    "text": body_text,
                    "attachments": [
                        {"filename": xlsx_name, "content": base64.b64encode(xlsx_bytes).decode("ascii")},
                        {"filename": pdf_name, "content": base64.b64encode(pdf_bytes).decode("ascii")},
                    ],
                },
            )
        if resp.status_code >= 300:
            logger.warning(f"Resend BOM email returned {resp.status_code}: {resp.text}")
            raise HTTPException(502, f"Resend: {resp.status_code} {resp.text}")
        result = resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Network error: {e}")
    # Zapisz w historii
    history = {
        "id": str(uuid.uuid4()),
        "wycena_id": wycena_id,
        "to_email": payload.to_email,
        "supplier_id": payload.supplier_id,
        "subject": subject,
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "message_id": result.get("id"),
    }
    await db.wyceny_bom_history.insert_one(history)
    return {"ok": True, "message_id": result.get("id")}


@router.get("/wyceny/{wycena_id}/bom/history")
async def get_bom_history(wycena_id: str, _user: dict = Depends(get_current_admin)):
    rows = await db.wyceny_bom_history.find(
        {"wycena_id": wycena_id}, {"_id": 0}
    ).sort("sent_at", -1).to_list(length=100)
    return {"rows": rows}



# ============================================================
# iter95aj: Eksport pelnej wyceny do PDF/XLSX
# ============================================================

async def _build_wycena_export(wycena_id: str):
    w = await db.wyceny.find_one({"id": wycena_id}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Wycena nie istnieje")
    stages = await db.wyceny_stages.find({"wycena_id": wycena_id}, {"_id": 0}).sort("order", 1).to_list(length=None)
    positions = await db.wyceny_positions.find({"wycena_id": wycena_id}, {"_id": 0}).sort("order", 1).to_list(length=None)
    lines = await db.wyceny_lines.find({"wycena_id": wycena_id}, {"_id": 0}).sort("order", 1).to_list(length=None)
    defaults = {
        "gir": float(w.get("default_gir_pct") or 2.0),
        "dw": float(w.get("default_dw_pct") or 2.0),
        "koszt": float(w.get("default_koszt_pct") or 2.0),
        "narzut": float(w.get("default_narzut_pct") or 0.0),
        "marza": float(w.get("default_marza_pct") or 0.0),
    }
    enriched_stages = []
    for st in stages:
        pos_list = [p for p in positions if p.get("stage_id") == st["id"]]
        es_positions = []
        for p in pos_list:
            subs = [ln for ln in lines if ln.get("position_id") == p["id"]]
            gir_pct = float(p.get("kaucja_gir_pct") if p.get("kaucja_gir_pct") is not None else defaults["gir"])
            dw_pct = float(p.get("kaucja_dw_pct") if p.get("kaucja_dw_pct") is not None else defaults["dw"])
            koszt_pct = float(p.get("koszt_budowy_pct") if p.get("koszt_budowy_pct") is not None else defaults["koszt"])
            sub_calcs = []
            budzet_zwolniony_pos = 0.0
            for s in subs:
                qty = float(s.get("quantity") or 0)
                cena = float(s.get("unit_price_netto") or 0)
                narzut = float(s.get("narzut_zapas_pct") if s.get("narzut_zapas_pct") is not None else defaults["narzut"])
                marza = float(s.get("marza_pct") if s.get("marza_pct") is not None else defaults["marza"])
                zwolniony = qty * cena * (1 + narzut / 100 + marza / 100)
                budzet_zwolniony_pos += zwolniony
                sub_calcs.append({"line": s, "qty": qty, "cena": cena, "narzut": narzut, "marza": marza, "zwolniony": zwolniony})
            kaucja_gir = budzet_zwolniony_pos * gir_pct / 100
            kaucja_dw = budzet_zwolniony_pos * dw_pct / 100
            koszt_budowy = budzet_zwolniony_pos * koszt_pct / 100
            budzet = budzet_zwolniony_pos + kaucja_gir + kaucja_dw + koszt_budowy
            manual_qty = p.get("quantity")
            if manual_qty and float(manual_qty) > 0:
                qty_pos = float(manual_qty)
            else:
                qty_pos = max([sc["qty"] for sc in sub_calcs], default=0)
            cena_pos = budzet / qty_pos if qty_pos > 0 else 0
            by_type = {"materials": [], "labor": [], "equipment": []}
            for s in subs:
                t = s.get("type")
                nm = (s.get("name") or "").strip()
                if t in by_type and nm:
                    by_type[t].append(nm)
            label_map = {"materials": "Materiały", "labor": "Robocizna", "equipment": "Sprzęt"}
            uwagi_parts = []
            for t in ("materials", "labor", "equipment"):
                if by_type[t]:
                    uwagi_parts.append(f"{label_map[t]}: " + ", ".join(by_type[t]))
            uwagi = " · ".join(uwagi_parts) or "—"
            es_positions.append({
                "position": p, "qty": qty_pos, "cena": cena_pos,
                "kaucja_gir": kaucja_gir, "kaucja_dw": kaucja_dw, "koszt_budowy": koszt_budowy,
                "budzet_zwolniony": budzet_zwolniony_pos, "budzet": budzet,
                "uwagi": uwagi, "subs_calc": sub_calcs,
            })
        enriched_stages.append({"stage": st, "positions": es_positions})
    return {"wycena": w, "stages": enriched_stages, "defaults": defaults}


def _generate_wycena_xlsx_bytes(data: dict, detail: str = "positions"):
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    wb = Workbook()
    ws = wb.active
    ws.title = "Wycena"
    wycena_name = data["wycena"].get("name", "")
    ws["A1"] = f"Wycena: {wycena_name}"
    ws["A1"].font = Font(bold=True, size=14, color="3F5235")
    ws.merge_cells("A1:M1")
    ws["A2"] = f"Data: {datetime.now().strftime('%Y-%m-%d %H:%M')} · Tryb: " + (
        "Pozycje główne" if detail == "positions" else "Pełna (z podpozycjami)")
    ws["A2"].font = Font(italic=True, size=10, color="666666")
    ws.merge_cells("A2:M2")
    headers = ["Kod", "Nazwa", "Ilość", "Jedn.", "Cena", "Narzut %", "Marża %",
               "Kaucja GIR", "Kaucja DW", "Koszt budowy", "Budżet zwolniony", "Budżet", "Uwagi"]
    header_fill = PatternFill(start_color="3F5235", end_color="3F5235", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    thin = Side(border_style="thin", color="999999")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=4, column=col, value=h)
        c.fill = header_fill; c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = border
    ws.row_dimensions[4].height = 28
    r = 5
    total_budzet = 0.0
    for st_idx, st_data in enumerate(data["stages"], start=1):
        st = st_data["stage"]
        st_cell = ws.cell(row=r, column=1, value=f"ETAP {st_idx}: {st.get('name', '')}")
        st_cell.fill = PatternFill(start_color="C8E4B5", end_color="C8E4B5", fill_type="solid")
        st_cell.font = Font(bold=True, color="3F5235")
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=13)
        r += 1
        for p_idx, pe in enumerate(st_data["positions"], start=1):
            p = pe["position"]
            code = f"{st_idx}.{p_idx}"
            ws.cell(row=r, column=1, value=code)
            ws.cell(row=r, column=2, value=p.get("name", ""))
            ws.cell(row=r, column=3, value=round(pe["qty"], 3))
            ws.cell(row=r, column=4, value=p.get("unit") or "")
            ws.cell(row=r, column=5, value=round(pe["cena"], 2))
            ws.cell(row=r, column=6, value="—")
            ws.cell(row=r, column=7, value="—")
            ws.cell(row=r, column=8, value=round(pe["kaucja_gir"], 2))
            ws.cell(row=r, column=9, value=round(pe["kaucja_dw"], 2))
            ws.cell(row=r, column=10, value=round(pe["koszt_budowy"], 2))
            ws.cell(row=r, column=11, value=round(pe["budzet_zwolniony"], 2))
            ws.cell(row=r, column=12, value=round(pe["budzet"], 2))
            ws.cell(row=r, column=13, value=pe["uwagi"])
            for c in range(1, 14):
                ws.cell(row=r, column=c).border = border
                ws.cell(row=r, column=c).font = Font(bold=True)
            ws.cell(row=r, column=12).fill = PatternFill(start_color="FFF8DC", end_color="FFF8DC", fill_type="solid")
            ws.cell(row=r, column=13).alignment = Alignment(wrap_text=True, vertical="top")
            total_budzet += pe["budzet"]
            r += 1
            if detail == "full":
                for sub_idx, sc in enumerate(pe["subs_calc"], start=1):
                    s = sc["line"]
                    sub_code = f"{code}.{sub_idx}"
                    ratio = sc["zwolniony"] / pe["budzet_zwolniony"] if pe["budzet_zwolniony"] > 0 else 0
                    sub_budzet = pe["budzet"] * ratio
                    type_label = {"materials": "Materiał", "labor": "Robocizna", "equipment": "Sprzęt"}.get(s.get("type"), "")
                    ws.cell(row=r, column=1, value=sub_code)
                    ws.cell(row=r, column=2, value=f"  ↳ {s.get('name', '')}")
                    ws.cell(row=r, column=3, value=round(sc["qty"], 3))
                    ws.cell(row=r, column=4, value=s.get("unit") or "")
                    ws.cell(row=r, column=5, value=round(sc["cena"], 2))
                    ws.cell(row=r, column=6, value=round(sc["narzut"], 1) if sc["narzut"] else "")
                    ws.cell(row=r, column=7, value=round(sc["marza"], 1) if sc["marza"] else "")
                    ws.cell(row=r, column=8, value=round(pe["kaucja_gir"] * ratio, 2))
                    ws.cell(row=r, column=9, value=round(pe["kaucja_dw"] * ratio, 2))
                    ws.cell(row=r, column=10, value=round(pe["koszt_budowy"] * ratio, 2))
                    ws.cell(row=r, column=11, value=round(sc["zwolniony"], 2))
                    ws.cell(row=r, column=12, value=round(sub_budzet, 2))
                    ws.cell(row=r, column=13, value=type_label)
                    for c in range(1, 14):
                        ws.cell(row=r, column=c).border = border
                        ws.cell(row=r, column=c).font = Font(italic=True, color="555555")
                    r += 1
    r += 1
    ws.cell(row=r, column=11, value="RAZEM:").font = Font(bold=True, size=12)
    ws.cell(row=r, column=11).alignment = Alignment(horizontal="right")
    ws.cell(row=r, column=12, value=round(total_budzet, 2)).font = Font(bold=True, size=12, color="B8860B")
    widths = {"A": 9, "B": 38, "C": 10, "D": 8, "E": 11, "F": 9, "G": 9,
              "H": 12, "I": 12, "J": 13, "K": 15, "L": 14, "M": 50}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w
    buf = BytesIO()
    wb.save(buf)
    safe_name = (wycena_name or "wycena").replace("/", "_").replace(" ", "_")[:50]
    filename = f"Wycena_{safe_name}_{'pelna' if detail == 'full' else 'pozycje'}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return buf.getvalue(), filename


def _generate_wycena_pdf_bytes(data: dict, detail: str = "positions"):
    from io import BytesIO
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os as _os
    font_paths = ["/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]
    font_bold_paths = ["/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]
    base_font, bold_font = "Helvetica", "Helvetica-Bold"
    for fp in font_paths:
        if _os.path.exists(fp):
            try:
                pdfmetrics.registerFont(TTFont("DejaVu", fp)); base_font = "DejaVu"; break
            except Exception: pass
    for fp in font_bold_paths:
        if _os.path.exists(fp):
            try:
                pdfmetrics.registerFont(TTFont("DejaVuBold", fp)); bold_font = "DejaVuBold"; break
            except Exception: pass
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), rightMargin=8 * mm, leftMargin=8 * mm,
                            topMargin=10 * mm, bottomMargin=10 * mm)
    styles = getSampleStyleSheet()
    title_st = ParagraphStyle("title", parent=styles["Title"], fontName=bold_font, fontSize=14, textColor=colors.HexColor("#3F5235"))
    sub_st = ParagraphStyle("sub", parent=styles["Normal"], fontName=base_font, fontSize=9, textColor=colors.grey)
    cell_st = ParagraphStyle("cell", parent=styles["Normal"], fontName=base_font, fontSize=7, leading=8)
    cell_b = ParagraphStyle("cellb", parent=styles["Normal"], fontName=bold_font, fontSize=7, leading=8)
    elements = []
    wycena_name = data["wycena"].get("name", "")
    elements.append(Paragraph(f"Wycena: {wycena_name}", title_st))
    elements.append(Paragraph(
        f"Data: {datetime.now().strftime('%Y-%m-%d %H:%M')} · Tryb: " +
        ("Pozycje główne" if detail == "positions" else "Pełna (z podpozycjami)"), sub_st))
    elements.append(Spacer(1, 4 * mm))
    headers = ["Kod", "Nazwa", "Ilość", "Jedn.", "Cena",
               "Narzut %", "Marża %", "Kaucja GIR", "Kaucja DW", "Koszt bud.",
               "Bud. zwol.", "Budżet", "Uwagi"]
    table_data = [headers]
    total_budzet = 0.0
    row_styles = []
    for st_idx, st_data in enumerate(data["stages"], start=1):
        st = st_data["stage"]
        row_styles.append((len(table_data), 'stage'))
        table_data.append([f"ETAP {st_idx}: {st.get('name', '')}", "", "", "", "", "", "", "", "", "", "", "", ""])
        for p_idx, pe in enumerate(st_data["positions"], start=1):
            p = pe["position"]
            code = f"{st_idx}.{p_idx}"
            row_styles.append((len(table_data), 'pos'))
            table_data.append([
                code, Paragraph(p.get("name", ""), cell_b),
                f"{pe['qty']:.2f}".replace(".", ","), p.get("unit") or "",
                f"{pe['cena']:.2f}".replace(".", ","),
                "—", "—",
                f"{pe['kaucja_gir']:.2f}".replace(".", ","),
                f"{pe['kaucja_dw']:.2f}".replace(".", ","),
                f"{pe['koszt_budowy']:.2f}".replace(".", ","),
                f"{pe['budzet_zwolniony']:.2f}".replace(".", ","),
                f"{pe['budzet']:.2f}".replace(".", ","),
                Paragraph(pe["uwagi"], cell_st),
            ])
            total_budzet += pe["budzet"]
            if detail == "full":
                for sub_idx, sc in enumerate(pe["subs_calc"], start=1):
                    s = sc["line"]
                    sub_code = f"{code}.{sub_idx}"
                    ratio = sc["zwolniony"] / pe["budzet_zwolniony"] if pe["budzet_zwolniony"] > 0 else 0
                    sub_budzet = pe["budzet"] * ratio
                    type_label = {"materials": "Materiał", "labor": "Robocizna", "equipment": "Sprzęt"}.get(s.get("type"), "")
                    row_styles.append((len(table_data), 'sub'))
                    table_data.append([
                        sub_code, Paragraph(f"\u21B3 {s.get('name', '')}", cell_st),
                        f"{sc['qty']:.2f}".replace(".", ","), s.get("unit") or "",
                        f"{sc['cena']:.2f}".replace(".", ","),
                        f"{sc['narzut']:.1f}".replace(".", ",") if sc["narzut"] else "—",
                        f"{sc['marza']:.1f}".replace(".", ",") if sc["marza"] else "—",
                        f"{pe['kaucja_gir'] * ratio:.2f}".replace(".", ","),
                        f"{pe['kaucja_dw'] * ratio:.2f}".replace(".", ","),
                        f"{pe['koszt_budowy'] * ratio:.2f}".replace(".", ","),
                        f"{sc['zwolniony']:.2f}".replace(".", ","),
                        f"{sub_budzet:.2f}".replace(".", ","),
                        type_label,
                    ])
    table_data.append(["", "", "", "", "", "", "", "", "", "", "RAZEM:",
                       f"{total_budzet:.2f}".replace(".", ",") + " zł", ""])
    tbl_styles = [
        ("FONT", (0, 0), (-1, -1), base_font, 7),
        ("FONT", (0, 0), (-1, 0), bold_font, 8),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3F5235")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (2, 1), (11, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 1), (3, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#AAAAAA")),
        ("FONT", (10, -1), (-1, -1), bold_font, 9),
        ("TEXTCOLOR", (11, -1), (11, -1), colors.HexColor("#B8860B")),
    ]
    for (idx, kind) in row_styles:
        if kind == 'stage':
            tbl_styles.append(("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#C8E4B5")))
            tbl_styles.append(("FONT", (0, idx), (-1, idx), bold_font, 8))
            tbl_styles.append(("SPAN", (0, idx), (-1, idx)))
        elif kind == 'pos':
            tbl_styles.append(("BACKGROUND", (11, idx), (11, idx), colors.HexColor("#FFF8DC")))
            tbl_styles.append(("FONT", (11, idx), (11, idx), bold_font, 7))
    tbl = Table(table_data, colWidths=[14 * mm, 50 * mm, 14 * mm, 11 * mm, 16 * mm,
                                         13 * mm, 13 * mm, 16 * mm, 16 * mm, 16 * mm,
                                         18 * mm, 18 * mm, 65 * mm], repeatRows=1)
    tbl.setStyle(TableStyle(tbl_styles))
    elements.append(tbl)
    doc.build(elements)
    safe_name = (wycena_name or "wycena").replace("/", "_").replace(" ", "_")[:50]
    filename = f"Wycena_{safe_name}_{'pelna' if detail == 'full' else 'pozycje'}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return buf.getvalue(), filename


@router.get("/wyceny/{wycena_id}/export.xlsx")
async def export_wycena_xlsx(
    wycena_id: str,
    detail: str = Query("positions", regex="^(positions|full|client)$"),
    include_surface: bool = Query(True),
    include_wskazniki: bool = Query(True),
    include_notes: bool = Query(True),
    _user: dict = Depends(get_current_admin),
):
    data = await _build_wycena_export(wycena_id)
    if detail == "client":
        opts = {
            "include_surface": include_surface,
            "include_wskazniki": include_wskazniki,
            "include_notes": include_notes,
        }
        content, filename = _generate_wycena_client_xlsx_bytes(data, opts)
    else:
        content, filename = _generate_wycena_xlsx_bytes(data, detail)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# iter95ak/95ap: PDF dla klienta - tylko nazwa, ilosc, cena, wartosc + opcjonalne sekcje
def _generate_wycena_client_pdf_bytes(data: dict, opts: Optional[dict] = None):
    opts = opts or {}
    include_surface = bool(opts.get("include_surface", True))
    include_wskazniki = bool(opts.get("include_wskazniki", True))
    include_notes = bool(opts.get("include_notes", True))
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os as _os
    font_paths = ["/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]
    font_bold_paths = ["/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]
    base_font, bold_font = "Helvetica", "Helvetica-Bold"
    for fp in font_paths:
        if _os.path.exists(fp):
            try:
                pdfmetrics.registerFont(TTFont("DejaVu", fp)); base_font = "DejaVu"; break
            except Exception: pass
    for fp in font_bold_paths:
        if _os.path.exists(fp):
            try:
                pdfmetrics.registerFont(TTFont("DejaVuBold", fp)); bold_font = "DejaVuBold"; break
            except Exception: pass

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=15 * mm, leftMargin=15 * mm,
                            topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    title_st = ParagraphStyle("title", parent=styles["Title"], fontName=bold_font, fontSize=18,
                              textColor=colors.HexColor("#3F5235"), alignment=0, spaceAfter=2)
    company_st = ParagraphStyle("company", parent=styles["Normal"], fontName=bold_font, fontSize=11,
                                textColor=colors.HexColor("#3F5235"), alignment=2)
    sub_st = ParagraphStyle("sub", parent=styles["Normal"], fontName=base_font, fontSize=9,
                            textColor=colors.grey)
    name_st = ParagraphStyle("name", parent=styles["Normal"], fontName=base_font, fontSize=9, leading=11)
    stage_st = ParagraphStyle("stage", parent=styles["Normal"], fontName=bold_font, fontSize=10,
                              textColor=colors.HexColor("#3F5235"))

    elements = []
    wycena_name = data["wycena"].get("name", "")

    # Naglowek: logo + dane firmy (jezeli logo dostepne)
    logo_paths = [
        "/app/frontend/public/icon-192x192.png",
        "/app/frontend/public/apple-touch-icon.png",
    ]
    logo_path = next((p for p in logo_paths if _os.path.exists(p)), None)
    header_cells = []
    if logo_path:
        try:
            img = Image(logo_path, width=22 * mm, height=22 * mm)
            header_cells.append(img)
        except Exception:
            header_cells.append("")
    else:
        header_cells.append("")
    header_cells.append(Paragraph(
        "FeGrro<br/>"
        "<font size=8 color='#666666'>biuro@fegrro.pl</font>",
        company_st,
    ))
    header_tbl = Table([header_cells], colWidths=[30 * mm, 150 * mm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    elements.append(header_tbl)
    elements.append(Spacer(1, 6 * mm))

    elements.append(Paragraph(f"Oferta: {wycena_name}", title_st))
    elements.append(Paragraph(
        f"Data wystawienia: {datetime.now().strftime('%Y-%m-%d')}",
        sub_st,
    ))
    elements.append(Spacer(1, 6 * mm))

    # iter95al: blok adresata (dane klienta) jezeli wypelnione
    w_doc = data["wycena"]
    client_name = (w_doc.get("client_name") or "").strip()
    client_nip = (w_doc.get("client_nip") or "").strip()
    client_address = (w_doc.get("client_address") or "").strip()
    if client_name or client_nip or client_address:
        addr_label = ParagraphStyle("addrlabel", parent=styles["Normal"], fontName=base_font, fontSize=7,
                                    textColor=colors.HexColor("#94A3B8"), spaceAfter=2)
        addr_body = ParagraphStyle("addrbody", parent=styles["Normal"], fontName=bold_font, fontSize=10,
                                   textColor=colors.HexColor("#3F5235"), leading=13)
        addr_body_sub = ParagraphStyle("addrbodysub", parent=styles["Normal"], fontName=base_font, fontSize=9,
                                       textColor=colors.HexColor("#444444"), leading=12)
        addr_inner = [Paragraph("ADRESAT", addr_label)]
        if client_name:
            addr_inner.append(Paragraph(client_name.replace("\n", "<br/>"), addr_body))
        if client_nip:
            addr_inner.append(Paragraph(f"NIP: {client_nip}", addr_body_sub))
        if client_address:
            addr_inner.append(Paragraph(client_address.replace("\n", "<br/>"), addr_body_sub))
        addr_box = Table([[addr_inner]], colWidths=[85 * mm])
        addr_box.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#3F5235")),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAF6")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(addr_box)
        elements.append(Spacer(1, 6 * mm))

    # iter95ap: sekcja Powierzchnie (PC, PC↓, PC↑, PUM) - jezeli wybrana i sa dane
    w_full = data["wycena"]
    pc = w_full.get("pc_m2")
    pc_pod = w_full.get("pc_podziemie_m2")
    pc_nad = w_full.get("pc_nadziemie_m2")
    pum = w_full.get("pum_m2")
    any_surface = any(v not in (None, "", 0) for v in (pc, pc_pod, pc_nad, pum))
    if include_surface and any_surface:
        surf_label_st = ParagraphStyle("surflabel", parent=styles["Normal"], fontName=bold_font,
                                       fontSize=9, textColor=colors.HexColor("#3F5235"), spaceAfter=2)
        elements.append(Paragraph("Powierzchnie budynku", surf_label_st))
        surf_rows = [["Powierzchnia", "Wartość"]]
        if pc not in (None, "", 0): surf_rows.append(["Powierzchnia całkowita (PC)", f"{float(pc):,.2f}".replace(",", " ").replace(".", ",") + " m²"])
        if pc_pod not in (None, "", 0): surf_rows.append(["  ↓ w tym podziemie", f"{float(pc_pod):,.2f}".replace(",", " ").replace(".", ",") + " m²"])
        if pc_nad not in (None, "", 0): surf_rows.append(["  ↑ w tym nadziemie", f"{float(pc_nad):,.2f}".replace(",", " ").replace(".", ",") + " m²"])
        if pum not in (None, "", 0): surf_rows.append(["Powierzchnia użytkowa mieszkalna (PUM)", f"{float(pum):,.2f}".replace(",", " ").replace(".", ",") + " m²"])
        surf_tbl = Table(surf_rows, colWidths=[110 * mm, 40 * mm])
        surf_tbl.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), base_font, 9),
            ("FONT", (0, 0), (-1, 0), bold_font, 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3F5235")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (1, 1), (1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CCCCCC")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAF6")]),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        elements.append(surf_tbl)
        elements.append(Spacer(1, 5 * mm))

    # Tabela: L.p. | Nazwa | Ilosc | Jedn. | Cena netto | Wartosc netto
    headers = ["L.p.", "Nazwa pozycji", "Ilość", "Jedn.", "Cena netto", "Wartość netto"]
    table_data = [headers]
    total_netto = 0.0
    row_styles = []
    lp_counter = 0
    for st_idx, st_data in enumerate(data["stages"], start=1):
        st = st_data["stage"]
        if not st_data["positions"]:
            continue
        row_styles.append((len(table_data), 'stage'))
        table_data.append([Paragraph(f"<b>Etap {st_idx}: {st.get('name', '')}</b>", stage_st),
                           "", "", "", "", ""])
        for pe in st_data["positions"]:
            p = pe["position"]
            lp_counter += 1
            qty = pe["qty"]
            # iter95ak: dla klienta uzywamy budzet (cena koncowa zawiera marze + kaucje)
            wartosc = pe["budzet"]
            cena = wartosc / qty if qty > 0 else 0
            row_styles.append((len(table_data), 'pos'))
            table_data.append([
                str(lp_counter),
                Paragraph(p.get("name", ""), name_st),
                f"{qty:.2f}".replace(".", ","),
                p.get("unit") or "",
                f"{cena:,.2f}".replace(",", " ").replace(".", ",") + " zł",
                f"{wartosc:,.2f}".replace(",", " ").replace(".", ",") + " zł",
            ])
            total_netto += wartosc

    # wiersz sumy
    row_styles.append((len(table_data), 'total'))
    table_data.append(["", "", "", "", "RAZEM netto:",
                       f"{total_netto:,.2f}".replace(",", " ").replace(".", ",") + " zł"])

    tbl_styles = [
        ("FONT", (0, 0), (-1, -1), base_font, 9),
        ("FONT", (0, 0), (-1, 0), bold_font, 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3F5235")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 1), (2, -1), "RIGHT"),
        ("ALIGN", (3, 1), (3, -1), "CENTER"),
        ("ALIGN", (4, 1), (5, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CCCCCC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F8FAF6")]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for (idx, kind) in row_styles:
        if kind == 'stage':
            tbl_styles.append(("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#E8F0E0")))
            tbl_styles.append(("SPAN", (0, idx), (-1, idx)))
            tbl_styles.append(("LEFTPADDING", (0, idx), (0, idx), 6))
        elif kind == 'total':
            tbl_styles.append(("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#FFF8DC")))
            tbl_styles.append(("FONT", (4, idx), (-1, idx), bold_font, 11))
            tbl_styles.append(("TEXTCOLOR", (5, idx), (5, idx), colors.HexColor("#B8860B")))
            tbl_styles.append(("TOPPADDING", (0, idx), (-1, idx), 8))
            tbl_styles.append(("BOTTOMPADDING", (0, idx), (-1, idx), 8))

    tbl = Table(
        table_data,
        colWidths=[12 * mm, 92 * mm, 18 * mm, 14 * mm, 27 * mm, 27 * mm],
        repeatRows=1,
    )
    tbl.setStyle(TableStyle(tbl_styles))
    elements.append(tbl)

    # iter95ap: sekcja Wskazniki kosztowe (zl/m2)
    if include_wskazniki:
        wsk_rows = []
        if pc and float(pc) > 0:
            wsk_rows.append(["PC — Powierzchnia całkowita", f"{total_netto / float(pc):,.2f}".replace(",", " ").replace(".", ",") + " zł/m²"])
        if pc_pod and float(pc_pod) > 0:
            wsk_rows.append(["PC↓ — Podziemie", f"{total_netto / float(pc_pod):,.2f}".replace(",", " ").replace(".", ",") + " zł/m²"])
        if pc_nad and float(pc_nad) > 0:
            wsk_rows.append(["PC↑ — Nadziemie", f"{total_netto / float(pc_nad):,.2f}".replace(",", " ").replace(".", ",") + " zł/m²"])
        if pum and float(pum) > 0:
            wsk_rows.append(["PUM — Pow. użytkowa mieszkalna", f"{total_netto / float(pum):,.2f}".replace(",", " ").replace(".", ",") + " zł/m²"])
        if wsk_rows:
            elements.append(Spacer(1, 5 * mm))
            wsk_label_st = ParagraphStyle("wsklabel", parent=styles["Normal"], fontName=bold_font,
                                          fontSize=9, textColor=colors.HexColor("#3F5235"), spaceAfter=2)
            elements.append(Paragraph("Wskaźniki kosztowe", wsk_label_st))
            wsk_data = [["Wskaźnik", "Wartość"]] + wsk_rows
            wsk_tbl = Table(wsk_data, colWidths=[110 * mm, 40 * mm])
            wsk_tbl.setStyle(TableStyle([
                ("FONT", (0, 0), (-1, -1), base_font, 9),
                ("FONT", (0, 0), (-1, 0), bold_font, 9),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3F5235")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (1, 1), (1, -1), "RIGHT"),
                ("FONT", (1, 1), (1, -1), bold_font, 9),
                ("TEXTCOLOR", (1, 1), (1, -1), colors.HexColor("#3F5235")),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CCCCCC")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAF6")]),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            elements.append(wsk_tbl)

    if include_notes:
        elements.append(Spacer(1, 8 * mm))
        notice_st = ParagraphStyle(
            "notice", parent=styles["Normal"], fontName=base_font, fontSize=8,
            textColor=colors.grey, leading=10,
        )
        notice = data["wycena"].get("notes") or (
            "Oferta ważna 30 dni od daty wystawienia. "
            "Podane ceny są cenami netto. Płatność wg ustaleń umowy. "
            "Zakres prac i warunki realizacji do uzgodnienia."
        )
        elements.append(Paragraph(f"<b>Uwagi:</b> {notice}", notice_st))

    doc.build(elements)
    safe_name = (wycena_name or "wycena").replace("/", "_").replace(" ", "_")[:50]
    filename = f"Oferta_{safe_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return buf.getvalue(), filename


@router.get("/wyceny/{wycena_id}/export.pdf")
async def export_wycena_pdf(
    wycena_id: str,
    detail: str = Query("positions", regex="^(positions|full|client)$"),
    inline: bool = Query(False),
    include_surface: bool = Query(True),
    include_wskazniki: bool = Query(True),
    include_notes: bool = Query(True),
    _user: dict = Depends(get_current_admin),
):
    data = await _build_wycena_export(wycena_id)
    if detail == "client":
        opts = {
            "include_surface": include_surface,
            "include_wskazniki": include_wskazniki,
            "include_notes": include_notes,
        }
        content, filename = _generate_wycena_client_pdf_bytes(data, opts)
    else:
        content, filename = _generate_wycena_pdf_bytes(data, detail)
    disposition = "inline" if inline else "attachment"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


# iter95ap: aktywny Excel dla klienta z formulami (ilosc*cena, SUM) - inwestor moze podmieniac wartosci
def _generate_wycena_client_xlsx_bytes(data: dict, opts: Optional[dict] = None):
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    opts = opts or {}
    include_surface = bool(opts.get("include_surface", True))
    include_wskazniki = bool(opts.get("include_wskazniki", True))
    include_notes = bool(opts.get("include_notes", True))

    wb = Workbook()
    ws = wb.active
    ws.title = "Oferta"
    wycena_name = data["wycena"].get("name", "")
    w_full = data["wycena"]

    # naglowek firmowy
    ws["A1"] = "FeGrro"
    ws["A1"].font = Font(bold=True, size=14, color="3F5235")
    ws["A2"] = "biuro@fegrro.pl"
    ws["A2"].font = Font(italic=True, size=9, color="666666")

    ws["A4"] = f"Oferta: {wycena_name}"
    ws["A4"].font = Font(bold=True, size=14, color="3F5235")
    ws.merge_cells("A4:F4")
    ws["A5"] = f"Data wystawienia: {datetime.now().strftime('%Y-%m-%d')}"
    ws["A5"].font = Font(italic=True, size=9, color="888888")
    ws.merge_cells("A5:F5")

    r = 7
    # adresat
    client_name = (w_full.get("client_name") or "").strip()
    client_nip = (w_full.get("client_nip") or "").strip()
    client_address = (w_full.get("client_address") or "").strip()
    if client_name or client_nip or client_address:
        ws.cell(row=r, column=1, value="ADRESAT").font = Font(bold=True, size=9, color="3F5235")
        r += 1
        if client_name:
            ws.cell(row=r, column=1, value=client_name).font = Font(bold=True, size=10, color="3F5235")
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4); r += 1
        if client_nip:
            ws.cell(row=r, column=1, value=f"NIP: {client_nip}").font = Font(size=9, color="444444"); r += 1
        if client_address:
            for line in client_address.split("\n"):
                ws.cell(row=r, column=1, value=line).font = Font(size=9, color="444444"); r += 1
        r += 1

    # powierzchnie
    pc = w_full.get("pc_m2")
    pc_pod = w_full.get("pc_podziemie_m2")
    pc_nad = w_full.get("pc_nadziemie_m2")
    pum = w_full.get("pum_m2")
    surf_items = []
    if pc not in (None, "", 0): surf_items.append(("Powierzchnia całkowita (PC)", float(pc)))
    if pc_pod not in (None, "", 0): surf_items.append(("  ↓ w tym podziemie", float(pc_pod)))
    if pc_nad not in (None, "", 0): surf_items.append(("  ↑ w tym nadziemie", float(pc_nad)))
    if pum not in (None, "", 0): surf_items.append(("Powierzchnia użytkowa mieszkalna (PUM)", float(pum)))
    surface_row_map = {}  # nazwa -> wiersz dla wskaznikow
    if include_surface and surf_items:
        ws.cell(row=r, column=1, value="Powierzchnie budynku").font = Font(bold=True, size=10, color="3F5235")
        r += 1
        header_fill = PatternFill(start_color="3F5235", end_color="3F5235", fill_type="solid")
        for col, h in enumerate(["Powierzchnia", "Wartość (m²)"], start=1):
            c = ws.cell(row=r, column=col, value=h)
            c.font = Font(bold=True, color="FFFFFF"); c.fill = header_fill
        r += 1
        for lbl, val in surf_items:
            ws.cell(row=r, column=1, value=lbl).font = Font(size=10)
            ws.cell(row=r, column=2, value=val).font = Font(size=10)
            ws.cell(row=r, column=2).number_format = '#,##0.00" m²"'
            surface_row_map[lbl] = r
            r += 1
        r += 1

    # tabela pozycji z formulami
    ws.cell(row=r, column=1, value="L.p.")
    ws.cell(row=r, column=2, value="Nazwa pozycji")
    ws.cell(row=r, column=3, value="Ilość")
    ws.cell(row=r, column=4, value="Jedn.")
    ws.cell(row=r, column=5, value="Cena netto")
    ws.cell(row=r, column=6, value="Wartość netto")
    header_row = r
    header_fill = PatternFill(start_color="3F5235", end_color="3F5235", fill_type="solid")
    for col in range(1, 7):
        c = ws.cell(row=header_row, column=col)
        c.font = Font(bold=True, color="FFFFFF"); c.fill = header_fill
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    r += 1

    thin = Side(border_style="thin", color="CCCCCC")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    stage_fill = PatternFill(start_color="E8F0E0", end_color="E8F0E0", fill_type="solid")

    lp = 0
    first_pos_row = None
    last_pos_row = None
    for st_idx, st_data in enumerate(data["stages"], start=1):
        st = st_data["stage"]
        if not st_data["positions"]:
            continue
        st_cell = ws.cell(row=r, column=1, value=f"Etap {st_idx}: {st.get('name', '')}")
        st_cell.font = Font(bold=True, color="3F5235"); st_cell.fill = stage_fill
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
        # tlo na zlaczonych
        for col in range(1, 7):
            ws.cell(row=r, column=col).fill = stage_fill
        r += 1
        for pe in st_data["positions"]:
            p = pe["position"]
            lp += 1
            qty = float(pe["qty"] or 0)
            wartosc = float(pe["budzet"] or 0)
            cena = wartosc / qty if qty > 0 else 0
            ws.cell(row=r, column=1, value=lp).alignment = Alignment(horizontal="center")
            ws.cell(row=r, column=2, value=p.get("name", ""))
            ws.cell(row=r, column=3, value=qty).number_format = '#,##0.00'
            ws.cell(row=r, column=4, value=p.get("unit") or "").alignment = Alignment(horizontal="center")
            ws.cell(row=r, column=5, value=cena).number_format = '#,##0.00" zł"'
            # iter95ap: AKTYWNA FORMULA wartosc = ilosc * cena
            ws.cell(row=r, column=6, value=f"=C{r}*E{r}").number_format = '#,##0.00" zł"'
            ws.cell(row=r, column=6).font = Font(bold=True)
            for col in range(1, 7):
                ws.cell(row=r, column=col).border = border
            if first_pos_row is None:
                first_pos_row = r
            last_pos_row = r
            r += 1

    # wiersz sumy z formula
    sum_row = r
    ws.cell(row=r, column=5, value="RAZEM netto:").font = Font(bold=True, size=12)
    ws.cell(row=r, column=5).alignment = Alignment(horizontal="right")
    if first_pos_row and last_pos_row:
        ws.cell(row=r, column=6, value=f"=SUM(F{first_pos_row}:F{last_pos_row})")
    else:
        ws.cell(row=r, column=6, value=0)
    ws.cell(row=r, column=6).font = Font(bold=True, size=12, color="B8860B")
    ws.cell(row=r, column=6).number_format = '#,##0.00" zł"'
    ws.cell(row=r, column=6).fill = PatternFill(start_color="FFF8DC", end_color="FFF8DC", fill_type="solid")
    for col in range(5, 7):
        ws.cell(row=r, column=col).border = border
    r += 2

    # wskazniki: dziele SUM przez powierzchnie - aktywne formuly!
    if include_wskazniki and (pc or pc_pod or pc_nad or pum) and last_pos_row:
        ws.cell(row=r, column=1, value="Wskaźniki kosztowe").font = Font(bold=True, size=10, color="3F5235")
        r += 1
        for col, h in enumerate(["Wskaźnik", "Wartość"], start=1):
            c = ws.cell(row=r, column=col, value=h)
            c.font = Font(bold=True, color="FFFFFF"); c.fill = header_fill
        r += 1
        sum_cell = f"F{sum_row}"
        def _wsk(label, val):
            nonlocal r
            if val and float(val) > 0 and label in surface_row_map:
                surf_cell = f"B{surface_row_map[label]}"
                ws.cell(row=r, column=1, value=label.replace("  ", "") + " (zł/m²)")
                ws.cell(row=r, column=2, value=f"={sum_cell}/{surf_cell}")
                ws.cell(row=r, column=2).number_format = '#,##0.00" zł/m²"'
                ws.cell(row=r, column=2).font = Font(bold=True, color="3F5235")
                r += 1
        _wsk("Powierzchnia całkowita (PC)", pc)
        _wsk("  ↓ w tym podziemie", pc_pod)
        _wsk("  ↑ w tym nadziemie", pc_nad)
        _wsk("Powierzchnia użytkowa mieszkalna (PUM)", pum)
        r += 1

    if include_notes:
        notice = w_full.get("notes") or (
            "Oferta ważna 30 dni od daty wystawienia. "
            "Podane ceny są cenami netto. Płatność wg ustaleń umowy. "
            "Zakres prac i warunki realizacji do uzgodnienia."
        )
        ws.cell(row=r, column=1, value="Uwagi:").font = Font(bold=True, size=9, color="666666")
        r += 1
        ws.cell(row=r, column=1, value=notice).font = Font(size=8, color="666666")
        ws.cell(row=r, column=1).alignment = Alignment(wrap_text=True, vertical="top")
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
        ws.row_dimensions[r].height = 40

    # szerokosci kolumn
    widths = {"A": 8, "B": 45, "C": 12, "D": 8, "E": 14, "F": 16}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

    # info dla inwestora w tooltipie naglowka kolumny F
    from openpyxl.comments import Comment
    ws.cell(row=header_row, column=6).comment = Comment(
        "Formuła: ilość × cena netto. Możesz zmienić ilość lub cenę — wartość przeliczy się automatycznie.",
        "FeGrro"
    )

    buf = BytesIO()
    wb.save(buf)
    safe_name = (wycena_name or "wycena").replace("/", "_").replace(" ", "_")[:50]
    filename = f"Oferta_{safe_name}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return buf.getvalue(), filename
