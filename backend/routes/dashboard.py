"""Dashboard KPI + alerty finansowe.

iter95bq: Pakiet C - biznes value.
Endpointy:
- GET /api/dashboard/kpi              - sumaryczne KPI (cash flow MTD, marza, top kontrahenci)
- GET /api/dashboard/top-costs        - top 3 kategorie kosztow w okresie
- GET /api/dashboard/alerts           - alerty: faktury nieoplacone >30 dni, budowy nad budzet
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime, timedelta
from collections import defaultdict

from database import db
from auth import get_current_finance_reader
from audit_log import soft_delete_filter

router = APIRouter()


@router.get("/dashboard/kpi")
async def dashboard_kpi(
    year: int = Query(None),
    month: int = Query(None),
    months: Optional[str] = Query(None, description="CSV numery miesiecy do wliczania do YTD, np. '1,2,3,7'."),
    _user: dict = Depends(get_current_finance_reader),
):
    """KPI dashboard - dokladnie te same sumy co Rachunek Wynikow.

    iter94b: dashboard i Rachunek Wynikow ciagna z _compute_rachunek_wynikow_data
    (nowa funkcja pomocnicza). Sprzedaz per budowa moze pokazywac inne sumy —
    ona jest per-budowa i nie widzi kosztow bez przypisania do budowy.

    Parametry:
    - `year`, `month` (opcjonalne, domyslnie: obecne)
    - `months` (CSV) — jesli podane, YTD sumuje tylko wybrane miesiace
    """
    from routes.finance_reports import _compute_rachunek_wynikow_totals  # late import
    now = datetime.now()
    y = year or now.year
    m = month or now.month

    # Parse months list
    months_list: Optional[list] = None
    if months:
        try:
            months_list = sorted({int(x.strip()) for x in months.split(",") if x.strip() and 1 <= int(x.strip()) <= 12})
            if not months_list:
                months_list = None
        except (ValueError, TypeError):
            months_list = None

    # MTD - tylko biezacy miesiac (jak RW dla tego miesiaca)
    mtd = await _compute_rachunek_wynikow_totals(y, months_list=[m])
    rev_mtd = mtd["przychody"]
    cost_mtd_full = mtd["koszty_full"]
    cash_mtd = round(rev_mtd - cost_mtd_full, 2)

    # YTD - caly rok lub wybrane miesiace
    ytd = await _compute_rachunek_wynikow_totals(y, months_list=months_list)
    rev_ytd = ytd["przychody"]
    cost_ytd_full = ytd["koszty_full"]
    cash_ytd = round(rev_ytd - cost_ytd_full, 2)

    sd_filter = soft_delete_filter()

    # Active sites
    active_sites = await db.finance_budowy.count_documents({
        **sd_filter,
        "$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}],
    })

    # Margin avg (zysk / przychod * 100) — zeby zgadzalo sie z 'Zysk%' w Sprzedazy
    margin_avg_pct = 0.0
    if rev_ytd > 0:
        margin_avg_pct = round((rev_ytd - cost_ytd_full) / rev_ytd * 100, 1)

    return {
        "period": {"year": y, "month": m},
        "cash_flow_mtd": cash_mtd,
        "cash_flow_ytd": cash_ytd,
        "revenue_mtd": round(rev_mtd, 2),
        "revenue_ytd": round(rev_ytd, 2),
        "costs_mtd": round(cost_mtd_full, 2),
        "costs_ytd": round(cost_ytd_full, 2),
        "active_sites_count": active_sites,
        "margin_avg_pct": margin_avg_pct,
    }


@router.get("/dashboard/top-costs")
async def top_costs(
    year: int = Query(None),
    month: int = Query(None),
    limit: int = Query(3, ge=1, le=20),
    _user: dict = Depends(get_current_finance_reader),
):
    """Top N kategorii kosztow w danym okresie."""
    now = datetime.now()
    y = year or now.year
    m = month or now.month
    start = f"{y:04d}-{m:02d}-01"
    end = f"{y:04d}-{m:02d}-31"

    pipe = [
        {"$match": {**soft_delete_filter(), "date": {"$gte": start, "$lte": end},
                    "kod_category": {"$nin": ["PZS", "PRZ", "REVENUE", "SPRZ"]}}},
        {"$group": {"_id": {"kod_id": "$kod_id", "category": "$kod_category"},
                    "total": {"$sum": "$netto"},
                    "count": {"$sum": 1}}},
        {"$sort": {"total": -1}},
        {"$limit": limit},
    ]
    raw = await db.finance_zapisy.aggregate(pipe).to_list(length=limit)

    # Pobierz nazwy kodow
    kod_ids = [r["_id"].get("kod_id") for r in raw if r["_id"].get("kod_id")]
    kody_dict = {}
    if kod_ids:
        async for k in db.finance_kody.find({"id": {"$in": kod_ids}}, {"_id": 0, "id": 1, "name": 1, "category": 1}):
            kody_dict[k["id"]] = k

    out = []
    for r in raw:
        kod_id = r["_id"].get("kod_id")
        cat = r["_id"].get("category", "OTHER")
        kod = kody_dict.get(kod_id, {})
        out.append({
            "kod_id": kod_id,
            "kod_name": kod.get("name") or kod_id or "Bez kategorii",
            "category": cat,
            "total": round(float(r.get("total") or 0), 2),
            "count": int(r.get("count") or 0),
        })
    return {"rows": out, "period": {"year": y, "month": m}}


@router.get("/dashboard/alerts")
async def dashboard_alerts(_user: dict = Depends(get_current_finance_reader)):
    """Alerty dla ksiegowej i admina:
    - unpaid_invoices_30d: faktury nieoplacone >30 dni
    - sites_over_budget: budowy gdzie wykonanie > 100% planu
    - missing_kod: zapisy bez kategorii (kod_id)
    """
    alerts = []
    now = datetime.now()

    # 1) Nieoplacone faktury >30 dni (status != 'paid' i data >30 dni temu)
    cutoff_30d = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    overdue = await db.finance_invoices.find(
        {**soft_delete_filter(),
         "date": {"$lt": cutoff_30d},
         "$or": [{"payment_status": {"$ne": "paid"}}, {"payment_status": {"$exists": False}}],
         "kod_category": {"$in": ["PZS", "PRZ", "SPRZ"]}},  # tylko przychodowe = oczekujace platnosci
        {"_id": 0, "id": 1, "nr_faktury": 1, "kontrahent": 1, "netto": 1, "date": 1},
    ).limit(50).to_list(length=50)
    if overdue:
        alerts.append({
            "type": "unpaid_invoices_30d",
            "severity": "warning",
            "title": f"{len(overdue)} faktur nieoplaconych powyzej 30 dni",
            "count": len(overdue),
            "total_amount": round(sum(float(o.get("netto") or 0) for o in overdue), 2),
            "items": overdue[:10],  # max 10 dla UI
        })

    # 2) Zapisy bez kategorii (kod_id) w biezacym roku
    cnt_missing = await db.finance_zapisy.count_documents({
        **soft_delete_filter(),
        "date": {"$gte": f"{now.year:04d}-01-01"},
        "$or": [{"kod_id": None}, {"kod_id": ""}, {"kod_id": {"$exists": False}}],
    })
    if cnt_missing > 0:
        alerts.append({
            "type": "missing_kod",
            "severity": "info",
            "title": f"{cnt_missing} zapisow bez kategorii (kod_id) w tym roku",
            "count": cnt_missing,
        })

    # 3) Budowy nad budzet (wykonanie > plan_costs)
    budowy = await db.finance_budowy.find(
        {**soft_delete_filter(),
         "$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}]},
        {"_id": 0, "id": 1, "name": 1, "code": 1},
    ).to_list(length=200)

    over_budget = []
    budowa_ids = [b["id"] for b in budowy]
    # Pobierz plan i wykonanie hurtem
    all_lines = await db.budget_lines.find(
        {"budowa_id": {"$in": budowa_ids}}, {"_id": 0, "id": 1, "budowa_id": 1, "is_income": 1, "parent_id": 1,
                                              "quantity": 1, "unit_price": 1, "plan_netto": 1},
    ).to_list(length=None)
    lines_by_budowa = defaultdict(list)
    for ln in all_lines:
        lines_by_budowa[ln["budowa_id"]].append(ln)

    # Wykonanie po budowach
    all_line_ids = [ln["id"] for ln in all_lines]
    line_to_budowa = {ln["id"]: ln["budowa_id"] for ln in all_lines}
    exec_by_budowa = defaultdict(float)
    if all_line_ids:
        pipe = [
            {"$match": {**soft_delete_filter(), "budget_line_id": {"$in": all_line_ids}}},
            {"$group": {"_id": "$budget_line_id", "netto": {"$sum": "$netto"}}},
        ]
        async for r in db.finance_zapisy.aggregate(pipe):
            bid = line_to_budowa.get(r["_id"])
            if bid:
                exec_by_budowa[bid] += float(r.get("netto") or 0)

    for b in budowy:
        lines = lines_by_budowa.get(b["id"], [])
        parent_ids = {ln.get("parent_id") for ln in lines if ln.get("parent_id")}
        plan = 0.0
        for ln in lines:
            if ln.get("is_income"):
                continue
            if ln["id"] in parent_ids:
                continue
            p = ln.get("plan_netto")
            if p is None:
                p = float(ln.get("quantity") or 0) * float(ln.get("unit_price") or 0)
            plan += float(p)
        exec_v = exec_by_budowa.get(b["id"], 0.0)
        if plan > 0 and exec_v > plan:
            over_budget.append({
                "budowa_id": b["id"],
                "name": b["name"],
                "code": b.get("code"),
                "plan": round(plan, 2),
                "execution": round(exec_v, 2),
                "over_by": round(exec_v - plan, 2),
                "over_pct": round((exec_v - plan) / plan * 100, 1),
            })

    if over_budget:
        over_budget.sort(key=lambda x: x["over_by"], reverse=True)
        alerts.append({
            "type": "sites_over_budget",
            "severity": "critical",
            "title": f"{len(over_budget)} budow przekroczylo budzet",
            "count": len(over_budget),
            "items": over_budget[:10],
        })

    return {"alerts": alerts, "alerts_count": len(alerts)}
