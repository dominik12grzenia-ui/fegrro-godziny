"""Clothing (ubrania robocze) routes.

Workflow:
- Admin defines clothing types with yearly limit, order window (months), and usage period
- Worker (via public link) orders clothing — provides quantity, shoe_size, height, body_type
- Admin marks order as 'issued' (wydane); usage_period_months starts counting from that date
- Worker can re-order the same type only after usage_period elapses from last 'issued' order
  AND when yearly quota hasn't been exceeded.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field
import uuid

from database import db
from auth import get_current_user, get_current_admin

router = APIRouter()


# ============= Schemas =============
class ClothingTypeCreate(BaseModel):
    name: str
    yearly_limit: int = Field(ge=1)
    start_month: int = Field(ge=1, le=12)
    end_month: int = Field(ge=1, le=12)
    usage_period_months: int = Field(ge=0, default=0)  # 0 = no waiting period
    requires_shoe_size: bool = False
    requires_height: bool = True
    requires_body_type: bool = True


class ClothingTypeUpdate(BaseModel):
    name: Optional[str] = None
    yearly_limit: Optional[int] = None
    start_month: Optional[int] = None
    end_month: Optional[int] = None
    usage_period_months: Optional[int] = None
    requires_shoe_size: Optional[bool] = None
    requires_height: Optional[bool] = None
    requires_body_type: Optional[bool] = None
    is_active: Optional[bool] = None


class ClothingOrderCreate(BaseModel):
    clothing_type_id: str
    quantity: int = Field(ge=1)
    shoe_size: Optional[str] = None
    height: Optional[str] = None
    body_type: Optional[str] = None  # 'chudy' | 'sredni' | 'gruby'


# ============= Helpers =============
def _parse_dt(v) -> Optional[datetime]:
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _months_between(start_month: int, end_month: int, check_month: int) -> bool:
    """Check if `check_month` falls within [start_month, end_month] window.
    Handles wraparound (e.g. Nov-Feb = 11,12,1,2).
    """
    if start_month <= end_month:
        return start_month <= check_month <= end_month
    # Wraparound
    return check_month >= start_month or check_month <= end_month


async def _compute_remaining(ct: dict, employee_id: str) -> dict:
    """For given clothing type and employee, compute:
    - ordered_this_year: count of orders placed this year
    - remaining_this_year: yearly_limit - ordered_this_year
    - next_available_at: ISO datetime when a new order becomes possible (None if now)
    - can_order_now: bool
    - reason: human readable reason if cannot order
    """
    now = datetime.now()
    year = now.year
    yearly_limit = int(ct.get("yearly_limit") or 0)
    usage_period = int(ct.get("usage_period_months") or 0)

    orders = await db.clothing_orders.find(
        {"clothing_type_id": ct["id"], "employee_id": employee_id},
        {"_id": 0}
    ).to_list(500)

    # Count ordered this year
    ordered_this_year = 0
    for o in orders:
        created = _parse_dt(o.get("created_at"))
        if created and created.year == year:
            ordered_this_year += int(o.get("quantity") or 0)

    remaining = max(0, yearly_limit - ordered_this_year)

    # Next available based on last issued order + usage_period
    next_available_at = None
    if usage_period > 0:
        last_issued = None
        for o in orders:
            if o.get("status") == "issued":
                issued_dt = _parse_dt(o.get("issued_at"))
                if issued_dt and (last_issued is None or issued_dt > last_issued):
                    last_issued = issued_dt
        if last_issued is not None:
            cutoff = last_issued + timedelta(days=30 * usage_period)
            if cutoff > now:
                next_available_at = cutoff.isoformat()

    # Order window
    in_window = _months_between(ct["start_month"], ct["end_month"], now.month)

    reason = None
    if not ct.get("is_active", True):
        reason = "Pozycja nieaktywna"
    elif remaining <= 0:
        reason = f"Roczny limit wyczerpany ({ordered_this_year}/{yearly_limit})"
    elif next_available_at is not None:
        reason = f"Mozna zamowic od {next_available_at[:10]} (okres uzytkowania)"
    elif not in_window:
        reason = f"Poza oknem zamawiania (miesiace {ct['start_month']}-{ct['end_month']})"

    return {
        "ordered_this_year": ordered_this_year,
        "remaining_this_year": remaining,
        "next_available_at": next_available_at,
        "can_order_now": reason is None,
        "reason": reason,
    }


# ============= Clothing types CRUD (admin) =============
@router.get("/clothing/types")
async def list_clothing_types(current_user: dict = Depends(get_current_user)):
    items = await db.clothing_types.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return items


@router.post("/clothing/types")
async def create_clothing_type(payload: ClothingTypeCreate,
                                 current_user: dict = Depends(get_current_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "yearly_limit": payload.yearly_limit,
        "start_month": payload.start_month,
        "end_month": payload.end_month,
        "usage_period_months": payload.usage_period_months,
        "requires_shoe_size": payload.requires_shoe_size,
        "requires_height": payload.requires_height,
        "requires_body_type": payload.requires_body_type,
        "is_active": True,
        "created_at": datetime.now().isoformat(),
    }
    await db.clothing_types.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/clothing/types/{type_id}")
async def update_clothing_type(type_id: str, payload: ClothingTypeUpdate,
                                 current_user: dict = Depends(get_current_admin)):
    update_doc = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_doc:
        raise HTTPException(status_code=400, detail="Brak pol do aktualizacji")
    if "name" in update_doc:
        update_doc["name"] = update_doc["name"].strip()
    result = await db.clothing_types.update_one({"id": type_id}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pozycja nie znaleziona")
    doc = await db.clothing_types.find_one({"id": type_id}, {"_id": 0})
    return doc


@router.delete("/clothing/types/{type_id}")
async def delete_clothing_type(type_id: str,
                                 current_user: dict = Depends(get_current_admin)):
    result = await db.clothing_types.delete_one({"id": type_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pozycja nie znaleziona")
    return {"message": "Pozycja usunieta"}


# ============= Orders (admin) =============
@router.get("/clothing/orders")
async def list_all_orders(current_user: dict = Depends(get_current_admin)):
    items = await db.clothing_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return items


@router.post("/clothing/orders/{order_id}/issue")
async def mark_order_issued(order_id: str,
                              current_user: dict = Depends(get_current_admin)):
    order = await db.clothing_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Zamowienie nie znalezione")
    if order.get("status") == "issued":
        raise HTTPException(status_code=400, detail="Zamowienie juz wydane")
    await db.clothing_orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "issued",
            "issued_at": datetime.now().isoformat(),
            "issued_by": current_user["sub"],
        }}
    )
    return {"message": "Oznaczono jako wydane"}


@router.delete("/clothing/orders/{order_id}")
async def delete_order(order_id: str,
                         current_user: dict = Depends(get_current_admin)):
    result = await db.clothing_orders.delete_one({"id": order_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zamowienie nie znalezione")
    return {"message": "Zamowienie usuniete"}


# ============= Employee summary (admin) =============
@router.get("/clothing/employees-summary")
async def employees_summary(current_user: dict = Depends(get_current_admin)):
    """For each employee returns counts per clothing type: issued_count, remaining_this_year, can_order_now."""
    employees = await db.employees.find({}, {"_id": 0, "id": 1, "full_name": 1}).sort("full_name", 1).to_list(5000)
    types = await db.clothing_types.find({"is_active": True}, {"_id": 0}).to_list(500)

    result = []
    for emp in employees:
        per_type = []
        for ct in types:
            info = await _compute_remaining(ct, emp["id"])
            # count 'issued' ever (all-time)
            issued_count = await db.clothing_orders.count_documents({
                "clothing_type_id": ct["id"],
                "employee_id": emp["id"],
                "status": "issued",
            })
            per_type.append({
                "clothing_type_id": ct["id"],
                "clothing_type_name": ct["name"],
                "yearly_limit": ct["yearly_limit"],
                "ordered_this_year": info["ordered_this_year"],
                "remaining_this_year": info["remaining_this_year"],
                "issued_count_total": issued_count,
                "next_available_at": info["next_available_at"],
                "can_order_now": info["can_order_now"],
                "reason": info["reason"],
            })
        result.append({
            "employee_id": emp["id"],
            "employee_name": emp["full_name"],
            "items": per_type,
        })
    return result


# ============= Public worker endpoints =============
@router.get("/public/clothing/{token}/types")
async def public_list_types(token: str):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Invalid link")

    types = await db.clothing_types.find(
        {"is_active": True}, {"_id": 0}
    ).sort("name", 1).to_list(500)

    result = []
    for ct in types:
        info = await _compute_remaining(ct, employee["id"])
        result.append({**ct, **info})
    return result


@router.get("/public/clothing/{token}/orders")
async def public_list_my_orders(token: str):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Invalid link")

    orders = await db.clothing_orders.find(
        {"employee_id": employee["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return orders


@router.post("/public/clothing/{token}/order")
async def public_place_order(token: str, payload: ClothingOrderCreate):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Invalid link")

    ct = await db.clothing_types.find_one({"id": payload.clothing_type_id}, {"_id": 0})
    if not ct:
        raise HTTPException(status_code=404, detail="Pozycja nie znaleziona")
    if not ct.get("is_active", True):
        raise HTTPException(status_code=400, detail="Pozycja nieaktywna")

    info = await _compute_remaining(ct, employee["id"])
    if not info["can_order_now"]:
        raise HTTPException(status_code=400, detail=info["reason"] or "Nie mozna teraz zamowic")
    if payload.quantity > info["remaining_this_year"]:
        raise HTTPException(
            status_code=400,
            detail=f"Mozesz zamowic max {info['remaining_this_year']} szt. (pozostalo w tym roku)"
        )

    # Validate required extra fields per type
    if ct.get("requires_shoe_size") and not payload.shoe_size:
        raise HTTPException(status_code=400, detail="Podaj rozmiar buta")
    if ct.get("requires_height") and not payload.height:
        raise HTTPException(status_code=400, detail="Podaj wzrost")
    if ct.get("requires_body_type") and payload.body_type not in ("chudy", "sredni", "gruby"):
        raise HTTPException(status_code=400, detail="Wybierz sylwetke (chudy / sredni / gruby)")

    order = {
        "id": str(uuid.uuid4()),
        "employee_id": employee["id"],
        "employee_name": employee["full_name"],
        "clothing_type_id": ct["id"],
        "clothing_type_name": ct["name"],
        "quantity": payload.quantity,
        "shoe_size": payload.shoe_size,
        "height": payload.height,
        "body_type": payload.body_type,
        "status": "ordered",
        "issued_at": None,
        "issued_by": None,
        "created_at": datetime.now().isoformat(),
    }
    await db.clothing_orders.insert_one(order)

    # Insert admin notification
    notif = {
        "id": str(uuid.uuid4()),
        "type": "clothing_order",
        "title": f"Nowe zamowienie: {ct['name']}",
        "message": f"{employee['full_name']} zamowil {payload.quantity} x {ct['name']}",
        "employee_id": employee["id"],
        "order_id": order["id"],
        "status": "unread",
        "created_at": datetime.now().isoformat(),
    }
    try:
        await db.notifications.insert_one(notif)
    except Exception:
        pass

    order.pop("_id", None)
    return order
