from fastapi import APIRouter, Depends
from typing import Optional
from datetime import datetime
import uuid
import calendar
import logging

from database import db
from models import EmployeeAssignment, AssignmentCreate
from auth import get_current_user, get_current_admin
from utils import POLISH_MONTHS_UPPER, MONTH_VARIANTS

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/assignments", response_model=EmployeeAssignment)
async def create_assignment(
    assignment: AssignmentCreate,
    current_user: dict = Depends(get_current_admin)
):
    assignment_id = str(uuid.uuid4())
    
    assigned_dates = assignment.dates or []
    if assignment.assign_full_month:
        month_num = POLISH_MONTHS_UPPER.get(assignment.month.upper(), 1)
        num_days = calendar.monthrange(assignment.year, month_num)[1]
        assigned_dates = [f"{assignment.year}-{month_num:02d}-{day:02d}" for day in range(1, num_days + 1)]
    
    # Remove these dates from any OTHER assignments for the same employee in the same month
    if assigned_dates:
        existing_assignments = await db.assignments.find({
            "employee_id": assignment.employee_id,
            "month": assignment.month,
            "year": assignment.year
        }).to_list(1000)
        
        for existing in existing_assignments:
            remaining_dates = [d for d in existing.get("assigned_dates", []) if d not in assigned_dates]
            if not remaining_dates:
                await db.assignments.delete_one({"id": existing["id"]})
            elif len(remaining_dates) < len(existing.get("assigned_dates", [])):
                await db.assignments.update_one(
                    {"id": existing["id"]},
                    {"$set": {"assigned_dates": remaining_dates}}
                )
    
    assignment_doc = {
        "id": assignment_id,
        "employee_id": assignment.employee_id,
        "site_id": assignment.site_id,
        "month": assignment.month,
        "year": assignment.year,
        "assigned_dates": assigned_dates,
        "created_at": datetime.now().isoformat(),
        "created_by": current_user["sub"]
    }
    
    await db.assignments.insert_one(assignment_doc)
    
    # AUTO-TRANSFER: Move existing hours from old site to new site for reassigned dates
    if assigned_dates and current_user.get("role") == "admin":
        existing_hours = await db.hour_entries.find({
            "employee_id": assignment.employee_id,
            "work_date": {"$in": assigned_dates},
            "site_id": {"$ne": assignment.site_id}
        }).to_list(1000)
        
        transferred = 0
        for entry in existing_hours:
            await db.hour_entries.update_one(
                {"id": entry["id"]},
                {"$set": {"site_id": assignment.site_id}}
            )
            transferred += 1
        
        if transferred > 0:
            logger.info(f"Auto-transferred {transferred} hour entries to site {assignment.site_id} for employee {assignment.employee_id}")

    # Update employee's assigned sites
    await db.employees.update_one(
        {"id": assignment.employee_id},
        {"$addToSet": {"assigned_sites": assignment.site_id}}
    )
    
    assignment_doc.pop("_id", None)
    return EmployeeAssignment(**assignment_doc)


@router.get("/assignments")
async def get_assignments(
    employee_id: Optional[str] = None,
    month: Optional[str] = None,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if employee_id:
        query["employee_id"] = employee_id
    if month:
        variants = MONTH_VARIANTS.get(month.upper(), [month.upper()])
        query["month"] = {"$in": variants}
    if year:
        query["year"] = year
    
    assignments = await db.assignments.find(
        query,
        {
            "_id": 0,
            "id": 1, "employee_id": 1, "site_id": 1,
            "month": 1, "year": 1, "assigned_dates": 1,
            "created_at": 1, "created_by": 1
        }
    ).to_list(1000)
    return assignments



@router.delete("/assignments/unassign")
async def unassign_employee(
    employee_id: str,
    month: str,
    year: int,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_admin)
):
    variants = MONTH_VARIANTS.get(month.upper(), [month.upper()])
    query = {
        "employee_id": employee_id,
        "month": {"$in": variants},
        "year": year
    }
    
    if date:
        # Remove single date from assignments
        assignments = await db.assignments.find(query).to_list(1000)
        removed = 0
        for a in assignments:
            dates = a.get("assigned_dates", [])
            if date in dates:
                new_dates = [d for d in dates if d != date]
                if not new_dates:
                    await db.assignments.delete_one({"id": a["id"]})
                else:
                    await db.assignments.update_one({"id": a["id"]}, {"$set": {"assigned_dates": new_dates}})
                removed += 1
        return {"deleted": removed, "employee_id": employee_id, "date": date}
    else:
        # Remove all assignments for the month
        result = await db.assignments.delete_many(query)
        return {"deleted": result.deleted_count, "employee_id": employee_id}
