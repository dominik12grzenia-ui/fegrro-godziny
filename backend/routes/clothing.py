"""Clothing (ubrania robocze) routes.

Workflow:
- Admin defines clothing types with yearly limit, order window (months), and usage period
- Worker (via public link) orders clothing — provides quantity, shoe_size, height, body_type
- Admin marks order as 'issued' (wydane); usage_period_months starts counting from that date
- Worker can re-order the same type only after usage_period elapses from last 'issued' order
  AND when yearly quota hasn't been exceeded.
"""
import base64
import io
import logging
import os
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response
from datetime import datetime, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field
import uuid

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from database import db
from auth import get_current_user, get_current_admin

router = APIRouter()
logger = logging.getLogger(__name__)


async def _send_clothing_order_email(order: dict, employee_name: str, type_name: str):
    """Send Resend email to admin when employee orders clothing. Non-blocking."""
    api_key = os.environ.get("RESEND_API_KEY")
    to_addr = os.environ.get("WAREHOUSE_NOTIFY_EMAIL", "biuro@fegrro.pl")
    from_addr = os.environ.get("RESEND_FROM_EMAIL", "noreply@fegrro.pl")
    if not api_key:
        logger.info("RESEND_API_KEY not configured - skipping clothing email")
        return
    try:
        import httpx
    except ImportError:
        logger.warning("httpx not available - cannot send email")
        return
    subject = f"FeGrro: zamowienie ubran od {employee_name}"
    html = f"""
    <h2>Nowe zamowienie ubran</h2>
    <p><strong>Pracownik:</strong> {employee_name}</p>
    <p><strong>Pozycja:</strong> {type_name}</p>
    <p><strong>Ilosc:</strong> {order.get('quantity')}</p>
    <hr>
    <p><strong>Wymiary pracownika:</strong></p>
    <ul>
      <li>Wzrost: {order.get('height') or '-'}</li>
      <li>But: {order.get('shoe_size') or '-'}</li>
      <li>Spodnie: {order.get('pants_size') or '-'}</li>
      <li>Kurtka: {order.get('jacket_size') or '-'}</li>
      <li>Obwod w pasie: {order.get('waist') or '-'}</li>
      <li>Sylwetka: {order.get('body_type') or '-'}</li>
    </ul>
    <p><em>Otworz panel administratora aby wydac zamowienie.</em></p>
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "from": from_addr,
                    "to": [to_addr],
                    "reply_to": ["biuro@fegrro.pl"],
                    "subject": subject,
                    "html": html,
                },
            )
            if resp.status_code >= 300:
                logger.warning(f"Resend clothing email returned {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.warning(f"Clothing email send failed: {e}")


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
    pants_size: Optional[str] = None  # S/M/L/XL/XXL/XXXL
    jacket_size: Optional[str] = None  # S/M/L/XL/XXL/XXXL
    waist: Optional[str] = None  # cm


VALID_GARMENT_SIZES = {"XS", "S", "M", "L", "XL", "XXL", "XXXL"}


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


@router.post("/clothing/orders/{order_id}/forward")
async def mark_order_forwarded(order_id: str,
                                current_user: dict = Depends(get_current_admin)):
    """Mark as 'przekazane do realizacji' - sent to supplier/processor.

    Toggle behavior: if already forwarded, this UN-forwards. This way one
    button serves both directions ("zaznacz/odznacz przekazane do realizacji").
    Orders with status='forwarded' are EXCLUDED from the default PDF export
    so they don't appear on subsequent supplier lists.
    """
    order = await db.clothing_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Zamowienie nie znalezione")
    if order.get("status") == "issued":
        raise HTTPException(status_code=400, detail="Zamowienie juz wydane - cofnij wydanie najpierw")
    if order.get("status") == "forwarded":
        await db.clothing_orders.update_one(
            {"id": order_id},
            {"$set": {"status": "ordered"}, "$unset": {"forwarded_at": "", "forwarded_by": ""}}
        )
        return {"message": "Cofnieto: zamowienie wraca do listy do wydania", "status": "ordered"}
    await db.clothing_orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "forwarded",
            "forwarded_at": datetime.now().isoformat(),
            "forwarded_by": current_user["sub"],
        }}
    )
    return {"message": "Oznaczono jako przekazane do realizacji", "status": "forwarded"}


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
        {}, {"_id": 0, "id": 1, "full_name": 1, "clothing_limits": 1, "is_archived": 1}
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
            "is_archived": bool(emp.get("is_archived")),
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
        "pants_size": profile.get("pants_size"),
        "jacket_size": profile.get("jacket_size"),
        "waist": profile.get("waist"),
    }


@router.put("/public/clothing/{token}/profile")
async def public_save_profile(token: str, payload: ClothingProfileUpdate):
    employee = await db.employees.find_one({"public_token": token}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Invalid link")
    if payload.body_type not in (None, "chudy", "sredni", "gruby"):
        raise HTTPException(status_code=400, detail="Nieprawidlowa sylwetka")

    pants_size = (payload.pants_size or "").strip().upper() or None
    jacket_size = (payload.jacket_size or "").strip().upper() or None
    if pants_size and pants_size not in VALID_GARMENT_SIZES:
        raise HTTPException(status_code=400, detail=f"Nieprawidlowy rozmiar spodni. Dozwolone: {', '.join(sorted(VALID_GARMENT_SIZES))}")
    if jacket_size and jacket_size not in VALID_GARMENT_SIZES:
        raise HTTPException(status_code=400, detail=f"Nieprawidlowy rozmiar kurtki. Dozwolone: {', '.join(sorted(VALID_GARMENT_SIZES))}")

    profile = {
        "shoe_size": (payload.shoe_size or "").strip() or None,
        "height": (payload.height or "").strip() or None,
        "body_type": payload.body_type,
        "pants_size": pants_size,
        "jacket_size": jacket_size,
        "waist": (payload.waist or "").strip() or None,
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
    pants_size = profile.get("pants_size")
    jacket_size = profile.get("jacket_size")
    waist = profile.get("waist")

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
        "pants_size": pants_size,
        "jacket_size": jacket_size,
        "waist": waist,
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

    # Email to admin (Resend) + push to admins (PWA)
    try:
        await _send_clothing_order_email(order, employee["full_name"], ct["name"])
    except Exception as e:
        logger.warning(f"Email send failed for clothing order {order['id']}: {e}")
    try:
        from routes.push import send_push_to_admins
        await send_push_to_admins(
            title="Nowe zamowienie ubran",
            body=f"{employee['full_name']}: {payload.quantity} x {ct['name']}",
            url="/admin/dashboard",
            tag=f"clothing-order-{order['id']}",
        )
    except Exception as e:
        logger.warning(f"Push to admins (clothing) failed: {e}")

    order.pop("_id", None)
    return order



# ============= PDF export (admin) =============
_PL_MAP = {
    "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
    "ó": "o", "ś": "s", "ź": "z", "ż": "z",
    "Ą": "A", "Ć": "C", "Ę": "E", "Ł": "L", "Ń": "N",
    "Ó": "O", "Ś": "S", "Ź": "Z", "Ż": "Z",
}
_BODY_LABELS = {"chudy": "Szczuply", "sredni": "Sredni", "gruby": "Silny"}


def _ascii(text) -> str:
    if text is None:
        return ""
    s = str(text)
    for k, v in _PL_MAP.items():
        s = s.replace(k, v)
    return s


def _decode_photo(photo: Optional[str]) -> Optional[io.BytesIO]:
    if not photo:
        return None
    data = photo
    if "," in data:
        # strip "data:image/...;base64,"
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=False)
    except (ValueError, TypeError):
        return None
    # Validate via PIL to avoid broken-stream crashes in reportlab
    try:
        from PIL import Image as PILImage
        bio = io.BytesIO(raw)
        img = PILImage.open(bio)
        img.verify()  # raises on broken
        # verify() closes the file; re-open for reportlab to use
        return io.BytesIO(raw)
    except Exception:
        return None


@router.get("/clothing/orders/pdf")
async def export_orders_pdf(
    status: str = Query("ordered", pattern="^(ordered|issued|all|include_forwarded)$"),
    current_user: dict = Depends(get_current_admin),
):
    """Generate a PDF with orders grouped by clothing type.

    status=ordered (default) -> only NEW pending orders (NOT yet forwarded to
                                supplier and NOT yet issued). Use this for the
                                supplier order list to avoid duplicating items.
    status=include_forwarded -> ordered + already forwarded (all not-yet-issued)
    status=all                -> everything in any state
    status=issued             -> only issued
    """
    # 1) Fetch orders
    query = {}
    if status == "ordered":
        # Exclude both 'issued' AND 'forwarded' - these are already in flight
        query = {"status": {"$nin": ["issued", "forwarded"]}}
    elif status == "include_forwarded":
        query = {"status": {"$ne": "issued"}}
    elif status == "issued":
        query = {"status": "issued"}

    orders = await db.clothing_orders.find(query, {"_id": 0}).to_list(5000)
    types = await db.clothing_types.find({}, {"_id": 0}).to_list(500)
    types_by_id = {t["id"]: t for t in types}

    # 2) Fetch employees for profile lookup
    emp_ids = list({o.get("employee_id") for o in orders if o.get("employee_id")})
    emp_docs = []
    if emp_ids:
        emp_docs = await db.employees.find(
            {"id": {"$in": emp_ids}},
            {"_id": 0, "id": 1, "full_name": 1, "clothing_profile": 1},
        ).to_list(5000)
    emp_by_id = {e["id"]: e for e in emp_docs}

    # 3) Group orders by clothing_type_id
    groups = {}
    for o in orders:
        tid = o.get("clothing_type_id")
        if not tid:
            continue
        if tid not in groups:
            groups[tid] = {"type": types_by_id.get(tid) or {"id": tid, "name": o.get("clothing_type_name", "?")}, "orders": []}
        groups[tid]["orders"].append(o)

    # Sort by clothing name
    sorted_groups = sorted(groups.values(), key=lambda g: _ascii(g["type"].get("name", "")).lower())

    # 4) Build PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=10 * mm, rightMargin=10 * mm,
        topMargin=12 * mm, bottomMargin=12 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=styles["Heading1"], fontSize=16, alignment=1, spaceAfter=4
    )
    sub_style = ParagraphStyle(
        "Sub", parent=styles["Normal"], fontSize=9, alignment=1, spaceAfter=10, textColor=colors.HexColor("#64748B")
    )
    cell_style = ParagraphStyle(
        "Cell", parent=styles["Normal"], fontSize=8, leading=10
    )
    name_style = ParagraphStyle(
        "Name", parent=styles["Normal"], fontSize=10, leading=12, fontName="Helvetica-Bold"
    )
    workers_style = ParagraphStyle(
        "Workers", parent=styles["Normal"], fontSize=8, leading=11
    )

    elements = [
        Paragraph("FeGrro - Zamowienie ubran", title_style),
        Paragraph(
            _ascii(f"Status: {status} | Wygenerowano: {datetime.now().strftime('%Y-%m-%d %H:%M')}"),
            sub_style,
        ),
        Spacer(1, 2 * mm),
    ]

    if not sorted_groups:
        elements.append(Paragraph("Brak zamowien do eksportu.", cell_style))
    else:
        header = [
            Paragraph("<b>Zdjecie</b>", cell_style),
            Paragraph("<b>Nazwa</b>", cell_style),
            Paragraph("<b>Szt.</b>", cell_style),
            Paragraph("<b>Pracownicy (imie, wzrost, but, spodnie, kurtka, pas, sylwetka)</b>", cell_style),
        ]
        table_data = [header]

        for g in sorted_groups:
            ct = g["type"]
            # Photo cell
            photo_buf = _decode_photo(ct.get("photo"))
            if photo_buf:
                try:
                    img = RLImage(photo_buf, width=28 * mm, height=28 * mm, kind="proportional")
                    photo_cell = img
                except Exception:
                    photo_cell = Paragraph("-", cell_style)
            else:
                photo_cell = Paragraph("<i>brak</i>", cell_style)

            # Quantity
            total_qty = sum(int(o.get("quantity") or 0) for o in g["orders"])

            # Size summary - group by shoe_size if type requires shoe, otherwise by body_type
            requires_shoe = bool(ct.get("requires_shoe_size"))
            size_counts = {}  # label -> qty
            for o in g["orders"]:
                emp = emp_by_id.get(o.get("employee_id")) or {}
                prof = emp.get("clothing_profile") or {}
                qty = int(o.get("quantity") or 0)
                if requires_shoe:
                    label = _ascii(o.get("shoe_size") or prof.get("shoe_size") or "?")
                else:
                    body = o.get("body_type") or prof.get("body_type")
                    label = _BODY_LABELS.get(body, "?") if body else "?"
                size_counts[label] = size_counts.get(label, 0) + qty
            # Sort: shoes numerically, body_type by predefined order
            if requires_shoe:
                def _shoe_key(k):
                    try:
                        return (0, int(k))
                    except (ValueError, TypeError):
                        return (1, k)
                size_pairs = sorted(size_counts.items(), key=lambda kv: _shoe_key(kv[0]))
            else:
                order_lbl = {"Szczuply": 0, "Sredni": 1, "Silny": 2, "?": 99}
                size_pairs = sorted(size_counts.items(), key=lambda kv: order_lbl.get(kv[0], 50))
            size_summary = ", ".join(f"<b>{lbl}</b>: {q} szt." for lbl, q in size_pairs)
            size_label = "Buty" if requires_shoe else "Sylwetka"

            # Workers list
            lines = []
            orders_sorted = sorted(g["orders"], key=lambda o: _ascii(o.get("employee_name", "")).lower())
            for o in orders_sorted:
                emp = emp_by_id.get(o.get("employee_id")) or {}
                prof = emp.get("clothing_profile") or {}
                shoe = o.get("shoe_size") or prof.get("shoe_size") or "-"
                height = o.get("height") or prof.get("height") or "-"
                body = o.get("body_type") or prof.get("body_type")
                body_lbl = _BODY_LABELS.get(body, "-") if body else "-"
                pants = o.get("pants_size") or prof.get("pants_size") or "-"
                jacket = o.get("jacket_size") or prof.get("jacket_size") or "-"
                waist = o.get("waist") or prof.get("waist") or "-"
                name = _ascii(o.get("employee_name") or emp.get("full_name") or "?")
                qty = int(o.get("quantity") or 0)
                issued_mark = " [WYD]" if o.get("status") == "issued" else ""
                lines.append(
                    f"&bull; <b>{name}</b>{issued_mark} &middot; x{qty} &middot; "
                    f"wzrost {_ascii(height)} &middot; but {_ascii(shoe)} &middot; "
                    f"spodnie {_ascii(pants)} &middot; kurtka {_ascii(jacket)} &middot; "
                    f"pas {_ascii(waist)} &middot; sylwetka {body_lbl}"
                )
            summary_block = (
                f'<font color="#5F7151"><b>{size_label}:</b> {size_summary}</font><br/>'
                if size_summary else ""
            )
            workers_html = summary_block + ("<br/>".join(lines) if lines else "-")

            table_data.append([
                photo_cell,
                Paragraph(_ascii(ct.get("name", "")), name_style),
                Paragraph(str(total_qty), cell_style),
                Paragraph(workers_html, workers_style),
            ])

        col_widths = [32 * mm, 45 * mm, 12 * mm, 101 * mm]
        table = Table(table_data, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2A384C")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#94A3B8")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (2, 1), (2, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F5F9")]),
        ]))
        elements.append(table)

        # ===== Summary page (zbiorczo per typ) =====
        from reportlab.platypus import PageBreak
        elements.append(PageBreak())
        summary_title = ParagraphStyle(
            "SummaryTitle", parent=styles["Heading1"], fontSize=14, alignment=1, spaceAfter=3
        )
        summary_sub = ParagraphStyle(
            "SummarySub", parent=styles["Normal"], fontSize=9, alignment=1, spaceAfter=8,
            textColor=colors.HexColor("#64748B")
        )
        elements.append(Paragraph("Podsumowanie zbiorcze - do zamowienia u dostawcy", summary_title))
        elements.append(Paragraph(
            _ascii(f"Status: {status} | {datetime.now().strftime('%Y-%m-%d %H:%M')}"),
            summary_sub,
        ))

        sum_header = [
            Paragraph("<b>Nazwa</b>", cell_style),
            Paragraph("<b>Razem</b>", cell_style),
            Paragraph("<b>Rozbicie rozmiarow</b>", cell_style),
        ]
        sum_rows = [sum_header]
        for g in sorted_groups:
            ct = g["type"]
            requires_shoe = bool(ct.get("requires_shoe_size"))
            size_counts = {}
            total = 0
            for o in g["orders"]:
                emp = emp_by_id.get(o.get("employee_id")) or {}
                prof = emp.get("clothing_profile") or {}
                qty = int(o.get("quantity") or 0)
                total += qty
                if requires_shoe:
                    label = _ascii(o.get("shoe_size") or prof.get("shoe_size") or "?")
                else:
                    body = o.get("body_type") or prof.get("body_type")
                    label = _BODY_LABELS.get(body, "?") if body else "?"
                size_counts[label] = size_counts.get(label, 0) + qty
            if requires_shoe:
                def _shoe_key2(k):
                    try:
                        return (0, int(k))
                    except (ValueError, TypeError):
                        return (1, k)
                pairs = sorted(size_counts.items(), key=lambda kv: _shoe_key2(kv[0]))
                size_tag = "Buty"
            else:
                order_lbl2 = {"Szczuply": 0, "Sredni": 1, "Silny": 2, "?": 99}
                pairs = sorted(size_counts.items(), key=lambda kv: order_lbl2.get(kv[0], 50))
                size_tag = "Sylwetka"
            breakdown = ", ".join(f"<b>{lbl}</b>&nbsp;&times;&nbsp;{q}" for lbl, q in pairs) or "-"
            sum_rows.append([
                Paragraph(_ascii(ct.get("name", "")), name_style),
                Paragraph(f"<b>{total}</b>", cell_style),
                Paragraph(f"<font color='#64748B'>{size_tag}:</font> {breakdown}", workers_style),
            ])

        sum_table = Table(sum_rows, colWidths=[55 * mm, 18 * mm, 117 * mm], repeatRows=1)
        sum_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#5F7151")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#94A3B8")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (1, 1), (1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F5F9")]),
        ]))
        elements.append(sum_table)

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    filename = f"zamowienie_ubran_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
