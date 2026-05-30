from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime

from database import db
from auth import get_current_user

router = APIRouter()


@router.get("/public/hours/{token}")
async def get_public_hours(token: str):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Invalid link")
    
    entries = await db.hour_entries.find(
        {"employee_id": employee["id"]},
        {"_id": 0, "work_date": 1, "hours_worked": 1, "site_id": 1, "is_absent": 1}
    ).sort("work_date", 1).to_list(5000)
    
    site_ids = list(set(e["site_id"] for e in entries))
    sites = await db.construction_sites.find(
        {"id": {"$in": site_ids}},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    site_names = {s["id"]: s["name"] for s in sites}
    
    for entry in entries:
        entry["site_name"] = site_names.get(entry["site_id"], "?")
    
    assignments = await db.assignments.find(
        {"employee_id": employee["id"]},
        {"_id": 0, "site_id": 1, "assigned_dates": 1, "month": 1, "year": 1}
    ).to_list(1000)
    
    return {
        "employee_name": employee["full_name"],
        "entries": entries,
        "assignments": assignments,
        "site_names": site_names
    }


@router.get("/public/advances/{token}")
async def get_public_advances(token: str, month: Optional[int] = None, year: Optional[int] = None):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Nieprawidlowy link")
    
    now = datetime.now()
    q_month = month or now.month
    q_year = year or now.year
    
    advances = await db.advances.find(
        {"employee_id": employee["id"], "month": q_month, "year": q_year},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    total = sum(a["amount"] for a in advances)
    return {"advances": advances, "total": total, "month": q_month, "year": q_year}


@router.get("/public/penalties/{token}")
async def get_public_penalties(token: str, month: Optional[int] = None, year: Optional[int] = None):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Nieprawidlowy link")
    
    now = datetime.now()
    q_month = month or now.month
    q_year = year or now.year
    
    penalties = await db.penalties.find(
        {"employee_id": employee["id"], "month": q_month, "year": q_year},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    total = sum(p["amount"] for p in penalties)
    return {"penalties": penalties, "total": total, "month": q_month, "year": q_year}


@router.get("/holidays")
async def get_polish_holidays(year: int = 2026):
    from datetime import date, timedelta
    holidays = [
        f"{year}-01-01", f"{year}-01-06", f"{year}-05-01", f"{year}-05-03",
        f"{year}-08-15", f"{year}-11-01", f"{year}-11-11",
        f"{year}-12-25", f"{year}-12-26",
    ]
    
    # Easter calculation
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    
    easter = date(year, month, day)
    easter_monday = easter + timedelta(days=1)
    corpus_christi = easter + timedelta(days=60)
    pentecost = easter + timedelta(days=49)
    
    holidays.append(easter_monday.strftime("%Y-%m-%d"))
    holidays.append(corpus_christi.strftime("%Y-%m-%d"))
    holidays.append(pentecost.strftime("%Y-%m-%d"))
    
    return {"year": year, "holidays": sorted(holidays)}



# ============== iter95u: Public schedule for workers ==============

@router.get("/public/schedule/{token}")
async def get_public_schedule(token: str, days_ahead: int = 14):
    """Harmonogram dla pracownika (PIN-link).

    Zwraca zadania budget_tasks z budow do ktorych pracownik jest przypisany
    (employees.assigned_sites), ALE wylacznie z tych budow, na ktorych co
    najmniej jeden brygadzista ma schedule_visible=True. Okno: [-1d, +days_ahead].
    """
    from datetime import timedelta
    days_ahead = max(1, min(int(days_ahead or 14), 60))

    employee = await db.employees.find_one({"public_token": token}, {"_id": 0, "id": 1, "assigned_sites": 1})
    if not employee:
        raise HTTPException(status_code=404, detail="Nieprawidlowy link")

    emp_sites = employee.get("assigned_sites") or []
    if not emp_sites:
        return {"rows": [], "visible_sites": []}

    # Znajdz brygadzistow ktorzy maja te budowy i schedule_visible=True
    # (lub brak pola = default True dla legacy)
    foremen_cursor = db.users.find(
        {
            "role": "foreman",
            "assigned_sites": {"$in": emp_sites},
            "$or": [
                {"schedule_visible": {"$ne": False}},
                {"schedule_visible": {"$exists": False}},
            ],
        },
        {"_id": 0, "assigned_sites": 1},
    )
    visible_sites: set = set()
    async for f in foremen_cursor:
        for s in (f.get("assigned_sites") or []):
            if s in emp_sites:
                visible_sites.add(s)

    if not visible_sites:
        return {"rows": [], "visible_sites": []}

    today = datetime.now().date()
    range_start = (today - timedelta(days=1)).isoformat()
    range_end = (today + timedelta(days=days_ahead)).isoformat()
    today_str = today.isoformat()

    rows = await db.budget_tasks.find(
        {
            "budowa_id": {"$in": list(visible_sites)},
            "$and": [
                {"$or": [
                    {"actual_end_date": None},
                    {"actual_end_date": {"$exists": False}},
                ]},
                {"$or": [
                    {"start_date": {"$gte": range_start, "$lte": range_end}},
                    {"end_date": {"$gte": range_start, "$lte": range_end}},
                    {"$and": [
                        {"start_date": {"$lte": today_str}},
                        {"end_date": {"$gte": today_str}},
                    ]},
                ]},
            ],
        },
        {"_id": 0, "id": 1, "budowa_id": 1, "name": 1, "start_date": 1, "end_date": 1, "progress_pct": 1, "actual_end_date": 1},
    ).sort([("start_date", 1), ("order", 1)]).to_list(length=500)

    # Dolacz nazwy budow
    bid_set = list({r.get("budowa_id") for r in rows if r.get("budowa_id")})
    site_names: dict = {}
    if bid_set:
        async for s in db.construction_sites.find({"id": {"$in": bid_set}}, {"_id": 0, "id": 1, "name": 1}):
            site_names[s["id"]] = s.get("name")
        missing = [b for b in bid_set if b not in site_names]
        if missing:
            async for s in db.finance_budowy.find({"id": {"$in": missing}}, {"_id": 0, "id": 1, "name": 1}):
                site_names[s["id"]] = s.get("name")
    for r in rows:
        r["budowa_name"] = site_names.get(r.get("budowa_id"))

    return {"rows": rows, "visible_sites": sorted(list(visible_sites))}
