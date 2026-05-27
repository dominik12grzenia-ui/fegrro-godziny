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
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from database import db
from auth import get_current_admin

router = APIRouter()


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


# iter95af: zestawienie potrzebnych materialow (Bill of Materials)
async def _build_bom(wycena_id: str):
    """Buduj zestawienie materialow: grupuj po (nazwa, jednostka), sumuj ilosci."""
    wycena = await db.wyceny.find_one({"id": wycena_id}, {"_id": 0})
    if not wycena:
        raise HTTPException(404, "Wycena nie istnieje")
    lines = await db.wyceny_lines.find(
        {"wycena_id": wycena_id, "type": "materials"}, {"_id": 0}
    ).to_list(length=None)
    # Grupuj po (nazwa, jednostka)
    grouped: dict = {}
    for ln in lines:
        name = (ln.get("name") or "").strip()
        if not name:
            continue
        unit = (ln.get("unit") or "").strip()
        qty = float(ln.get("quantity") or 0)
        if qty <= 0:
            continue
        key = (name.lower(), unit.lower())
        if key not in grouped:
            grouped[key] = {
                "name": name,
                "unit": unit,
                "quantity": 0.0,
                "unit_price_netto": float(ln.get("unit_price_netto") or 0),
                "occurrences": 0,
            }
        grouped[key]["quantity"] += qty
        grouped[key]["occurrences"] += 1
    rows = sorted(grouped.values(), key=lambda r: r["name"].lower())
    return {"wycena_name": wycena.get("name", ""), "rows": rows}


@router.get("/wyceny/{wycena_id}/bom")
async def get_materials_bom(wycena_id: str, _user: dict = Depends(get_current_admin)):
    """JSON: zestawienie materialow do podgladu we frontendzie."""
    return await _build_bom(wycena_id)


@router.get("/wyceny/{wycena_id}/bom.xlsx")
async def export_bom_xlsx(wycena_id: str, _user: dict = Depends(get_current_admin)):
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    data = await _build_bom(wycena_id)
    wb = Workbook()
    ws = wb.active
    ws.title = "Zestawienie materiałów"
    # Naglowek
    ws["A1"] = f"Zestawienie materiałów: {data['wycena_name']}"
    ws["A1"].font = Font(bold=True, size=14, color="D4AF37")
    ws.merge_cells("A1:E1")
    ws["A2"] = f"Data wygenerowania: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    ws["A2"].font = Font(italic=True, size=10, color="666666")
    ws.merge_cells("A2:E2")
    # Naglowki kolumn
    headers = ["L.p.", "Nazwa materiału", "Ilość", "Jednostka", "Cena jedn. netto (PLN)"]
    header_fill = PatternFill(start_color="3F5235", end_color="3F5235", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    thin = Side(border_style="thin", color="999999")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=4, column=col, value=h)
        c.fill = header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = border
    # Dane
    total_value = 0.0
    for idx, row in enumerate(data["rows"], start=1):
        r_excel = 4 + idx
        ws.cell(row=r_excel, column=1, value=idx).border = border
        ws.cell(row=r_excel, column=2, value=row["name"]).border = border
        ws.cell(row=r_excel, column=3, value=round(row["quantity"], 3)).border = border
        ws.cell(row=r_excel, column=4, value=row["unit"]).border = border
        ws.cell(row=r_excel, column=5, value=round(row["unit_price_netto"], 2)).border = border
        ws.cell(row=r_excel, column=1).alignment = Alignment(horizontal="center")
        ws.cell(row=r_excel, column=3).alignment = Alignment(horizontal="right")
        ws.cell(row=r_excel, column=4).alignment = Alignment(horizontal="center")
        ws.cell(row=r_excel, column=5).alignment = Alignment(horizontal="right")
        total_value += row["quantity"] * row["unit_price_netto"]
    # Suma
    sum_row = 5 + len(data["rows"])
    ws.cell(row=sum_row, column=2, value="RAZEM:").font = Font(bold=True)
    ws.cell(row=sum_row, column=5, value=round(total_value, 2)).font = Font(bold=True, color="D4AF37")
    ws.cell(row=sum_row, column=5).alignment = Alignment(horizontal="right")
    # Szerokosci kolumn
    ws.column_dimensions["A"].width = 6
    ws.column_dimensions["B"].width = 45
    ws.column_dimensions["C"].width = 12
    ws.column_dimensions["D"].width = 12
    ws.column_dimensions["E"].width = 18
    # Stream
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    safe_name = (data["wycena_name"] or "wycena").replace("/", "_").replace(" ", "_")[:50]
    filename = f"BOM_{safe_name}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/wyceny/{wycena_id}/bom.pdf")
