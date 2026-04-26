from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime
import uuid

from database import db
from models import HourRequest, HourRequestCreate, RequestReview, RequestStatus
from auth import get_current_user, get_current_admin

router = APIRouter()


@router.post("/requests", response_model=HourRequest)
async def create_hour_request(
    request: HourRequestCreate,
    current_user: dict = Depends(get_current_user)
):
    request_id = str(uuid.uuid4())
    request_doc = {
        "id": request_id,
        "employee_id": request.employee_id,
        "site_id": request.site_id,
        "work_date": request.work_date,
        "hours_worked": request.hours_worked,
        "reason": request.reason,
        "requested_by": current_user["sub"],
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "reviewed_at": None,
        "reviewed_by": None
    }
    
    await db.hour_requests.insert_one(request_doc)
    request_doc.pop("_id", None)
    return HourRequest(**request_doc)


@router.get("/requests")
async def get_hour_requests(
    status: Optional[RequestStatus] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user.get("role") == "worker":
        query["employee_id"] = current_user["sub"]
    if status:
        query["status"] = status
    
    requests = await db.hour_requests.find(
        query,
        {
            "_id": 0,
            "id": 1, "employee_id": 1, "site_id": 1, "work_date": 1,
            "hours_worked": 1, "reason": 1, "status": 1,
            "created_at": 1, "reviewed_at": 1, "reviewed_by": 1
        }
    ).to_list(1000)
    return requests


@router.put("/requests/{request_id}/review")
async def review_request(
    request_id: str,
    review: RequestReview,
    current_user: dict = Depends(get_current_admin)
):
    result = await db.hour_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": review.status,
            "reviewed_at": datetime.now().isoformat(),
            "reviewed_by": current_user["sub"]
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if review.status == RequestStatus.APPROVED:
        request_data = await db.hour_requests.find_one({"id": request_id})
        if request_data:
            entry_id = str(uuid.uuid4())
            entry_doc = {
                "id": entry_id,
                "employee_id": request_data["employee_id"],
                "site_id": request_data["site_id"],
                "work_date": request_data["work_date"],
                "hours_worked": request_data["hours_worked"],
                "is_absent": False,
                "notes": f"Approved by admin: {request_data.get('reason', '')}",
                "created_at": datetime.now().isoformat(),
                "created_by": current_user["sub"]
            }
            await db.hour_entries.insert_one(entry_doc)
    
    return {"message": "Request reviewed successfully"}


# ============= NOTIFICATIONS (>10h) =============

@router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role", "foreman")
    if role == "admin":
        notifications = await db.notifications.find(
            {"status": "pending"}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)
    else:
        notifications = await db.notifications.find(
            {"created_by": current_user["sub"], "status": "pending"}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)
    return notifications


@router.post("/notifications/{notification_id}/approve")
async def approve_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_admin)
):
    result = await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {
            "status": "approved",
            "reviewed_by": current_user["sub"],
            "reviewed_at": datetime.now().isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Zatwierdzono"}


@router.post("/notifications/{notification_id}/reject")
async def reject_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_admin)
):
    result = await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {
            "status": "rejected",
            "reviewed_by": current_user["sub"],
            "reviewed_at": datetime.now().isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Odrzucono"}
