"""Finanse: Panel prognoz przyszlych kosztow/zyskow.

Wydzielone z routes/finance.py (iter95be split). 2 endpointy:
- GET /finance/forecast
- GET /finance/forecast/details
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime
from calendar import monthrange
from typing import Optional

from database import db
from auth import get_current_admin

router = APIRouter()


# ============================================================
# iter95at: PANEL PROGNOZ przyszlych kosztow/zyskow
# ============================================================

def _month_iter(start_y: int, start_m: int, n: int):
    """Yield (year, month) dla n kolejnych miesiecy od (start_y, start_m)."""
    y, m = start_y, start_m
    for _ in range(n):
        yield (y, m)
        m += 1
        if m > 12:
            m = 1
            y += 1


def _month_overlap_days(start: "datetime", end: "datetime", y: int, m: int) -> int:
    """Liczba dni nakladania sie zakresu [start, end] z miesiacem (y, m)."""
    m_start = datetime(y, m, 1)
    m_end = datetime(y, m, monthrange(y, m)[1])
    if start > m_end or end < m_start:
        return 0
    overlap_start = max(start, m_start)
    overlap_end = min(end, m_end)
    return (overlap_end - overlap_start).days + 1


def _parse_date_any(s: str):
    """Spróbuj sparsować datę z różnych formatów: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY."""
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


# Mapowanie type podpozycji budzetu -> kategoria w prognozie
_BUDGET_TYPE_LABEL = {
    "materials": "Materiały",
    "labor": "Robocizna",
    "equipment": "Sprzęt",
}


@router.get("/finance/forecast")
async def get_finance_forecast(
    back: int = Query(6, ge=1, le=24),
    forward: int = Query(3, ge=1, le=24),
    _user: dict = Depends(get_current_admin),
):
    """Prognoza P&L: koszty firmowe (srednia historyczna) + koszty/przychody budow (z harmonogramow).

    Args:
      back: ile miesiecy wstecz do liczenia sredniej kosztow firmowych
      forward: ile miesiecy w przod prognozowac

    Returns:
      {
        company_costs: { categories: [{code, name, avg_monthly, total_back, count}], total_avg },
        building_costs: { months: [{y, m, materials, equipment, labor, other, total, per_budowa: [...]}], totals },
        building_income: { months: [{y, m, value}], total },
        balance: { months: [{y, m, income, costs_company, costs_building, profit}], totals }
      }
    """
    from calendar import monthrange as _mr  # noqa
    today = datetime.now()
    cur_y, cur_m = today.year, today.month

    # ============ Sekcja A: koszty firmowe ============
    # Range: ostatnie `back` pełnych miesięcy (z bieżącym włącznie)
    start_y, start_m = cur_y, cur_m
    for _ in range(back - 1):
        start_m -= 1
        if start_m < 1:
            start_m = 12
            start_y -= 1
    start_date = f"{start_y:04d}-{start_m:02d}-01"
    end_last_day = _mr(cur_y, cur_m)[1]
    end_date = f"{cur_y:04d}-{cur_m:02d}-{end_last_day:02d}"

    # Pobierz wszystkie kody (cache do mapowania kod_id -> category + name)
    kody_list = await db.finance_kody.find({}, {"_id": 0}).to_list(length=None)
    kod_by_id = {k["id"]: k for k in kody_list}

    # Koszty firmowe = kategorie KP, KSB, KSP (BEZ KBB - to budowy)
    company_cats = ("KP", "KSB", "KSP")
    # iter95dv: pomin soft-deleted zapisy w prognozie
    zapisy = await db.finance_zapisy.find(
        {"date": {"$gte": start_date, "$lte": end_date}, "is_income": {"$ne": True},
         "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "kod_id": 1, "netto": 1, "date": 1, "budowa_id": 1},
    ).to_list(length=None)

    # Agreguj per kod_id (tylko z kategorii firmowych)
    company_by_kod = {}
    for z in zapisy:
        kid = z.get("kod_id")
        if not kid:
            continue
        kod = kod_by_id.get(kid)
        if not kod or kod.get("category") not in company_cats:
            continue
        company_by_kod.setdefault(kid, {"total": 0.0, "count": 0})
        company_by_kod[kid]["total"] += float(z.get("netto") or 0)
        company_by_kod[kid]["count"] += 1

    company_categories = []
    company_total_avg = 0.0
    for kid, agg in company_by_kod.items():
        kod = kod_by_id.get(kid, {})
        avg = agg["total"] / back if back > 0 else 0
        company_categories.append({
            "code": kid,
            "name": kod.get("name", kid),
            "category": kod.get("category", ""),
            "total_back": round(agg["total"], 2),
            "avg_monthly": round(avg, 2),
            "count": agg["count"],
        })
        company_total_avg += avg
    # Sortuj po srednim koszcie malejaco
    company_categories.sort(key=lambda x: -x["avg_monthly"])

    # ============ Sekcja B+C: koszty i przychody budow z harmonogramow ============
    # Pobierz aktywne budowy (nie zarchiwizowane)
    budowy = await db.finance_budowy.find(
        {"$or": [{"archived": {"$ne": True}}, {"archived": False}]},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(length=None)
    budowa_name_by_id = {b["id"]: b["name"] for b in budowy}
    active_ids = list(budowa_name_by_id.keys())

    # Stages z datami startu i konca
    stages_raw = await db.budget_stages.find(
        {"budowa_id": {"$in": active_ids}},
        {"_id": 0},
    ).to_list(length=None)
    stage_info = {}  # stage_id -> (start_dt, end_dt, budowa_id)
    for st in stages_raw:
        sd = _parse_date_any(st.get("start_date") or "")
        ed = _parse_date_any(st.get("end_date") or "")
        if not sd or not ed or ed < sd:
            continue
        stage_info[st["id"]] = (sd, ed, st["budowa_id"])

    # Lines (koszty + przychody)
    lines = await db.budget_lines.find(
        {"budowa_id": {"$in": active_ids}, "stage_id": {"$in": list(stage_info.keys())}},
        {"_id": 0},
    ).to_list(length=None) if stage_info else []

    # Wyklucz parentow (linie ktorych ID sa parent_id w innych)
    parent_ids = {ln.get("parent_id") for ln in lines if ln.get("parent_id")}

    # Rozloz linie liniowo na miesiace forecast (od cur do cur+forward-1)
    forward_months = list(_month_iter(cur_y, cur_m, forward))

    # Struktury wynikowe
    bcosts_by_month = {(y, m): {
        "materials": 0.0, "equipment": 0.0, "labor": 0.0, "other": 0.0,
        "total": 0.0, "per_budowa": {},
    } for (y, m) in forward_months}
    bincome_by_month = {(y, m): 0.0 for (y, m) in forward_months}

    for ln in lines:
        if ln.get("id") in parent_ids:
            continue
        sid = ln.get("stage_id")
        info = stage_info.get(sid)
        if not info:
            continue
        sd, ed, bid = info
        plan = float(ln.get("plan_netto") or 0) or (
            float(ln.get("quantity") or 0) * float(ln.get("unit_price_netto") or 0)
        )
        if plan == 0:
            continue
        total_days = (ed - sd).days + 1
        if total_days <= 0:
            continue
        ltype = ln.get("type") or "materials"
        is_inc = bool(ln.get("is_income"))
        for (y, m) in forward_months:
            overlap = _month_overlap_days(sd, ed, y, m)
            if overlap <= 0:
                continue
            portion = plan * (overlap / total_days)
            if is_inc:
                bincome_by_month[(y, m)] += portion
            else:
                slot = bcosts_by_month[(y, m)]
                bn = budowa_name_by_id.get(bid, "—")
                slot["per_budowa"].setdefault(bn, 0.0)
                slot["per_budowa"][bn] += portion
                slot["total"] += portion
                if ltype == "materials":
                    slot["materials"] += portion
                elif ltype == "equipment":
                    slot["equipment"] += portion
                elif ltype == "labor":
                    slot["labor"] += portion
                else:
                    slot["other"] += portion

    # Zamien per_budowa dict -> list, zaokraglij
    building_months = []
    bcosts_total = {"materials": 0, "equipment": 0, "labor": 0, "other": 0, "total": 0}
    for (y, m) in forward_months:
        s = bcosts_by_month[(y, m)]
        per_b = [{"name": n, "value": round(v, 2)} for n, v in sorted(s["per_budowa"].items(), key=lambda kv: -kv[1])]
        building_months.append({
            "y": y, "m": m,
            "materials": round(s["materials"], 2),
            "equipment": round(s["equipment"], 2),
            "labor": round(s["labor"], 2),
            "other": round(s["other"], 2),
            "total": round(s["total"], 2),
            "per_budowa": per_b,
        })
        for k in ("materials", "equipment", "labor", "other", "total"):
            bcosts_total[k] += s[k]
    for k in bcosts_total:
        bcosts_total[k] = round(bcosts_total[k], 2)

    income_months = []
    income_total = 0.0
    for (y, m) in forward_months:
        v = bincome_by_month[(y, m)]
        income_months.append({"y": y, "m": m, "value": round(v, 2)})
        income_total += v

    # ============ Sekcja D: bilans ============
    balance_months = []
    balance_total = {"income": 0, "costs_company": 0, "costs_building": 0, "profit": 0}
    for i, (y, m) in enumerate(forward_months):
        inc = bincome_by_month[(y, m)]
        cc = company_total_avg  # staly miesieczny koszt firmowy
        cb = bcosts_by_month[(y, m)]["total"]
        profit = inc - cc - cb
        balance_months.append({
            "y": y, "m": m,
            "income": round(inc, 2),
            "costs_company": round(cc, 2),
            "costs_building": round(cb, 2),
            "profit": round(profit, 2),
        })
        balance_total["income"] += inc
        balance_total["costs_company"] += cc
        balance_total["costs_building"] += cb
        balance_total["profit"] += profit
    for k in balance_total:
        balance_total[k] = round(balance_total[k], 2)

    return {
        "params": {"back": back, "forward": forward},
        "range": {"history_start": start_date, "history_end": end_date},
        "company_costs": {
            "categories": company_categories,
            "total_avg_monthly": round(company_total_avg, 2),
            "forecast_total_period": round(company_total_avg * forward, 2),
        },
        "building_costs": {
            "months": building_months,
            "totals": bcosts_total,
        },
        "building_income": {
            "months": income_months,
            "total": round(income_total, 2),
        },
        "balance": {
            "months": balance_months,
            "totals": balance_total,
        },
    }


@router.get("/finance/forecast/details")
async def get_forecast_details(
    kind: str = Query(..., pattern="^(company|company_category|building|income)$"),
    back: int = Query(6, ge=1, le=24),
    forward: int = Query(3, ge=1, le=24),
    code: Optional[str] = Query(None),  # kod_id dla company_category
    _user: dict = Depends(get_current_admin),
):
    """Szczegoly per typ KPI:
    - company: wszystkie zapisy firmowe (KP/KSB/KSP) za okres back
    - company_category: zapisy konkretnej kategorii (z code=kod_id)
    - building: pozycje budzetu kosztowe rozlozone na miesiace prognozy
    - income: pozycje budzetu przychodowe (is_income=True) rozlozone na miesiace
    """
    from calendar import monthrange as _mr
    today = datetime.now()
    cur_y, cur_m = today.year, today.month
    start_y, start_m = cur_y, cur_m
    for _ in range(back - 1):
        start_m -= 1
        if start_m < 1:
            start_m = 12
            start_y -= 1
    start_date = f"{start_y:04d}-{start_m:02d}-01"
    end_last_day = _mr(cur_y, cur_m)[1]
    end_date = f"{cur_y:04d}-{cur_m:02d}-{end_last_day:02d}"

    if kind in ("company", "company_category"):
        kody = await db.finance_kody.find({}, {"_id": 0}).to_list(length=None)
        kod_by_id = {k["id"]: k for k in kody}
        company_cats = ("KP", "KSB", "KSP")
        q = {"date": {"$gte": start_date, "$lte": end_date}, "is_income": {"$ne": True}}
        if kind == "company_category":
            if not code:
                raise HTTPException(400, "Wymagany parametr 'code' dla company_category")
            q["kod_id"] = code
        zapisy = await db.finance_zapisy.find(q, {"_id": 0}).sort("date", -1).to_list(length=2000)
        # filtruj po firmowych kategoriach (kind=company - wszystkie firmowe; company_category - tylko ten code)
        budowy = await db.finance_budowy.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(length=None)
        budowa_name_by_id = {b["id"]: b.get("name", "—") for b in budowy}
        rows = []
        for z in zapisy:
            kid = z.get("kod_id")
            kod = kod_by_id.get(kid) if kid else None
            if not kod:
                continue
            if kind == "company" and kod.get("category") not in company_cats:
                continue
            rows.append({
                "id": z.get("id"),
                "date": z.get("date"),
                "kod_id": kid,
                "kod_name": kod.get("name", kid),
                "category": kod.get("category", ""),
                "netto": float(z.get("netto") or 0),
                "comment": z.get("comment") or "",
                "budowa_id": z.get("budowa_id") or "",
                "budowa_name": budowa_name_by_id.get(z.get("budowa_id") or "", ""),
            })
        total = round(sum(r["netto"] for r in rows), 2)
        return {
            "rows": rows,
            "total": total,
            "avg_monthly": round(total / back, 2) if back else 0,
            "count": len(rows),
            "range": {"start": start_date, "end": end_date},
        }

    # building / income: rozloz po miesiacach prognozy
    budowy = await db.finance_budowy.find(
        {"$or": [{"archived": {"$ne": True}}, {"archived": False}]},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(length=None)
    budowa_name_by_id = {b["id"]: b["name"] for b in budowy}
    active_ids = list(budowa_name_by_id.keys())
    stages_raw = await db.budget_stages.find(
        {"budowa_id": {"$in": active_ids}}, {"_id": 0},
    ).to_list(length=None)
    stage_info = {}
    stage_name_by_id = {}
    for st in stages_raw:
        sd = _parse_date_any(st.get("start_date") or "")
        ed = _parse_date_any(st.get("end_date") or "")
        stage_name_by_id[st["id"]] = st.get("name", "—")
        if not sd or not ed or ed < sd:
            continue
        stage_info[st["id"]] = (sd, ed, st["budowa_id"])
    lines = await db.budget_lines.find(
        {"budowa_id": {"$in": active_ids}, "stage_id": {"$in": list(stage_info.keys())}},
        {"_id": 0},
    ).to_list(length=None) if stage_info else []
    parent_ids = {ln.get("parent_id") for ln in lines if ln.get("parent_id")}
    forward_months = list(_month_iter(cur_y, cur_m, forward))

    want_income = (kind == "income")
    rows = []
    for ln in lines:
        if ln.get("id") in parent_ids:
            continue
        is_inc = bool(ln.get("is_income"))
        if is_inc != want_income:
            continue
        sid = ln.get("stage_id")
        info = stage_info.get(sid)
        if not info:
            continue
        sd, ed, bid = info
        plan = float(ln.get("plan_netto") or 0) or (
            float(ln.get("quantity") or 0) * float(ln.get("unit_price_netto") or 0)
        )
        if plan == 0:
            continue
        total_days = (ed - sd).days + 1
        if total_days <= 0:
            continue
        # rozloz na miesiace
        per_month = []
        in_window_total = 0.0
        for (y, m) in forward_months:
            overlap = _month_overlap_days(sd, ed, y, m)
            if overlap <= 0:
                continue
            portion = plan * (overlap / total_days)
            per_month.append({"y": y, "m": m, "value": round(portion, 2)})
            in_window_total += portion
        if not per_month:
            continue
        rows.append({
            "id": ln.get("id"),
            "budowa_name": budowa_name_by_id.get(bid, "—"),
            "stage_name": stage_name_by_id.get(sid, "—"),
            "start_date": sd.strftime("%Y-%m-%d"),
            "end_date": ed.strftime("%Y-%m-%d"),
            "category": ln.get("category", ""),
            "type": ln.get("type", ""),
            "name": ln.get("name", ""),
            "unit": ln.get("unit", ""),
            "quantity": float(ln.get("quantity") or 0),
            "unit_price_netto": float(ln.get("unit_price_netto") or 0),
            "plan_netto": round(plan, 2),
            "in_window": round(in_window_total, 2),
            "per_month": per_month,
        })
    # sortuj malejaco po in_window
    rows.sort(key=lambda r: -r["in_window"])
    total = round(sum(r["in_window"] for r in rows), 2)
    return {
        "rows": rows,
        "total": total,
        "count": len(rows),
        "months": [{"y": y, "m": m} for (y, m) in forward_months],
    }



