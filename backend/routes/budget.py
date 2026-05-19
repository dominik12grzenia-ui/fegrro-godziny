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
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
import uuid
import logging

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
