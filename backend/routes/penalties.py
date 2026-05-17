from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime
import uuid

from database import db
from models import PenaltyCreate
from auth import get_current_admin

router = APIRouter()


@router.get("/penalties")
async def get_penalties(
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
    penalties = await db.penalties.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return penalties


@router.get("/penalties/summary")
async def get_penalties_summary(
    month: int,
    year: int,
    current_user: dict = Depends(get_current_admin)
):
    penalties = await db.penalties.find(
        {"month": month, "year": year}, {"_id": 0}
    ).to_list(5000)
    summary = {}
    for p in penalties:
        emp_id = p["employee_id"]
        summary[emp_id] = summary.get(emp_id, 0) + p["amount"]
    return summary


@router.post("/penalties")
async def create_penalty(
    penalty: PenaltyCreate,
    current_user: dict = Depends(get_current_admin)
):
    pen_id = str(uuid.uuid4())
    pen_doc = {
        "id": pen_id,
        "employee_id": penalty.employee_id,
        "amount": penalty.amount,
        "month": penalty.month,
        "year": penalty.year,
        "description": penalty.description,
        "image_data": penalty.image_data,
        "created_at": datetime.now().isoformat()
    }
    await db.penalties.insert_one(pen_doc)
    del pen_doc["_id"]
    # Auto-resync finance
    try:
        from routes.finance import _do_sync_month
        await _do_sync_month(penalty.year, penalty.month, current_user["sub"])
    except Exception:
        import logging
        logging.getLogger(__name__).exception("[create_penalty] auto-resync failed")
    return pen_doc


@router.delete("/penalties/{penalty_id}")
async def delete_penalty(
    penalty_id: str,
    current_user: dict = Depends(get_current_admin)
):
    pen = await db.penalties.find_one({"id": penalty_id}, {"_id": 0, "year": 1, "month": 1})
    result = await db.penalties.delete_one({"id": penalty_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kara nie znaleziona")
    if pen:
        try:
            from routes.finance import _do_sync_month
            await _do_sync_month(pen["year"], pen["month"], current_user["sub"])
        except Exception:
            import logging
            logging.getLogger(__name__).exception("[delete_penalty] auto-resync failed")
    return {"message": "Kara usunieta"}
