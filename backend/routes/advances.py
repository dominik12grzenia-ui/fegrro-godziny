from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Optional
from datetime import datetime
import uuid

from database import db
from models import AdvanceCreate, AdvanceCarryForward
from auth import get_current_admin

router = APIRouter()


@router.get("/advances")
async def get_advances(
    employee_id: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_admin)
):
    query = {}
    if employee_id:
        query["employee_id"] = employee_id
    if month is not None:
        query["month"] = month
    if year is not None:
        query["year"] = year
    advances = await db.advances.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return advances


@router.get("/advances/summary")
async def get_advances_summary(
    month: int,
    year: int,
    current_user: dict = Depends(get_current_admin)
):
    advances = await db.advances.find(
        {"month": month, "year": year}, {"_id": 0}
    ).to_list(5000)
    
    summary = {}
    for adv in advances:
        emp_id = adv["employee_id"]
        summary[emp_id] = summary.get(emp_id, 0) + adv["amount"]
    return summary


@router.post("/advances")
async def create_advance(
    advance: AdvanceCreate,
    current_user: dict = Depends(get_current_admin)
):
    adv_id = str(uuid.uuid4())
    adv_doc = {
        "id": adv_id,
        "employee_id": advance.employee_id,
        "amount": advance.amount,
        "month": advance.month,
        "year": advance.year,
        "note": advance.note,
        "carried_from_month": None,
        "carried_from_year": None,
        "created_at": datetime.now().isoformat()
    }
    await db.advances.insert_one(adv_doc)
    del adv_doc["_id"]
    return adv_doc


@router.delete("/advances/{advance_id}")
async def delete_advance(
    advance_id: str,
    current_user: dict = Depends(get_current_admin)
):
    result = await db.advances.delete_one({"id": advance_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zaliczka nie znaleziona")
    return {"message": "Zaliczka usunieta"}


@router.post("/advances/{advance_id}/carry-forward")
async def carry_forward_advance(
    advance_id: str,
    data: AdvanceCarryForward,
    current_user: dict = Depends(get_current_admin)
):
    advance = await db.advances.find_one({"id": advance_id}, {"_id": 0})
    if not advance:
        raise HTTPException(status_code=404, detail="Zaliczka nie znaleziona")
    
    if data.amount > advance["amount"]:
        raise HTTPException(status_code=400, detail="Kwota przeniesienia wieksza niz zaliczka")
    
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Kwota musi byc wieksza niz 0")
    
    remaining = advance["amount"] - data.amount
    if remaining <= 0:
        await db.advances.delete_one({"id": advance_id})
    else:
        await db.advances.update_one(
            {"id": advance_id},
            {"$set": {"amount": remaining}}
        )
    
    new_id = str(uuid.uuid4())
    new_doc = {
        "id": new_id,
        "employee_id": advance["employee_id"],
        "amount": data.amount,
        "month": data.target_month,
        "year": data.target_year,
        "note": f"Przeniesione z {advance['month']}/{advance['year']}",
        "carried_from_month": advance["month"],
        "carried_from_year": advance["year"],
        "created_at": datetime.now().isoformat()
    }
    await db.advances.insert_one(new_doc)
    del new_doc["_id"]
    
    return {"message": "Zaliczka przeniesiona", "new_advance": new_doc, "remaining": remaining}
