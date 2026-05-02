from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime
import uuid
import secrets

from database import db
from models import Employee, EmployeeCreate
from auth import get_current_user, get_current_admin

router = APIRouter()


@router.get("/employees")
async def get_employees(
    active_only: bool = True,
    month: int = None,
    year: int = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if month and year:
        month_key = f"{year}-{month:02d}"
        # Find employees active in this specific month OR old employees without active_months field
        query["$or"] = [
            {"active_months": month_key},
            {"currently_active": True, "active_months": {"$exists": False}}
        ]
    elif active_only:
        query["currently_active"] = True
    
    employees = await db.employees.find(
        query,
        {
            "_id": 0,
            "id": 1, "full_name": 1, "phone_number": 1,
            "user_id": 1, "currently_active": 1, "assigned_sites": 1,
            "active_months": 1, "created_at": 1, "updated_at": 1, "sync_source": 1
        }
    ).sort("full_name", 1).to_list(1000)
    return employees


@router.post("/employees", response_model=Employee)
async def create_employee(
    employee: EmployeeCreate,
    current_user: dict = Depends(get_current_admin)
):
    employee_id = str(uuid.uuid4())
    employee_doc = {
        "id": employee_id,
        "full_name": employee.full_name,
        "phone_number": employee.phone_number,
        "user_id": None,
        "currently_active": True,
        "assigned_sites": [],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "sync_source": "manual"
    }
    
    await db.employees.insert_one(employee_doc)
    employee_doc.pop("_id", None)
    return Employee(**employee_doc)


@router.get("/employees/public-links")
async def get_public_links(
    current_user: dict = Depends(get_current_admin)
):
    now = datetime.now()
    month_key = f"{now.year}-{now.month:02d}"
    query = {"$or": [
        {"active_months": month_key},
        {"currently_active": True, "active_months": {"$exists": False}}
    ], "public_token": {"$exists": True, "$ne": ""}}
    employees = await db.employees.find(
        query,
        {"_id": 0, "id": 1, "full_name": 1, "phone_number": 1, "public_token": 1}
    ).sort("full_name", 1).to_list(1000)
    return [
        {"employee_id": e["id"], "full_name": e["full_name"], "phone_number": e.get("phone_number"), "token": e["public_token"]}
        for e in employees
    ]


@router.get("/employees/{employee_id}", response_model=Employee)
async def get_employee(
    employee_id: str,
    current_user: dict = Depends(get_current_user)
):
    employee = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return Employee(**employee)


@router.post("/employees/{employee_id}/generate-link")
async def generate_employee_link(
    employee_id: str,
    current_user: dict = Depends(get_current_admin)
):
    employee = await db.employees.find_one({"id": employee_id})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    existing_token = employee.get("public_token")
    if existing_token:
        return {"token": existing_token, "employee_id": employee_id}
    
    token = secrets.token_urlsafe(16)
    await db.employees.update_one(
        {"id": employee_id},
        {"$set": {"public_token": token}}
    )
    return {"token": token, "employee_id": employee_id}


@router.post("/employees/generate-all-links")
async def generate_all_links(
    current_user: dict = Depends(get_current_admin)
):
    now = datetime.now()
    month_key = f"{now.year}-{now.month:02d}"
    # Only get employees active in current month, sorted alphabetically
    query = {"$or": [
        {"active_months": month_key},
        {"currently_active": True, "active_months": {"$exists": False}}
    ]}
    employees = await db.employees.find(
        query,
        {"_id": 0, "id": 1, "full_name": 1, "phone_number": 1, "public_token": 1}
    ).sort("full_name", 1).to_list(1000)
    
    results = []
    for emp in employees:
        # Keep existing token, only generate if missing
        token = emp.get("public_token")
        if not token:
            token = secrets.token_urlsafe(16)
            await db.employees.update_one({"id": emp["id"]}, {"$set": {"public_token": token}})
        results.append({
            "employee_id": emp["id"],
            "full_name": emp["full_name"],
            "phone_number": emp.get("phone_number"),
            "token": token
        })
    return results


@router.post("/employees/rotate-tokens")
async def rotate_all_public_tokens(
    current_user: dict = Depends(get_current_admin)
):
    """Regenerate public_token for ALL employees - invalidates every existing link."""
    employees = await db.employees.find({}, {"_id": 0, "id": 1, "full_name": 1}).to_list(5000)
    updated = 0
    for emp in employees:
        new_token = secrets.token_urlsafe(16)
        await db.employees.update_one(
            {"id": emp["id"]},
            {"$set": {"public_token": new_token}}
        )
        updated += 1
    return {"rotated": updated, "message": f"Zrotowano {updated} tokenow - stare linki pracownikow sa juz nieaktywne"}


@router.post("/employees/cleanup-duplicates")
async def cleanup_duplicate_employees(
    current_user: dict = Depends(get_current_admin)
):
    """Remove duplicate employees (case-insensitive) keeping the one with most hour entries"""
    all_emps = await db.employees.find({"currently_active": True}, {"_id": 0}).to_list(5000)
    
    from collections import defaultdict
    by_name = defaultdict(list)
    for emp in all_emps:
        by_name[emp["full_name"].upper().strip()].append(emp)
    
    deleted = 0
    merged = []
    for name_upper, emps in by_name.items():
        if len(emps) <= 1:
            continue
        
        # Find which one has the most hours
        best = None
        best_count = -1
        for emp in emps:
            count = await db.hour_entries.count_documents({"employee_id": emp["id"]})
            if count > best_count:
                best_count = count
                best = emp
        
        # Delete duplicates, reassign their data to the best one
        for emp in emps:
            if emp["id"] == best["id"]:
                continue
            
            await db.hour_entries.update_many(
                {"employee_id": emp["id"]},
                {"$set": {"employee_id": best["id"]}}
            )
            await db.advances.update_many(
                {"employee_id": emp["id"]},
                {"$set": {"employee_id": best["id"]}}
            )
            await db.penalties.update_many(
                {"employee_id": emp["id"]},
                {"$set": {"employee_id": best["id"]}}
            )
            await db.assignments.update_many(
                {"employee_id": emp["id"]},
                {"$set": {"employee_id": best["id"]}}
            )
            await db.absences.update_many(
                {"employee_id": emp["id"]},
                {"$set": {"employee_id": best["id"]}}
            )
            
            await db.employees.delete_one({"id": emp["id"]})
            deleted += 1
        
        merged.append({"name": best["full_name"], "kept_id": best["id"][:12], "duplicates_removed": len(emps) - 1})
    
    return {"message": f"Usunieto {deleted} duplikatow", "deleted": deleted, "merged": merged}
