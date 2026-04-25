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