async def export_bom_pdf(wycena_id: str, _user: dict = Depends(get_current_admin)):
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os
    data = await _build_bom(wycena_id)
    # Zarejestruj font UTF-8 (DejaVu)
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
        if os.path.exists(fp):
            try:
                pdfmetrics.registerFont(TTFont("DejaVu", fp))
                base_font = "DejaVu"
                break
            except Exception:
                pass
    for fp in font_bold_paths:
        if os.path.exists(fp):
            try:
                pdfmetrics.registerFont(TTFont("DejaVuBold", fp))
                bold_font = "DejaVuBold"
                break
            except Exception:
                pass
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=15 * mm, leftMargin=15 * mm,
                            topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    title_st = ParagraphStyle("title", parent=styles["Title"], fontName=bold_font, fontSize=16, textColor=colors.HexColor("#3F5235"))
    sub_st = ParagraphStyle("sub", parent=styles["Normal"], fontName=base_font, fontSize=9, textColor=colors.grey)
    elements = []
    elements.append(Paragraph(f"Zestawienie materiałów: {data['wycena_name']}", title_st))
    elements.append(Paragraph(f"Data wygenerowania: {datetime.now().strftime('%Y-%m-%d %H:%M')}", sub_st))
    elements.append(Spacer(1, 6 * mm))
    table_data = [["L.p.", "Nazwa materiału", "Ilość", "Jedn.", "Cena netto (PLN)"]]
    total_value = 0.0
    for idx, row in enumerate(data["rows"], start=1):
        table_data.append([
            str(idx),
            row["name"],
            f"{row['quantity']:.3f}".replace(",", " ").replace(".", ","),
            row["unit"],
            f"{row['unit_price_netto']:.2f}".replace(".", ","),
        ])
        total_value += row["quantity"] * row["unit_price_netto"]
    table_data.append(["", "RAZEM:", "", "", f"{total_value:.2f}".replace(".", ",") + " zł"])
    tbl = Table(table_data, colWidths=[14 * mm, 90 * mm, 22 * mm, 18 * mm, 36 * mm])
    tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), base_font, 9),
        ("FONT", (0, 0), (-1, 0), bold_font, 9),
        ("FONT", (0, -1), (-1, -1), bold_font, 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3F5235")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("ALIGN", (3, 0), (3, -1), "CENTER"),
        ("ALIGN", (4, 0), (4, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F5F5DC")),
        ("TEXTCOLOR", (4, -1), (4, -1), colors.HexColor("#B8860B")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F8F8F8")]),
    ]))
    elements.append(tbl)
    elements.append(Spacer(1, 10 * mm))
    elements.append(Paragraph(
        "Wygenerowane z systemu FeGrro ERP. Proszę o przygotowanie oferty na powyższe pozycje.",
        ParagraphStyle("foot", parent=styles["Normal"], fontName=base_font, fontSize=8, textColor=colors.grey)
    ))
    doc.build(elements)
    buf.seek(0)
    safe_name = (data["wycena_name"] or "wycena").replace("/", "_").replace(" ", "_")[:50]
    filename = f"BOM_{safe_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
