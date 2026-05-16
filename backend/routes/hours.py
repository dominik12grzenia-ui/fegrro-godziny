from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Optional
from datetime import datetime, timedelta, date
import uuid

from database import db
from models import HourEntry, HourEntryCreate
from auth import get_current_user

router = APIRouter()


@router.get("/hours/check-existing")
async def check_existing_hours(
    employee_id: str,
    work_date: str,
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    existing = await db.hour_entries.find_one({
        "employee_id": employee_id,
        "work_date": work_date,
        "site_id": {"$ne": site_id}
    }, {"_id": 0})
    if existing:
        site = await db.sites.find_one({"id": existing["site_id"]}, {"_id": 0, "name": 1})
        return {
            "has_hours": True,
            "hours": existing.get("hours_worked", 0),
            "site_name": site.get("name", "Inna budowa") if site else "Inna budowa"
        }
    return {"has_hours": False}


@router.post("/hours", response_model=HourEntry)
async def create_hour_entry(
    entry: HourEntryCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    entry_date = datetime.strptime(entry.work_date, "%Y-%m-%d").date()
    user_role = current_user.get("role", "foreman")
    
    if user_role == "foreman":
        today = date.today()
        yesterday = today - timedelta(days=1)
        if entry_date not in [today, yesterday]:
            raise HTTPException(
                status_code=400,
                detail="Mozesz edytowac tylko dzisiejsze i wczorajsze godziny. Wyslij prosbe do administratora."
            )
        foreman = await db.users.find_one({"id": current_user["sub"]})
        if foreman and entry.site_id not in foreman.get("assigned_sites", []):
            raise HTTPException(status_code=403, detail="Nie masz dostepu do tej budowy")
    elif user_role != "admin":
        today = date.today()
        yesterday = today - timedelta(days=1)
        if entry_date not in [today, yesterday]:
            raise HTTPException(
                status_code=400,
                detail="Can only enter hours for today or yesterday. Please submit a request for other dates."
            )
    
    if not entry.is_absent and entry.hours_worked != 0 and (entry.hours_worked < 1 or entry.hours_worked > 14):
        raise HTTPException(status_code=400, detail="Hours must be between 1 and 14")
    
    # Delete ALL existing entries for this employee+date (prevents duplicates)
    existing_entries = await db.hour_entries.find({
        "employee_id": entry.employee_id,
        "work_date": entry.work_date
    }).to_list(100)
    
    if existing_entries:
        await db.hour_entries.delete_many({
            "employee_id": entry.employee_id,
            "work_date": entry.work_date
        })
    
    # If hours is 0 and not absent, treat as deletion — don't create new entry
    if entry.hours_worked == 0 and not entry.is_absent:
        return HourEntry(
            id=existing_entries[0]["id"] if existing_entries else str(uuid.uuid4()),
            employee_id=entry.employee_id,
            site_id=entry.site_id,
            work_date=entry.work_date,
            hours_worked=0,
            is_absent=False,
            notes=entry.notes,
            created_at=datetime.now().isoformat(),
            created_by=current_user["sub"]
        )
    
    # Create fresh entry
    user_doc = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "full_name": 1})
    creator_name = user_doc.get("full_name", "Admin") if user_doc else "Admin"
    entry_id = str(uuid.uuid4())
    entry_doc = {
        "id": entry_id,
        "employee_id": entry.employee_id,
        "site_id": entry.site_id,
        "work_date": entry.work_date,
        "hours_worked": entry.hours_worked if not entry.is_absent else 0,
        "is_absent": entry.is_absent,
        "notes": entry.notes,
        "created_at": datetime.now().isoformat(),
        "created_by": current_user["sub"],
        "created_by_name": creator_name,
        "updated_by": current_user["sub"],
        "updated_by_name": creator_name,
        "updated_at": datetime.now().isoformat()
    }
    await db.hour_entries.insert_one(entry_doc)
    
    # Create notification if hours > 10
    if entry.hours_worked > 10 and not entry.is_absent:
        employee = await db.employees.find_one({"id": entry.employee_id}, {"_id": 0, "full_name": 1})
        user_doc = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "full_name": 1})
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "type": "high_hours",
            "employee_id": entry.employee_id,
            "employee_name": employee.get("full_name", "?") if employee else "?",
            "hours_worked": entry.hours_worked,
            "work_date": entry.work_date,
            "site_id": entry.site_id,
            "created_by": current_user["sub"],
            "created_by_name": user_doc.get("full_name", "?") if user_doc else "?",
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "reviewed_by": None,
            "reviewed_at": None
        })
    
    entry_result = await db.hour_entries.find_one({"id": entry_id}, {"_id": 0})
    return HourEntry(**entry_result)


@router.get("/hours")
async def get_hour_entries(
    employee_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if employee_id:
        query["employee_id"] = employee_id
    if start_date and end_date:
        query["work_date"] = {"$gte": start_date, "$lte": end_date}
    
    # NO HARD LIMIT: 50 emp x 31 days = 1550 entries/month easily exceeds 1000.
    # Silent truncation was the root cause of discrepancies between HoursTable
    # and Payroll (backend aggregation has no limit). Use length=None.
    entries = await db.hour_entries.find(
        query,
        {
            "_id": 0,
            "id": 1, "employee_id": 1, "site_id": 1, "work_date": 1,
            "hours_worked": 1, "is_absent": 1, "notes": 1,
            "created_at": 1, "created_by": 1, "created_by_name": 1,
            "updated_by_name": 1, "updated_at": 1
        }
    ).to_list(length=None)
    return entries


@router.post("/hours/cleanup-duplicates")
async def cleanup_duplicate_hours(
    current_user: dict = Depends(get_current_user)
):
    """One-time cleanup: remove duplicate hour entries keeping only the latest one per employee+date"""
    from auth import get_current_admin
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admin can cleanup")
    
    all_entries = await db.hour_entries.find({}, {"_id": 0}).sort("updated_at", -1).to_list(50000)
    
    seen = {}
    to_delete = []
    for entry in all_entries:
        key = (entry["employee_id"], entry["work_date"])
        if key in seen:
            to_delete.append(entry["id"])
        else:
            seen[key] = entry["id"]
    
    deleted = 0
    for entry_id in to_delete:
        result = await db.hour_entries.delete_one({"id": entry_id})
        deleted += result.deleted_count
    
    return {"message": f"Usunieto {deleted} duplikatow", "deleted": deleted, "total_checked": len(all_entries)}
