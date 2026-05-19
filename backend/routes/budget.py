"""
Budzetowanie budow - moduł do planowania i kontroli realizacji budowy.

Trzy poziomy danych:
  1. budget_lines       - pozycje budzetu (kategoria, plan netto, kaucje, jednostka)
  2. budget_progress    - zaawansowanie % per pozycja per miesiac (protokol)
  3. budget_tasks       - zadania harmonogramu (data start, koniec, %)

Integracja z modulem finansowym:
  - finance_zapisy.budget_line_id (opcjonalny FK) - mozliwosc przypisania zapisu
    do konkretnej pozycji budzetowej. Wykonanie liczone z sumy netto/brutto
    zapisow z dopasowanym budget_line_id.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from io import BytesIO
import uuid
import logging
from urllib.parse import quote

from database import db
from auth import get_current_admin

logger = logging.getLogger(__name__)
router = APIRouter()


# ============== MODELS ==============

class BudgetLineCreate(BaseModel):
    budowa_id: str
    category: str = Field(..., description="Kategoria np. 'Beton', 'Stal', 'Robocizna'")
    name: str = Field(..., description="Konkretna pozycja np. 'Beton C8/10 chudziaki'")
    unit: Optional[str] = Field(None, description="Jednostka np. m3, t, mb")
    quantity: float = 0.0
    unit_price_netto: float = 0.0
    plan_netto: Optional[float] = None  # jezeli puste, liczymy quantity * unit_price_netto
    kaucja_gir_pct: float = 0.0  # % kaucji GIR (np. 5%)
    kaucja_dw_pct: float = 0.0  # % kaucji DW
    is_income: bool = False  # True dla pozycji przychodowych
    notes: Optional[str] = None
    order: int = 0


class BudgetLineUpdate(BaseModel):
    category: Optional[str] = None
    name: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[float] = None
    unit_price_netto: Optional[float] = None
    plan_netto: Optional[float] = None
    kaucja_gir_pct: Optional[float] = None
    kaucja_dw_pct: Optional[float] = None
    is_income: Optional[bool] = None
    notes: Optional[str] = None
    order: Optional[int] = None


class BudgetProgressSet(BaseModel):
    year: int
    month: int = Field(..., ge=1, le=12)
    progress_pct: float = Field(..., ge=0, le=100)
    notes: Optional[str] = None


class BudgetTaskCreate(BaseModel):
    budowa_id: str
    name: str
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    progress_pct: float = Field(0.0, ge=0, le=100)
    color: Optional[str] = None
    notes: Optional[str] = None
    dependencies: List[str] = []  # lista task_id zaleznosci
    order: int = 0


class BudgetTaskUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    progress_pct: Optional[float] = None
    color: Optional[str] = None
    notes: Optional[str] = None
    dependencies: Optional[List[str]] = None
    order: Optional[int] = None


# ============== HELPERS ==============

def _compute_plan(line: dict) -> float:
    """Zwraca plan_netto. Jezeli zdefiniowany jawnie - uzywa go, inaczej liczy."""
    plan = line.get("plan_netto")
    if plan is not None:
        return float(plan)
    return round(float(line.get("quantity") or 0) * float(line.get("unit_price_netto") or 0), 2)


# ============== ENDPOINTS: LINES ==============

@router.get("/budget/budowy")
async def list_budowy_budgets(_user: dict = Depends(get_current_admin)):
    """Lista budow z podsumowaniem budzetu (czy ma pozycje, suma planu i wykonania)."""
    budowy = await db.finance_budowy.find({}, {"_id": 0, "id": 1, "name": 1, "code": 1}).to_list(length=1000)
    result = []
    for b in budowy:
        bid = b["id"]
        lines = await db.budget_lines.find({"budowa_id": bid}, {"_id": 0}).to_list(length=2000)
        # Wykonanie - suma netto z finance_zapisy gdzie budget_line_id IN lines
        line_ids = [ln["id"] for ln in lines]
        execution_netto = 0.0
        execution_brutto = 0.0
        if line_ids:
            pipe = [
                {"$match": {"budget_line_id": {"$in": line_ids}}},
                {"$group": {"_id": None,
                             "netto": {"$sum": "$netto"},
                             "brutto": {"$sum": "$brutto"}}},
            ]
            async for r in db.finance_zapisy.aggregate(pipe):
                execution_netto = float(r.get("netto") or 0)
                execution_brutto = float(r.get("brutto") or 0)

        plan_netto = sum(_compute_plan(ln) for ln in lines if not ln.get("is_income"))
        plan_income = sum(_compute_plan(ln) for ln in lines if ln.get("is_income"))
        # Zadania harmonogramu
        tasks_count = await db.budget_tasks.count_documents({"budowa_id": bid})
        result.append({
            "budowa_id": bid,
            "name": b.get("name") or "",
            "code": b.get("code") or "",
            "lines_count": len(lines),
            "tasks_count": tasks_count,
            "plan_costs_netto": round(plan_netto, 2),
            "plan_income_netto": round(plan_income, 2),
            "execution_netto": round(execution_netto, 2),
            "execution_brutto": round(execution_brutto, 2),
        })
    return {"rows": result}


@router.get("/budget/{budowa_id}/lines")
async def get_lines(budowa_id: str, _user: dict = Depends(get_current_admin)):
    """Pozycje budzetowe danej budowy + wyliczone wykonanie."""
    lines = await db.budget_lines.find(
        {"budowa_id": budowa_id}, {"_id": 0}
    ).sort([("order", 1), ("created_at", 1)]).to_list(length=2000)

    # Wykonanie per linia (agregat z finance_zapisy)
    line_ids = [ln["id"] for ln in lines]
    exec_map: dict = {}
    if line_ids:
        pipe = [
            {"$match": {"budget_line_id": {"$in": line_ids}}},
            {"$group": {"_id": "$budget_line_id",
                         "netto": {"$sum": "$netto"},
                         "brutto": {"$sum": "$brutto"},
                         "count": {"$sum": 1}}},
        ]
        async for r in db.finance_zapisy.aggregate(pipe):
            exec_map[r["_id"]] = {
                "netto": round(float(r["netto"] or 0), 2),
                "brutto": round(float(r["brutto"] or 0), 2),
                "count": r["count"],
            }

    for ln in lines:
        plan = _compute_plan(ln)
        ln["plan_netto_computed"] = round(plan, 2)
        ex = exec_map.get(ln["id"], {"netto": 0.0, "brutto": 0.0, "count": 0})
        ln["execution_netto"] = ex["netto"]
        ln["execution_brutto"] = ex["brutto"]
        ln["execution_count"] = ex["count"]
        ln["remaining_netto"] = round(plan - ex["netto"], 2)
        ln["progress_pct"] = round((ex["netto"] / plan) * 100, 1) if plan > 0 else 0.0
        ln["kaucja_gir_amount"] = round(plan * (float(ln.get("kaucja_gir_pct") or 0) / 100), 2)
        ln["kaucja_dw_amount"] = round(plan * (float(ln.get("kaucja_dw_pct") or 0) / 100), 2)

    return {"rows": lines}


@router.post("/budget/lines")
async def create_line(payload: BudgetLineCreate, current_user: dict = Depends(get_current_admin)):
    line_id = str(uuid.uuid4())
    doc = {
        "id": line_id,
        "budowa_id": payload.budowa_id,
        "category": payload.category,
        "name": payload.name,
        "unit": payload.unit,
        "quantity": payload.quantity,
        "unit_price_netto": payload.unit_price_netto,
        "plan_netto": payload.plan_netto,
        "kaucja_gir_pct": payload.kaucja_gir_pct,
        "kaucja_dw_pct": payload.kaucja_dw_pct,
        "is_income": payload.is_income,
        "notes": payload.notes,
        "order": payload.order,
        "created_at": datetime.now().isoformat(),
        "created_by": current_user["sub"],
    }
    await db.budget_lines.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/budget/lines/{line_id}")
async def update_line(line_id: str, payload: BudgetLineUpdate, current_user: dict = Depends(get_current_admin)):
    existing = await db.budget_lines.find_one({"id": line_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Pozycja nie istnieje")
    updates = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    updates["updated_at"] = datetime.now().isoformat()
    updates["updated_by"] = current_user["sub"]
    await db.budget_lines.update_one({"id": line_id}, {"$set": updates})
    new_doc = await db.budget_lines.find_one({"id": line_id}, {"_id": 0})
    return new_doc


@router.delete("/budget/lines/{line_id}")
async def delete_line(line_id: str, _user: dict = Depends(get_current_admin)):
    # Usun rowniez progres przypisany do tej linii
    await db.budget_progress.delete_many({"budget_line_id": line_id})
    # Wyczysc budget_line_id w zapisach (nie usuwaj zapisow!)
    await db.finance_zapisy.update_many({"budget_line_id": line_id}, {"$unset": {"budget_line_id": ""}})
    res = await db.budget_lines.delete_one({"id": line_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Pozycja nie istnieje")
    return {"ok": True}


# ============== ENDPOINTS: PROGRESS (PROTOKOL) ==============

@router.get("/budget/{budowa_id}/progress")
async def get_progress(budowa_id: str, year: Optional[int] = Query(None),
                       _user: dict = Depends(get_current_admin)):
    """Macierz zaawansowania: pozycja x miesiac.
    Zwraca slownik {line_id: {YYYY-MM: pct, ...}}."""
    line_ids_cursor = db.budget_lines.find({"budowa_id": budowa_id}, {"_id": 0, "id": 1})
    line_ids = [ln["id"] async for ln in line_ids_cursor]
    if not line_ids:
        return {"rows": [], "year": year}

    q: dict = {"budget_line_id": {"$in": line_ids}}
    if year:
        q["year"] = year
    items = await db.budget_progress.find(q, {"_id": 0}).to_list(length=20000)
    return {"rows": items, "year": year}


@router.post("/budget/lines/{line_id}/progress")
async def set_progress(line_id: str, payload: BudgetProgressSet,
                       current_user: dict = Depends(get_current_admin)):
    """Ustawia/aktualizuje zaawansowanie dla linii budzetowej w danym miesiacu."""
    line = await db.budget_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(404, "Pozycja nie istnieje")
    plan = _compute_plan(line)
    value_netto = round(plan * (payload.progress_pct / 100.0), 2)
    key = {"budget_line_id": line_id, "year": payload.year, "month": payload.month}
    update_set = {
        **key,
        "progress_pct": payload.progress_pct,
        "value_netto": value_netto,
        "notes": payload.notes,
        "updated_at": datetime.now().isoformat(),
        "updated_by": current_user["sub"],
    }
    existing = await db.budget_progress.find_one(key, {"_id": 0})
    if existing:
        await db.budget_progress.update_one(key, {"$set": update_set})
        update_set["id"] = existing["id"]
    else:
        update_set["id"] = str(uuid.uuid4())
        update_set["created_at"] = datetime.now().isoformat()
        await db.budget_progress.insert_one(update_set)
    update_set.pop("_id", None)
    return update_set


# ============== ENDPOINTS: TASKS (HARMONOGRAM) ==============

@router.get("/budget/{budowa_id}/tasks")
async def get_tasks(budowa_id: str, _user: dict = Depends(get_current_admin)):
    rows = await db.budget_tasks.find(
        {"budowa_id": budowa_id}, {"_id": 0}
    ).sort([("order", 1), ("start_date", 1)]).to_list(length=1000)
    return {"rows": rows}


@router.post("/budget/tasks")
async def create_task(payload: BudgetTaskCreate, current_user: dict = Depends(get_current_admin)):
    task_id = str(uuid.uuid4())
    doc = {
        "id": task_id,
        "budowa_id": payload.budowa_id,
        "name": payload.name,
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "progress_pct": payload.progress_pct,
        "color": payload.color or "#D4AF37",
        "notes": payload.notes,
        "dependencies": payload.dependencies,
        "order": payload.order,
        "created_at": datetime.now().isoformat(),
        "created_by": current_user["sub"],
    }
    await db.budget_tasks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/budget/tasks/{task_id}")
async def update_task(task_id: str, payload: BudgetTaskUpdate,
                       current_user: dict = Depends(get_current_admin)):
    existing = await db.budget_tasks.find_one({"id": task_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Zadanie nie istnieje")
    updates = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    updates["updated_at"] = datetime.now().isoformat()
    updates["updated_by"] = current_user["sub"]
    await db.budget_tasks.update_one({"id": task_id}, {"$set": updates})
    new_doc = await db.budget_tasks.find_one({"id": task_id}, {"_id": 0})
    return new_doc


@router.delete("/budget/tasks/{task_id}")
async def delete_task(task_id: str, _user: dict = Depends(get_current_admin)):
    # Usun referencje z dependencies innych zadan
    await db.budget_tasks.update_many(
        {"dependencies": task_id},
        {"$pull": {"dependencies": task_id}},
    )
    res = await db.budget_tasks.delete_one({"id": task_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Zadanie nie istnieje")
    return {"ok": True}


# ============== PROTOKOL XLSX GENERATOR ==============

MONTH_NAMES_PL = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
                  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"]


def _month_range(year: int, month: int):
    """Zwraca (data_od, data_do) w formacie YYYY-MM-DD dla danego miesiaca."""
    from calendar import monthrange
    last_day = monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last_day:02d}"


@router.get("/budget/{budowa_id}/protokol/{year}/{month}")
async def generate_protokol_xlsx(
    budowa_id: str,
    year: int,
    month: int,
    _user: dict = Depends(get_current_admin),
):
    """Generuje xlsx z protokolem miesiecznym w stylu firmowym FEGRRO:

    Naglowek (lewa strona - logo, prawa - tytul + nr umowy):
      PROTOKOL STANU ZAAWANSOWANIA ROBOT NR X    DO UMOWY    {nr_umowy}

    Pola:
      OKRES ROZLICZENIOWY:  {data_od}   DO   {data_do}
      ZAMAWIAJACY:          {dane_zamawiajacego}
      WYKONAWCA:            {dane_wykonawcy}

    Tabela 10 kolumn z 3 zielonymi naglowkami zlaczonymi:
      LP | Robocizna | Jd. | Ilosc | Cena | Wartosc | NARASTAJACO [WARTOSC %] | POPRZEDNI MIESIAC [WARTOSC %] | MIESIAC ROZLICZENIOWY [WARTOSC %]

    Sekcje (kategorie) jako szare wiersze grupowe bez wartosci.
    Wiersz RAZEM zielony z sumami.

    Stopka:
      DATA I MIEJSCE SPORZADZENIA PROTOKOLU: ...   DO ZAFAKTUROWANIA: {suma_miesiaca} zl NETTO
      Linie podpisow ZAMAWIAJACY / WYKONAWCA
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.drawing.image import Image as XLImage
    import os

    if month < 1 or month > 12:
        raise HTTPException(400, "Nieprawidlowy miesiac (1-12)")

    budowa = await db.finance_budowy.find_one({"id": budowa_id}, {"_id": 0})
    if not budowa:
        raise HTTPException(404, "Budowa nie istnieje")

    # Pobierz pozycje (tylko koszty) z zachowaniem kolejnosci tak by zachowac grupowanie po kategorii
    lines = await db.budget_lines.find(
        {"budowa_id": budowa_id, "is_income": {"$ne": True}}, {"_id": 0}
    ).sort([("order", 1), ("created_at", 1)]).to_list(length=5000)

    line_ids = [ln["id"] for ln in lines]
    progress_curr = {}  # line_id -> pct (biezacy mies.)
    progress_prev = {}  # line_id -> pct (poprzedni mies.)
    if line_ids:
        async for p in db.budget_progress.find(
            {"budget_line_id": {"$in": line_ids}, "year": year, "month": month},
            {"_id": 0, "budget_line_id": 1, "progress_pct": 1},
        ):
            progress_curr[p["budget_line_id"]] = float(p["progress_pct"])
        prev_month = month - 1 if month > 1 else 12
        # Bierzemy najwyzszy progres do (prev_year, prev_month) wlacznie
        async for p in db.budget_progress.find(
            {"budget_line_id": {"$in": line_ids},
             "$or": [
                 {"year": {"$lt": year}},
                 {"year": year, "month": {"$lte": prev_month}},
             ]},
            {"_id": 0, "budget_line_id": 1, "progress_pct": 1, "year": 1, "month": 1},
        ).sort([("year", -1), ("month", -1)]):
            lid = p["budget_line_id"]
            if lid not in progress_prev:
                progress_prev[lid] = float(p["progress_pct"])

    # Numer protokolu = liczba unikalnych miesiecy z progresem poprzedzajacych biezacy + 1
    distinct_months = set()
    async for p in db.budget_progress.find(
        {"budget_line_id": {"$in": line_ids},
         "$or": [{"year": {"$lt": year}}, {"year": year, "month": {"$lt": month}}]},
        {"_id": 0, "year": 1, "month": 1},
    ):
        distinct_months.add((p["year"], p["month"]))
    nr = len(distinct_months) + 1

    # ===== WORKBOOK =====
    wb = Workbook()
    ws = wb.active
    ws.title = f"Protokol {month:02d}-{year}"

    # === Style ===
    bold = Font(bold=True, size=10, name="Calibri")
    bold_big = Font(bold=True, size=14, name="Calibri")
    normal = Font(size=10, name="Calibri")
    green_fill = PatternFill("solid", fgColor="92D050")  # zielony jak w wzorcu
    gray_fill = PatternFill("solid", fgColor="D9D9D9")
    thin = Side(border_style="thin", color="000000")
    box = Border(left=thin, right=thin, top=thin, bottom=thin)
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left = Alignment(horizontal="left", vertical="center", wrap_text=True)
    right = Alignment(horizontal="right", vertical="center")

    # === LOGO + NAGLOWEK ===
    logo_path = "/app/frontend/public/icon-512x512.png"
    if os.path.exists(logo_path):
        try:
            img = XLImage(logo_path)
            img.width = 110
            img.height = 110
            ws.add_image(img, "B2")
        except Exception:
            pass

    # Tytul + nr (kolumna F-J w gornej czesci)
    ws["F2"] = "PROTOKÓŁ STANU ZAAWANSOWANIA ROBÓT NR"
    ws["F2"].font = bold_big
    ws["F2"].alignment = left
    ws.merge_cells("F2:J2")
    ws["K2"] = nr
    ws["K2"].font = bold_big
    ws["K2"].alignment = center
    ws["F3"] = "DO UMOWY"
    ws["F3"].font = bold
    ws["F3"].alignment = left
    ws.merge_cells("F3:J3")
    ws["K3"] = budowa.get("umowa_nr", "")
    ws["K3"].font = bold
    ws["K3"].alignment = left

    # === POLA OKRES / ZAMAWIAJACY / WYKONAWCA ===
    from calendar import monthrange
    last_day = monthrange(year, month)[1]
    d_from = f"{year:04d}-{month:02d}-01"
    d_to = f"{last_day:02d}.{month:02d}.{year:04d}"

    ws["B9"] = "OKRES ROZLICZENIOWY:"
    ws["B9"].font = bold
    ws["F9"] = d_from
    ws["G9"] = "DO"
    ws["G9"].font = bold
    ws["H9"] = d_to

    ws["B11"] = "ZAMAWIAJĄCY:"
    ws["B11"].font = bold
    ws["F11"] = budowa.get("zamawiajacy", "")
    ws["F11"].alignment = left
    ws.merge_cells("F11:K12")
    ws.row_dimensions[11].height = 18
    ws.row_dimensions[12].height = 18

    ws["B14"] = "WYKONAWCA:"
    ws["B14"].font = bold
    ws["F14"] = budowa.get("wykonawca", "FEGRRO SP. Z O.O.  NIP: 589-206-61-74")
    ws.merge_cells("F14:K14")

    # === TABELA - PODWOJNE NAGLOWKI ===
    HEAD_TOP = 17  # wiersz z grupami NARASTAJACO / POPRZEDNI / MIESIAC ROZLICZ.
    HEAD_BOT = 18  # wiersz z LP/Robocizna/Jd./Ilosc/Cena/Wartosc + WARTOSC/%

    # Gorne komorki LP-Wartosc puste, dolne wypelnione
    ws.cell(row=HEAD_TOP, column=1, value="").fill = green_fill
    for c_idx in range(1, 7):
        ws.cell(row=HEAD_TOP, column=c_idx).fill = green_fill
        ws.cell(row=HEAD_TOP, column=c_idx).border = box
    # Trzy grupy: kol 7-8, 9-10, 11-12
    ws.merge_cells(start_row=HEAD_TOP, start_column=7, end_row=HEAD_TOP, end_column=8)
    g1 = ws.cell(row=HEAD_TOP, column=7, value="NARASTAJĄCO")
    g1.font = bold
    g1.fill = green_fill
    g1.alignment = center
    g1.border = box
    ws.merge_cells(start_row=HEAD_TOP, start_column=9, end_row=HEAD_TOP, end_column=10)
    g2 = ws.cell(row=HEAD_TOP, column=9, value="POPRZEDNI MIESIĄC")
    g2.font = bold
    g2.fill = green_fill
    g2.alignment = center
    g2.border = box
    ws.merge_cells(start_row=HEAD_TOP, start_column=11, end_row=HEAD_TOP, end_column=12)
    g3 = ws.cell(row=HEAD_TOP, column=11, value="MIESIĄC ROZLICZENIOWY")
    g3.font = bold
    g3.fill = green_fill
    g3.alignment = center
    g3.border = box

    headers_bot = ["LP", "Robocizna", "Jd.", "Ilość", "Cena", "Wartość",
                   "WARTOŚĆ", "%", "WARTOŚĆ", "%", "WARTOŚĆ", "%"]
    for i, h in enumerate(headers_bot, start=1):
        cell = ws.cell(row=HEAD_BOT, column=i, value=h)
        cell.font = bold
        cell.fill = green_fill
        cell.alignment = center
        cell.border = box
    ws.row_dimensions[HEAD_TOP].height = 22
    ws.row_dimensions[HEAD_BOT].height = 22

    # === WIERSZE TABELI z grupowaniem po kategorii ===
    r = HEAD_BOT + 1
    sum_budzet = 0.0
    sum_narast = 0.0
    sum_prev = 0.0
    sum_miesiac = 0.0
    lp = 1
    last_cat = None

    for ln in lines:
        cat = ln.get("category") or ""
        if cat and cat != last_cat:
            # Wiersz sekcji - tylko nazwa kategorii, szare tlo
            for ci in range(1, 13):
                cell = ws.cell(row=r, column=ci, value="")
                cell.fill = gray_fill
                cell.border = box
            ws.cell(row=r, column=2, value=cat).font = bold
            ws.cell(row=r, column=2).alignment = left
            r += 1
            last_cat = cat

        plan = _compute_plan(ln)
        narast_pct = progress_curr.get(ln["id"], progress_prev.get(ln["id"], 0.0))
        prev_pct = progress_prev.get(ln["id"], 0.0)
        miesiac_pct = max(0.0, narast_pct - prev_pct)
        narast_val = round(plan * narast_pct / 100, 2)
        prev_val = round(plan * prev_pct / 100, 2)
        miesiac_val = round(plan * miesiac_pct / 100, 2)

        row_data = [
            lp, ln.get("name", ""), ln.get("unit") or "",
            ln.get("quantity", 0) or 0,
            ln.get("unit_price_netto", 0) or 0,
            plan,
            narast_val, narast_pct / 100.0,
            prev_val, prev_pct / 100.0,
            miesiac_val, miesiac_pct / 100.0,
        ]
        for i, v in enumerate(row_data, start=1):
            cell = ws.cell(row=r, column=i, value=v)
            cell.border = box
            cell.font = normal
            if i == 1:
                cell.alignment = center
            elif i == 2:
                cell.alignment = left
            elif i == 3:
                cell.alignment = center
            else:
                cell.alignment = right
            # Formatowanie
            if i in (4,):
                cell.number_format = "#,##0.0"
            elif i in (5, 6, 7, 9, 11):
                cell.number_format = "#,##0.00 zł"
            elif i in (8, 10, 12):
                cell.number_format = "0.00%"

        sum_budzet += plan
        sum_narast += narast_val
        sum_prev += prev_val
        sum_miesiac += miesiac_val
        r += 1
        lp += 1

    # === WIERSZ RAZEM (zielony) ===
    razem_data = [
        "", "RAZEM", "", "", "", sum_budzet,
        sum_narast, (sum_narast / sum_budzet) if sum_budzet else 0.0,
        sum_prev, (sum_prev / sum_budzet) if sum_budzet else 0.0,
        sum_miesiac, (sum_miesiac / sum_budzet) if sum_budzet else 0.0,
    ]
    for i, v in enumerate(razem_data, start=1):
        cell = ws.cell(row=r, column=i, value=v)
        cell.font = bold
        cell.fill = green_fill
        cell.border = box
        if i == 2:
            cell.alignment = center
        elif isinstance(v, (int, float)):
            cell.alignment = right
            if i in (8, 10, 12):
                cell.number_format = "0%"
            else:
                cell.number_format = "#,##0.00 zł"
        else:
            cell.alignment = center

    # === SZEROKOSCI KOLUMN ===
    widths = [5, 50, 6, 8, 10, 13, 13, 8, 13, 8, 13, 8]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # === STOPKA ===
    foot = r + 3
    ws.cell(row=foot, column=2, value="DATA I MIEJSCE SPORZĄDZENIA PROTOKOŁU:").font = bold
    ws.cell(row=foot, column=2).alignment = left
    today = datetime.now().strftime("%d.%m.%Y")
    ws.cell(row=foot, column=6, value=today).alignment = left

    ws.cell(row=foot, column=10, value="DO ZAFAKTUROWANIA:").font = bold
    ws.cell(row=foot, column=10).alignment = right
    cell = ws.cell(row=foot, column=11, value=sum_miesiac)
    cell.font = bold
    cell.number_format = "#,##0.00 zł"
    cell.alignment = right
    ws.cell(row=foot, column=12, value="NETTO").font = bold
    ws.cell(row=foot, column=12).alignment = left

    # Linie podpisow
    sig = foot + 4
    ws.cell(row=sig, column=6, value="..................................").alignment = center
    ws.cell(row=sig, column=11, value="..................................").alignment = center
    ws.cell(row=sig + 1, column=6, value="Zamawiający\n(podpis i pieczęć)").alignment = Alignment(horizontal="center", wrap_text=True)
    ws.cell(row=sig + 1, column=11, value="Wykonawca\n(podpis i pieczęć)").alignment = Alignment(horizontal="center", wrap_text=True)
    ws.cell(row=sig + 1, column=6).font = bold
    ws.cell(row=sig + 1, column=11).font = bold
    ws.row_dimensions[sig + 1].height = 32

    # Wysokosci wierszy header
    ws.row_dimensions[2].height = 22
    ws.row_dimensions[3].height = 22
    for rh in (5, 6, 7, 8):
        ws.row_dimensions[rh].height = 14  # spacer pod logo

    # === EXPORT ===
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    safe_name = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in (budowa.get("name", "budowa")))
    filename = f"Protokol_{safe_name}_{year}-{month:02d}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="protokol.xlsx"; filename*=UTF-8\'\'{quote(filename)}'
        },
    )

