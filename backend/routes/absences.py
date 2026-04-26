from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timedelta, date
import uuid
import os
import logging

from database import db
from models import AbsenceCreate, Absence, RequestReview
from auth import get_current_user, get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/public/absences/{token}")
async def create_absence(token: str, absence: AbsenceCreate):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Invalid link")

    today = date.today()
    tomorrow = today + timedelta(days=1)
    for d in absence.dates:
        try:
            parsed = datetime.strptime(d, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Nieprawidlowy format daty: {d}")
        if parsed < tomorrow:
            raise HTTPException(status_code=400, detail=f"Mozna zglosic nieobecnosc najwczesniej od jutra ({tomorrow.isoformat()})")

    absence_id = str(uuid.uuid4())
    absence_doc = {
        "id": absence_id,
        "employee_id": employee["id"],
        "employee_name": employee["full_name"],
        "dates": absence.dates,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "reviewed_at": None,
        "reviewed_by": None
    }
    await db.absences.insert_one(absence_doc)
    absence_doc.pop("_id", None)

    # Create Outlook calendar event
    try:
        from onedrive import get_graph_token
        token_ms = get_graph_token()
        import requests as req
        sorted_dates = sorted(absence.dates)
        start_date = sorted_dates[0]
        end_date_parsed = datetime.strptime(sorted_dates[-1], "%Y-%m-%d").date() + timedelta(days=1)
        event = {
            "subject": f"Nieobecnosc: {employee['full_name']}",
            "body": {
                "contentType": "Text",
                "content": f"Pracownik {employee['full_name']} zglosil nieobecnosc na dni: {', '.join(sorted_dates)}"
            },
            "start": {"dateTime": f"{start_date}T00:00:00", "timeZone": "Europe/Warsaw"},
            "end": {"dateTime": f"{end_date_parsed.isoformat()}T00:00:00", "timeZone": "Europe/Warsaw"},
            "isAllDay": True,
            "showAs": "free",
            "isReminderOn": True,
            "reminderMinutesBeforeStart": 1440
        }
        calendar_email = os.environ.get("OUTLOOK_CALENDAR_EMAIL", "biuro@fegrro.pl")
        resp = req.post(
            f"https://graph.microsoft.com/v1.0/users/{calendar_email}/events",
            headers={"Authorization": f"Bearer {token_ms}", "Content-Type": "application/json"},
            json=event
        )
        if resp.status_code in (200, 201):
            logger.info(f"Outlook event created for absence {absence_id}")
        else:
            logger.warning(f"Outlook calendar event failed: {resp.status_code} {resp.text}")
    except Exception as e:
        logger.warning(f"Outlook calendar integration error: {e}")

    return Absence(**absence_doc)


@router.get("/public/absences/{token}")
async def get_absences_by_token(token: str):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Invalid link")

    absences = await db.absences.find(
        {"employee_id": employee["id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return absences


@router.delete("/public/absences/{token}/{absence_id}")
async def cancel_absence(token: str, absence_id: str):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Invalid link")

    result = await db.absences.delete_one({"id": absence_id, "employee_id": employee["id"], "status": "pending"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nie znaleziono nieobecnosci lub juz zatwierdzona")
    return {"message": "Nieobecnosc anulowana"}


@router.get("/absences")
async def get_all_absences(
    status: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    absences = await db.absences.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    if month and year:
        prefix = f"{year}-{month:02d}"
        absences = [a for a in absences if any(d.startswith(prefix) for d in a.get("dates", []))]

    return absences


@router.put("/absences/{absence_id}/review")
async def review_absence(
    absence_id: str,
    review: RequestReview,
    current_user: dict = Depends(get_current_admin)
):
    result = await db.absences.update_one(
        {"id": absence_id},
        {"$set": {
            "status": review.status,
            "reviewed_at": datetime.now().isoformat(),
            "reviewed_by": current_user["sub"]
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Absence not found")
    return {"message": "Nieobecnosc rozpatrzona"}
