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
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import db
from auth import get_current_admin

router = APIRouter()


# =========== MODELE ===========
class WycenaCreate(BaseModel):
    name: str
    notes: Optional[str] = None


class WycenaUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None


class StageCreate(BaseModel):
    wycena_id: str
    name: str
    order: int = 0


class PositionCreate(BaseModel):
    wycena_id: str
    stage_id: str
    name: str
    order: int = 0
    # iter95q: pola dla widoku Excel-style wyceny
    kaucja_gir_pct: Optional[float] = None    # %, domyslnie 2.0
    kaucja_dw_pct: Optional[float] = None     # %, domyslnie 2.0
    koszt_budowy_pct: Optional[float] = None  # %, domyslnie 2.0
    koszt_prognozowany: Optional[float] = None  # kwota wpisywana recznie


class PositionUpdate(BaseModel):
    name: Optional[str] = None
    order: Optional[int] = None
    kaucja_gir_pct: Optional[float] = None
    kaucja_dw_pct: Optional[float] = None
    koszt_budowy_pct: Optional[float] = None
    koszt_prognozowany: Optional[float] = None


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


class LineUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[float] = None
    unit_price_netto: Optional[float] = None
    type: Optional[str] = None
    order: Optional[int] = None


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
        "created_at": datetime.now().isoformat(),
        "created_by": current_user["sub"],
    }
    await db.wyceny.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/wyceny/{wycena_id}")
async def update_wycena(wycena_id: str, payload: WycenaUpdate,
                         current_user: dict = Depends(get_current_admin)):
    updates = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
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
