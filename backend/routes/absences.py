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


def _outlook_calendar_email() -> str:
    return os.environ.get("OUTLOOK_CALENDAR_EMAIL", "biuro@fegrro.pl")


def _create_outlook_event(employee_name: str, dates: list[str]) -> Optional[str]:
    """Create Outlook all-day event for absence. Returns the event id, or None on failure."""
    try:
        from onedrive import get_graph_token
        import requests as req
        token_ms = get_graph_token()
        sorted_dates = sorted(dates)
        start_date = sorted_dates[0]
        end_date_parsed = datetime.strptime(sorted_dates[-1], "%Y-%m-%d").date() + timedelta(days=1)
        event = {
            "subject": f"Nieobecnosc: {employee_name}",
            "body": {
                "contentType": "Text",
                "content": f"Pracownik {employee_name} zglosil nieobecnosc na dni: {', '.join(sorted_dates)}"
            },
            "start": {"dateTime": f"{start_date}T00:00:00", "timeZone": "Europe/Warsaw"},
            "end": {"dateTime": f"{end_date_parsed.isoformat()}T00:00:00", "timeZone": "Europe/Warsaw"},
            "isAllDay": True,
            "showAs": "free",
            "isReminderOn": True,
            "reminderMinutesBeforeStart": 1440
        }
        resp = req.post(
            f"https://graph.microsoft.com/v1.0/users/{_outlook_calendar_email()}/events",
            headers={"Authorization": f"Bearer {token_ms}", "Content-Type": "application/json"},
            json=event,
            timeout=15
        )
        if resp.status_code in (200, 201):
            event_id = resp.json().get("id")
            logger.info(f"Outlook event created (id={event_id}) for {employee_name}")
            return event_id
        logger.warning(f"Outlook calendar event failed: {resp.status_code} {resp.text}")
    except Exception as e:
        logger.warning(f"Outlook calendar create error: {e}")
    return None


def _delete_outlook_event(event_id: str) -> bool:
    """Delete an Outlook event by id. Returns True on success."""
    if not event_id:
        return False
    try:
        from onedrive import get_graph_token
        import requests as req
        token_ms = get_graph_token()
        resp = req.delete(
            f"https://graph.microsoft.com/v1.0/users/{_outlook_calendar_email()}/events/{event_id}",
            headers={"Authorization": f"Bearer {token_ms}"},
            timeout=15
        )
        if resp.status_code in (200, 204, 404):
            logger.info(f"Outlook event deleted (id={event_id}, status={resp.status_code})")
            return True
        logger.warning(f"Outlook calendar event delete failed: {resp.status_code} {resp.text}")
    except Exception as e:
        logger.warning(f"Outlook calendar delete error: {e}")
    return False


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

    # Create Outlook calendar event first so we can persist its id with the absence
    outlook_event_id = _create_outlook_event(employee["full_name"], absence.dates)

    absence_doc = {
        "id": absence_id,
        "employee_id": employee["id"],
        "employee_name": employee["full_name"],
        "dates": absence.dates,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "reviewed_at": None,
        "reviewed_by": None,
        "outlook_event_id": outlook_event_id,
    }
    await db.absences.insert_one(absence_doc)
    absence_doc.pop("_id", None)

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

    # Fetch first so we can clean up the Outlook event before deleting the DB row
    absence = await db.absences.find_one(
        {"id": absence_id, "employee_id": employee["id"], "status": "pending"},
        {"_id": 0}
    )
    if not absence:
        raise HTTPException(status_code=404, detail="Nie znaleziono nieobecnosci lub juz zatwierdzona")

    event_id = absence.get("outlook_event_id")
    if event_id:
        _delete_outlook_event(event_id)

    await db.absences.delete_one({"id": absence_id})
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
    # If admin rejects the absence, also remove the Outlook calendar event
    if review.status == "rejected":
        absence = await db.absences.find_one({"id": absence_id}, {"_id": 0})
        if absence and absence.get("outlook_event_id"):
            _delete_outlook_event(absence["outlook_event_id"])

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


@router.delete("/absences/{absence_id}")
async def delete_absence_admin(
    absence_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Admin hard-delete: removes the absence and its Outlook event."""
    absence = await db.absences.find_one({"id": absence_id}, {"_id": 0})
    if not absence:
        raise HTTPException(status_code=404, detail="Absence not found")

    event_id = absence.get("outlook_event_id")
    if event_id:
        _delete_outlook_event(event_id)

    await db.absences.delete_one({"id": absence_id})
    return {"message": "Nieobecnosc usunieta"}
