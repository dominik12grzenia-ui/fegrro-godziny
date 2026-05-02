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
    photo: Optional[str] = None  # base64
    tier_group: Optional[str] = None  # items with same group are exclusive (e.g. "spodnie")
    tier_level: int = 1  # higher = more premium; cannot downgrade within same group after ordering


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
    photo: Optional[str] = None
    tier_group: Optional[str] = None
    tier_level: Optional[int] = None


class ClothingOrderCreate(BaseModel):
    clothing_type_id: str
    quantity: int = Field(ge=1)


class ClothingProfileUpdate(BaseModel):
    shoe_size: Optional[str] = None
    height: Optional[str] = None
    body_type: Optional[str] = None  # 'chudy' | 'sredni' | 'gruby'


class EmployeeLimitUpdate(BaseModel):
    employee_id: str
    clothing_type_id: str
    yearly_limit: Optional[int] = None  # None = use default from type


# ============= Helpers =============
POLISH_MONTHS_GEN = [
    "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "wrzesnia", "pazdziernika", "listopada", "grudnia",
]


def _fmt_pl_date(iso: str) -> str:
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return iso[:10] if iso else ""
    return f"{d.day} {POLISH_MONTHS_GEN[d.month - 1]} {d.year}"


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
    """For given clothing type and employee, compute can_order_now + reason."""
    now = datetime.now()
    year = now.year

    # Per-employee limit override (falls back to type default)
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0, "clothing_limits": 1})
    overrides = (emp or {}).get("clothing_limits") or {}
    yearly_limit = int(overrides.get(ct["id"]) or ct.get("yearly_limit") or 0)
    usage_period = int(ct.get("usage_period_months") or 0)

    orders = await db.clothing_orders.find(
        {"clothing_type_id": ct["id"], "employee_id": employee_id},
        {"_id": 0}
    ).to_list(500)

    ordered_this_year = 0
    for o in orders:
        created = _parse_dt(o.get("created_at"))
        if created and created.year == year:
            ordered_this_year += int(o.get("quantity") or 0)
    remaining = max(0, yearly_limit - ordered_this_year)

    # Usage period blocker - counted from the LAST order (any status),
    # so worker cannot stack 2 orders at once within the usage window.
    next_available_at = None
    if usage_period > 0:
        last_order_at = None
        for o in orders:
            created = _parse_dt(o.get("created_at"))
            if created and (last_order_at is None or created > last_order_at):
                last_order_at = created
        if last_order_at is not None:
            cutoff = last_order_at + timedelta(days=30 * usage_period)
            if cutoff > now:
                next_available_at = cutoff.isoformat()

    # Tier lock: look at ALL orders in same tier_group (any status) placed this year;
    # the tier_level of the first one locks the employee into that level (same tier only).
    tier_locked_level = None
    tier_locked_name = None
    tg = ct.get("tier_group")
    if tg:
        all_types = await db.clothing_types.find(
            {"tier_group": tg}, {"_id": 0, "id": 1, "name": 1, "tier_level": 1}
        ).to_list(200)
        group_ids = [t["id"] for t in all_types]
        group_orders = await db.clothing_orders.find(
            {"clothing_type_id": {"$in": group_ids}, "employee_id": employee_id},
            {"_id": 0}
        ).sort("created_at", 1).to_list(200)
        for go in group_orders:
            created = _parse_dt(go.get("created_at"))
            if created and created.year == year:
                first_type = next((t for t in all_types if t["id"] == go["clothing_type_id"]), None)
                tier_locked_level = int((first_type or {}).get("tier_level") or 1)
                tier_locked_name = (first_type or {}).get("name")
                break

    in_window = _months_between(ct["start_month"], ct["end_month"], now.month)

    reason = None
    if not ct.get("is_active", True):
        reason = "Pozycja nieaktywna"
    elif tier_locked_level is not None and int(ct.get("tier_level") or 1) != tier_locked_level:
        reason = f"Masz juz zamowienie: {tier_locked_name} (inny wariant tej grupy)"
    elif remaining <= 0:
        reason = f"Roczny limit wyczerpany ({ordered_this_year}/{yearly_limit})"
    elif next_available_at is not None:
        reason = f"Mozesz zamowic ponownie od {_fmt_pl_date(next_available_at)}"
    elif not in_window:
        reason = f"Poza oknem zamawiania (miesiace {ct['start_month']}-{ct['end_month']})"

    return {
        "ordered_this_year": ordered_this_year,
        "remaining_this_year": remaining,
        "yearly_limit_effective": yearly_limit,
        "next_available_at": next_available_at,
        "can_order_now": reason is None,
        "reason": reason,
        "tier_locked_level": tier_locked_level,
        "tier_locked_name": tier_locked_name,
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
        "photo": payload.photo,
        "tier_group": (payload.tier_group or "").strip() or None,
        "tier_level": int(payload.tier_level or 1),
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


@router.post("/clothing/employee-limit")
async def set_employee_limit(payload: EmployeeLimitUpdate,
                              current_user: dict = Depends(get_current_admin)):
    """Override yearly_limit for a specific employee + clothing type. Pass yearly_limit=null to reset."""
    emp = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")
    ct = await db.clothing_types.find_one({"id": payload.clothing_type_id}, {"_id": 0})
    if not ct:
        raise HTTPException(status_code=404, detail="Pozycja nie znaleziona")

    key = f"clothing_limits.{payload.clothing_type_id}"
    if payload.yearly_limit is None:
        await db.employees.update_one(
            {"id": payload.employee_id},
            {"$unset": {key: ""}}
        )
    else:
        await db.employees.update_one(
            {"id": payload.employee_id},
            {"$set": {key: int(payload.yearly_limit)}}
        )
    return {"message": "Limit zaktualizowany"}


# ============= Orders (admin) =============
@router.get("/clothing/orders")
async def list_all_orders(current_user: dict = Depends(get_current_admin)):
    items = await db.clothing_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return items


@router.get("/clothing/orders-grouped")
async def list_orders_grouped(current_user: dict = Depends(get_current_admin)):
    """Returns orders grouped by employee with their clothing profile attached."""
    items = await db.clothing_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    by_emp: dict = {}
    for o in items:
        emp_id = o.get("employee_id")
        if not emp_id:
            continue
        if emp_id not in by_emp:
            by_emp[emp_id] = {
                "employee_id": emp_id,
                "employee_name": o.get("employee_name"),
                "orders": [],
            }
        by_emp[emp_id]["orders"].append(o)

    # Attach clothing profile
    for emp_id, row in by_emp.items():
        emp = await db.employees.find_one(
            {"id": emp_id}, {"_id": 0, "clothing_profile": 1, "full_name": 1}
        )
        row["clothing_profile"] = (emp or {}).get("clothing_profile") or {}
        if not row.get("employee_name") and emp:
            row["employee_name"] = emp.get("full_name")

    return sorted(
        by_emp.values(),
        key=lambda r: (r.get("employee_name") or "").lower()
    )


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
    """For each employee returns counts per clothing type (optimized: bulk queries)."""
    employees = await db.employees.find(
        {}, {"_id": 0, "id": 1, "full_name": 1, "clothing_limits": 1}
    ).sort("full_name", 1).to_list(5000)
    types = await db.clothing_types.find({"is_active": True}, {"_id": 0}).to_list(500)
    if not employees or not types:
        return []

    now = datetime.now()
    year = now.year
    emp_ids = [e["id"] for e in employees]
    type_ids = [t["id"] for t in types]

    # Bulk fetch ALL orders for all these employees/types once
    all_orders = await db.clothing_orders.find(
        {"employee_id": {"$in": emp_ids}, "clothing_type_id": {"$in": type_ids}},
        {"_id": 0}
    ).to_list(50000)

    # Also fetch orders in other (possibly inactive) types within same tier_groups
    tier_groups = list({t.get("tier_group") for t in types if t.get("tier_group")})
    group_type_map = {}  # tier_group -> [{id, name, tier_level}]
    group_orders_map = {}  # (emp_id, tier_group) -> list of orders this year sorted by created
    if tier_groups:
        group_types = await db.clothing_types.find(
            {"tier_group": {"$in": tier_groups}}, {"_id": 0, "id": 1, "name": 1, "tier_level": 1, "tier_group": 1}
        ).to_list(500)
        for gt in group_types:
            group_type_map.setdefault(gt["tier_group"], []).append(gt)
        group_type_ids = [gt["id"] for gt in group_types]
        group_all_orders = await db.clothing_orders.find(
            {"employee_id": {"$in": emp_ids}, "clothing_type_id": {"$in": group_type_ids}},
            {"_id": 0}
        ).to_list(50000)
        # Index orders by (emp_id, type_id) to resolve tier_group lookup
        type_group_by_id = {gt["id"]: gt for gt in group_types}
        for o in group_all_orders:
            gt = type_group_by_id.get(o["clothing_type_id"])
            if not gt:
                continue
            tg = gt["tier_group"]
            created = _parse_dt(o.get("created_at"))
            if not created or created.year != year:
                continue
            key = (o["employee_id"], tg)
            group_orders_map.setdefault(key, []).append((created, gt))

    # Sort each group's orders by date asc to find first
    tier_first_map = {}  # (emp_id, tier_group) -> (tier_level, name)
    for key, lst in group_orders_map.items():
        lst.sort(key=lambda x: x[0])
        _, first_type = lst[0]
        tier_first_map[key] = (int(first_type.get("tier_level") or 1), first_type.get("name"))

    # Group orders by (emp_id, type_id)
    orders_by_et = {}
    for o in all_orders:
        key = (o["employee_id"], o["clothing_type_id"])
        orders_by_et.setdefault(key, []).append(o)

    result = []
    for emp in employees:
        overrides = emp.get("clothing_limits") or {}
        per_type = []
        for ct in types:
            key = (emp["id"], ct["id"])
            orders = orders_by_et.get(key, [])
            yearly_limit = int(overrides.get(ct["id"]) or ct.get("yearly_limit") or 0)
            usage_period = int(ct.get("usage_period_months") or 0)

            ordered_this_year = 0
            issued_count = 0
            last_order_at = None
            for o in orders:
                created = _parse_dt(o.get("created_at"))
                if created and created.year == year:
                    ordered_this_year += int(o.get("quantity") or 0)
                if o.get("status") == "issued":
                    issued_count += 1
                if created and (last_order_at is None or created > last_order_at):
                    last_order_at = created

            remaining = max(0, yearly_limit - ordered_this_year)
            next_available_at = None
            if usage_period > 0 and last_order_at is not None:
                cutoff = last_order_at + timedelta(days=30 * usage_period)
                if cutoff > now:
                    next_available_at = cutoff.isoformat()

            tier_locked_level = None
            tier_locked_name = None
            tg = ct.get("tier_group")
            if tg:
                tier_lock = tier_first_map.get((emp["id"], tg))
                if tier_lock:
                    tier_locked_level, tier_locked_name = tier_lock

            in_window = _months_between(ct["start_month"], ct["end_month"], now.month)
            reason = None
            if not ct.get("is_active", True):
                reason = "Pozycja nieaktywna"
            elif tier_locked_level is not None and int(ct.get("tier_level") or 1) != tier_locked_level:
                reason = f"Masz juz zamowienie: {tier_locked_name} (inny wariant tej grupy)"
            elif remaining <= 0:
                reason = f"Roczny limit wyczerpany ({ordered_this_year}/{yearly_limit})"
            elif next_available_at is not None:
                reason = f"Mozesz zamowic ponownie od {_fmt_pl_date(next_available_at)}"
            elif not in_window:
                reason = f"Poza oknem zamawiania (miesiace {ct['start_month']}-{ct['end_month']})"

            per_type.append({
                "clothing_type_id": ct["id"],
                "clothing_type_name": ct["name"],
                "yearly_limit": ct["yearly_limit"],
                "yearly_limit_effective": yearly_limit,
                "limit_overridden": overrides.get(ct["id"]) is not None,
                "ordered_this_year": ordered_this_year,
                "remaining_this_year": remaining,
                "issued_count_total": issued_count,
                "next_available_at": next_available_at,
                "can_order_now": reason is None,
                "reason": reason,
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


@router.get("/public/clothing/{token}/profile")
async def public_get_profile(token: str):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Invalid link")
    profile = employee.get("clothing_profile") or {}
    return {
        "shoe_size": profile.get("shoe_size"),
        "height": profile.get("height"),
        "body_type": profile.get("body_type"),
    }


@router.put("/public/clothing/{token}/profile")
async def public_save_profile(token: str, payload: ClothingProfileUpdate):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Invalid link")
    if payload.body_type not in (None, "chudy", "sredni", "gruby"):
        raise HTTPException(status_code=400, detail="Nieprawidlowa sylwetka")

    profile = {
        "shoe_size": (payload.shoe_size or "").strip() or None,
        "height": (payload.height or "").strip() or None,
        "body_type": payload.body_type,
        "updated_at": datetime.now().isoformat(),
    }
    await db.employees.update_one(
        {"id": employee["id"]},
        {"$set": {"clothing_profile": profile}}
    )
    return profile


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

    # If usage_period is set, only 1 piece per order allowed (next one after the cooldown)
    if int(ct.get("usage_period_months") or 0) > 0 and payload.quantity > 1:
        raise HTTPException(
            status_code=400,
            detail="Mozesz zamowic tylko 1 szt. naraz - kolejna bedzie dostepna po uplywie okresu uzytkowania"
        )

    # Read employee clothing profile
    profile = employee.get("clothing_profile") or {}
    shoe_size = profile.get("shoe_size")
    height = profile.get("height")
    body_type = profile.get("body_type")

    if ct.get("requires_shoe_size") and not shoe_size:
        raise HTTPException(status_code=400, detail="Uzupelnij rozmiar buta w swoim profilu wymiarow")
    if ct.get("requires_height") and not height:
        raise HTTPException(status_code=400, detail="Uzupelnij wzrost w swoim profilu wymiarow")
    if ct.get("requires_body_type") and body_type not in ("chudy", "sredni", "gruby"):
        raise HTTPException(status_code=400, detail="Wybierz sylwetke w swoim profilu wymiarow")

    order = {
        "id": str(uuid.uuid4()),
        "employee_id": employee["id"],
        "employee_name": employee["full_name"],
        "clothing_type_id": ct["id"],
        "clothing_type_name": ct["name"],
        "quantity": payload.quantity,
        "shoe_size": shoe_size,
        "height": height,
        "body_type": body_type,
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
