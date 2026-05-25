"""Equipment (Sprzet) management routes.

Features:
- Admin: full CRUD on equipment, assign quantities to foremen, set broken-in-warehouse count
- Foreman: list own equipment, transfer to another foreman (requires acceptance), report defect
- Constraint: assigned + broken_in_warehouse <= total_quantity
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta
from typing import Optional, List
import uuid
import logging

from database import db
from auth import get_current_user, get_current_admin, get_current_admin_or_warehouse
from image_utils import make_thumbnail
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


# ============= Pydantic schemas =============
class EquipmentCreate(BaseModel):
    name: str
    brand: Optional[str] = None
    total_quantity: int
    photo: Optional[str] = None  # base64 encoded
    category: Optional[str] = "electronics"  # electronics | accessories | formwork
    variants: Optional[List[str]] = None  # e.g. ["5mm", "8mm", "10mm"] for drills/discs


class EquipmentUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    total_quantity: Optional[int] = None
    photo: Optional[str] = None
    status: Optional[str] = None  # working / broken / maintenance
    broken_quantity: Optional[int] = None  # number of units returned to warehouse for repair
    category: Optional[str] = None
    variants: Optional[List[str]] = None


class AssignmentSet(BaseModel):
    foreman_id: str
    quantity: int


class TransferCreate(BaseModel):
    equipment_id: str
    to_foreman_id: str
    quantity: int


class DefectReport(BaseModel):
    equipment_id: str
    quantity: int
    description: Optional[str] = None
    photo: Optional[str] = None  # base64


class ReturnToWarehouse(BaseModel):
    equipment_id: str
    quantity: int


class WarehouseKeeperSet(BaseModel):
    foreman_id: Optional[str] = None  # None = clear (only admin gets notifications)


# ============= Helpers =============
async def _get_total_assigned(equipment_id: str) -> int:
    cursor = db.equipment_assignments.aggregate([
        {"$match": {"equipment_id": equipment_id}},
        {"$group": {"_id": None, "total": {"$sum": "$quantity"}}}
    ])
    docs = await cursor.to_list(1)
    return docs[0]["total"] if docs else 0


async def _add_history(equipment_id: str, action: str, actor_id: str, actor_name: str,
                        details: dict):
    doc = {
        "id": str(uuid.uuid4()),
        "equipment_id": equipment_id,
        "action": action,
        "actor_id": actor_id,
        "actor_name": actor_name,
        "details": details,
        "created_at": datetime.now().isoformat()
    }
    await db.equipment_history.insert_one(doc)


async def _get_user_name(user_id: str) -> str:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "full_name": 1})
    return u["full_name"] if u else "Nieznany"


# ============= iter89: Equipment Assignment Confirmation (48h SLA) =============
import os  # noqa: E402
from urllib.parse import quote  # noqa: E402


async def _send_assignment_email(*, to_email: str, subject: str, html: str) -> None:
    """Resend email helper - silent fail."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key or not to_email:
        return
    from_addr = os.environ.get("RESEND_FROM_EMAIL", "noreply@fegrro.pl")
    try:
        import httpx  # noqa: WPS433
        async with httpx.AsyncClient(timeout=12) as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"from": from_addr, "to": [to_email], "subject": subject, "html": html},
            )
    except Exception as e:
        logger.warning(f"Resend assignment email failed: {e}")


async def _notify_assignment_pending(*, equipment_id: str, equipment_name: str,
                                       foreman_id: str, foreman_name: str,
                                       quantity: int, confirmation_id: str) -> None:
    """Push + email do brygadzisty z prosba o potwierdzenie odbioru."""
    try:
        from routes.push import send_push
        await send_push(
            user_id=foreman_id,
            title="Sprzet przypisany - potwierdz odbior",
            body=f"{equipment_name} x{quantity}. Masz 48h na potwierdzenie.",
            url="/worker/dashboard",
            tag=f"confirm-{confirmation_id}",
            require_interaction=True,
        )
    except Exception as e:
        logger.warning(f"Push (assign pending) failed: {e}")
    # Email
    user = await db.users.find_one({"id": foreman_id}, {"_id": 0, "email": 1})
    email = (user or {}).get("email")
    if email:
        html = f"""<html><body style="font-family:sans-serif;max-width:600px">
          <h2 style="color:#5F7151">Sprzet przypisany do potwierdzenia</h2>
          <p>Witaj <b>{foreman_name}</b>,</p>
          <p>Zostal Ci przypisany sprzet: <b>{equipment_name} x{quantity}</b>.</p>
          <p>Masz <b>48 godzin</b> na potwierdzenie odbioru w aplikacji.</p>
          <p>Jezeli nie otrzymales sprzetu - kliknij "Nie otrzymalem" w aplikacji.</p>
        </body></html>"""
        await _send_assignment_email(
            to_email=email,
            subject=f"FeGrro: potwierdz odbior {equipment_name} x{quantity}",
            html=html,
        )


async def _notify_assignment_disputed(*, confirmation: dict, reason: str | None) -> None:
    """Push do adminow + email gdy pracownik kontestuje odbior."""
    try:
        from routes.push import send_push_to_admins
        await send_push_to_admins(
            title="Spor przypisania sprzetu",
            body=f"{confirmation['foreman_name']} zgloszil ze nie otrzymal: {confirmation['equipment_name']} x{confirmation['quantity']}",
            url="/admin/dashboard",
            tag=f"dispute-{confirmation['id']}",
            require_interaction=True,
        )
    except Exception as e:
        logger.warning(f"Push (dispute) failed: {e}")
    # Email do adminow
    admins = await db.users.find({"role": "admin", "email": {"$exists": True, "$ne": None}},
                                   {"_id": 0, "email": 1, "full_name": 1}).to_list(20)
    for adm in admins:
        if not adm.get("email"):
            continue
        reason_line = f"<p>Powod podany przez pracownika: <i>{reason}</i></p>" if reason else ""
        html = f"""<html><body style="font-family:sans-serif;max-width:600px">
          <h2 style="color:#9B2C2C">Spor przypisania sprzetu</h2>
          <p>Pracownik <b>{confirmation['foreman_name']}</b> zgloszil, ze nie otrzymal przypisanego sprzetu:</p>
          <ul>
            <li><b>{confirmation['equipment_name']}</b> x{confirmation['quantity']}</li>
            <li>Data przypisania: {confirmation.get('assigned_at','?')}</li>
          </ul>
          {reason_line}
          <p>Zaloguj sie do panelu admina aby rozpatrzyc spor.</p>
        </body></html>"""
        await _send_assignment_email(
            to_email=adm["email"],
            subject=f"FeGrro: spor przypisania - {confirmation['foreman_name']}",
            html=html,
        )


async def _create_confirmation(*, equipment_id: str, equipment_name: str,
                                foreman_id: str, foreman_name: str,
                                quantity: int, assigned_by: str) -> dict:
    """Tworzy event 'pending_confirmation' z deadline 48h."""
    now = datetime.now()
    doc = {
        "id": str(uuid.uuid4()),
        "equipment_id": equipment_id,
        "equipment_name": equipment_name,
        "foreman_id": foreman_id,
        "foreman_name": foreman_name,
        "quantity": int(quantity),
        "assigned_at": now.isoformat(),
        "assigned_by": assigned_by,
        "deadline_at": (now + timedelta(hours=48)).isoformat(),
        "status": "pending_confirmation",
    }
    await db.equipment_confirmations.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ============= Equipment CRUD (admin) =============
@router.get("/equipment")
async def list_equipment(
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {}
    if category:
        # Treat missing field as 'electronics' for backward compatibility
        if category == "electronics":
            query = {"$or": [{"category": "electronics"}, {"category": {"$exists": False}}, {"category": None}]}
        else:
            query = {"category": category}
    items = await db.equipment.find(query, {"_id": 0}).sort("name", 1).to_list(1000)
    if not items:
        return []
    # Single aggregation: sum of assignments grouped by equipment_id (replaces N+1)
    eq_ids = [it["id"] for it in items]
    pipeline = [
        {"$match": {"equipment_id": {"$in": eq_ids}}},
        {"$group": {"_id": "$equipment_id", "total": {"$sum": "$quantity"}}},
    ]
    sums = {row["_id"]: row["total"] async for row in db.equipment_assignments.aggregate(pipeline)}
    result = []
    for item in items:
        total_assigned = sums.get(item["id"], 0)
        broken = item.get("broken_quantity", 0) or 0
        lost = item.get("lost_quantity", 0) or 0
        total = item.get("total_quantity", 0)
        # Return thumbnail in 'photo' field for list view (fallback to full photo
        # for items uploaded before thumbnail migration). Saves ~150-300 KB per item.
        photo_for_list = item.get("photo_thumb") or item.get("photo")
        item_out = {**item, "photo": photo_for_list}
        item_out.pop("photo_thumb", None)
        result.append({
            **item_out,
            "category": item.get("category") or "electronics",
            "broken_quantity": broken,
            "lost_quantity": lost,
            "assigned_quantity": total_assigned,
            "available_quantity": max(0, total - total_assigned - broken - lost)
        })
    return result


@router.post("/equipment")
async def create_equipment(payload: EquipmentCreate,
                            current_user: dict = Depends(get_current_admin)):
    if payload.total_quantity < 0:
        raise HTTPException(status_code=400, detail="Ilosc nie moze byc ujemna")
    eq_id = str(uuid.uuid4())
    photo_thumb = make_thumbnail(payload.photo) if payload.photo else None
    doc = {
        "id": eq_id,
        "name": payload.name.strip(),
        "brand": (payload.brand or "").strip() or None,
        "total_quantity": payload.total_quantity,
        "broken_quantity": 0,
        "lost_quantity": 0,
        "photo": payload.photo,
        "photo_thumb": photo_thumb,
        "status": "working",
        "category": payload.category or "electronics",
        "variants": [v.strip() for v in (payload.variants or []) if v and v.strip()],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    await db.equipment.insert_one(doc)
    doc.pop("_id", None)
    await _add_history(eq_id, "created", current_user["sub"],
                        await _get_user_name(current_user["sub"]),
                        {"total_quantity": payload.total_quantity, "name": payload.name})
    # Return thumb in 'photo' for list compatibility; clients can fetch full via GET /equipment/{id}
    doc_out = {**doc}
    doc_out["photo"] = photo_thumb or payload.photo
    doc_out.pop("photo_thumb", None)
    return {**doc_out, "assigned_quantity": 0, "lost_quantity": 0, "available_quantity": payload.total_quantity}


@router.put("/equipment/{equipment_id}")
async def update_equipment(equipment_id: str, payload: EquipmentUpdate,
                            current_user: dict = Depends(get_current_admin)):
    eq = await db.equipment.find_one({"id": equipment_id})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")

    update_doc = {"updated_at": datetime.now().isoformat()}
    if payload.name is not None:
        update_doc["name"] = payload.name.strip()
    if payload.brand is not None:
        update_doc["brand"] = payload.brand.strip() or None
    if payload.photo is not None:
        update_doc["photo"] = payload.photo
        update_doc["photo_thumb"] = make_thumbnail(payload.photo)
    if payload.status is not None:
        update_doc["status"] = payload.status
    if payload.category is not None:
        update_doc["category"] = payload.category
    if payload.variants is not None:
        # normalize: strip+lowercase preserved; drop empties
        cleaned = [v.strip() for v in payload.variants if v and v.strip()]
        update_doc["variants"] = cleaned

    new_total = payload.total_quantity if payload.total_quantity is not None else eq.get("total_quantity", 0)
    new_broken = payload.broken_quantity if payload.broken_quantity is not None else eq.get("broken_quantity", 0) or 0
    cur_lost = eq.get("lost_quantity", 0) or 0
    total_assigned = await _get_total_assigned(equipment_id)

    if payload.total_quantity is not None:
        if payload.total_quantity < 0:
            raise HTTPException(status_code=400, detail="Ilosc nie moze byc ujemna")
    if payload.broken_quantity is not None:
        if payload.broken_quantity < 0:
            raise HTTPException(status_code=400, detail="Ilosc zdana do naprawy nie moze byc ujemna")

    if total_assigned + new_broken + cur_lost > new_total:
        raise HTTPException(
            status_code=400,
            detail=f"Suma przypisanych ({total_assigned}), zdanych do naprawy ({new_broken}) i zaginionych ({cur_lost}) przekracza ilosc calkowita ({new_total})."
        )

    if payload.total_quantity is not None:
        update_doc["total_quantity"] = payload.total_quantity
    if payload.broken_quantity is not None:
        update_doc["broken_quantity"] = payload.broken_quantity

    await db.equipment.update_one({"id": equipment_id}, {"$set": update_doc})
    await _add_history(equipment_id, "updated", current_user["sub"],
                        await _get_user_name(current_user["sub"]), update_doc)
    eq2 = await db.equipment.find_one({"id": equipment_id}, {"_id": 0})
    total_assigned2 = await _get_total_assigned(equipment_id)
    broken2 = eq2.get("broken_quantity", 0) or 0
    lost2 = eq2.get("lost_quantity", 0) or 0
    # Return thumb in 'photo' for list compatibility
    photo_for_resp = eq2.get("photo_thumb") or eq2.get("photo")
    eq2_out = {**eq2, "photo": photo_for_resp}
    eq2_out.pop("photo_thumb", None)
    return {**eq2_out,
            "broken_quantity": broken2,
            "lost_quantity": lost2,
            "assigned_quantity": total_assigned2,
            "available_quantity": max(0, eq2["total_quantity"] - total_assigned2 - broken2 - lost2)}


@router.get("/equipment/single/{equipment_id}")
async def get_equipment_single(equipment_id: str,
                                current_user: dict = Depends(get_current_user)):
    """Returns a single equipment doc with the FULL photo (not thumb).
    Used by the admin edit modal which needs the high-res image.
    Path uses /single/ prefix to avoid clashing with future verb-like routes.
    """
    eq = await db.equipment.find_one({"id": equipment_id}, {"_id": 0})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")
    total_assigned = await _get_total_assigned(equipment_id)
    broken = eq.get("broken_quantity", 0) or 0
    lost = eq.get("lost_quantity", 0) or 0
    total = eq.get("total_quantity", 0)
    # Keep both fields available: photo (full) and photo_thumb
    return {**eq,
            "category": eq.get("category") or "electronics",
            "broken_quantity": broken,
            "lost_quantity": lost,
            "assigned_quantity": total_assigned,
            "available_quantity": max(0, total - total_assigned - broken - lost)}


@router.delete("/equipment/{equipment_id}")
async def delete_equipment(equipment_id: str,
                            current_user: dict = Depends(get_current_admin)):
    eq = await db.equipment.find_one({"id": equipment_id})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")
    await db.equipment.delete_one({"id": equipment_id})
    await db.equipment_assignments.delete_many({"equipment_id": equipment_id})
    await db.equipment_transfers.delete_many({"equipment_id": equipment_id})
    await _add_history(equipment_id, "deleted", current_user["sub"],
                        await _get_user_name(current_user["sub"]), {"name": eq.get("name")})
    return {"message": "Sprzet usuniety"}


# ============= Assignments (admin) =============
@router.get("/equipment/assignments/all")
async def list_all_assignments(current_user: dict = Depends(get_current_user)):
    """Returns matrix-friendly list of {equipment_id, foreman_id, quantity}."""
    items = await db.equipment_assignments.find({}, {"_id": 0}).to_list(5000)
    return items


@router.post("/equipment/assign")
async def set_assignment(payload: AssignmentSet,
                          equipment_id: str,
                          current_user: dict = Depends(get_current_admin_or_warehouse)):
    """Set the quantity assigned to a specific foreman for an equipment.
    quantity=0 removes the assignment.
    iter89: gdy delta > 0, tworzymy 'pending_confirmation' event dla pracownika z deadline 48h.
    """
    eq = await db.equipment.find_one({"id": equipment_id})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")
    foreman = await db.users.find_one({"id": payload.foreman_id, "role": "foreman"})
    if not foreman:
        raise HTTPException(status_code=404, detail="Brygadzista nie znaleziony")
    if payload.quantity < 0:
        raise HTTPException(status_code=400, detail="Ilosc nie moze byc ujemna")

    # iter89: poprzednia ilosc dla tego pracownika
    prev_assignment = await db.equipment_assignments.find_one(
        {"equipment_id": equipment_id, "foreman_id": payload.foreman_id},
        {"_id": 0, "quantity": 1},
    )
    prev_qty = int((prev_assignment or {}).get("quantity") or 0)
    delta = int(payload.quantity) - prev_qty

    # Compute total assigned excluding this foreman
    pipeline = [
        {"$match": {"equipment_id": equipment_id, "foreman_id": {"$ne": payload.foreman_id}}},
        {"$group": {"_id": None, "total": {"$sum": "$quantity"}}}
    ]
    others = await db.equipment_assignments.aggregate(pipeline).to_list(1)
    other_sum = others[0]["total"] if others else 0
    broken = eq.get("broken_quantity", 0) or 0
    lost = eq.get("lost_quantity", 0) or 0

    if other_sum + payload.quantity + broken + lost > eq["total_quantity"]:
        available = eq["total_quantity"] - other_sum - broken - lost
        raise HTTPException(
            status_code=400,
            detail=f"Brak wystarczajacej ilosci. Dostepne w magazynie: {max(0, available)} szt."
        )

    if payload.quantity == 0:
        await db.equipment_assignments.delete_one({
            "equipment_id": equipment_id, "foreman_id": payload.foreman_id
        })
    else:
        await db.equipment_assignments.update_one(
            {"equipment_id": equipment_id, "foreman_id": payload.foreman_id},
            {"$set": {
                "id": str(uuid.uuid4()),
                "equipment_id": equipment_id,
                "foreman_id": payload.foreman_id,
                "quantity": payload.quantity,
                "assigned_at": datetime.now().isoformat(),
                "assigned_by": current_user["sub"],
            }},
            upsert=True
        )

    await _add_history(
        equipment_id, "assigned", current_user["sub"],
        await _get_user_name(current_user["sub"]),
        {"foreman_id": payload.foreman_id, "foreman_name": foreman["full_name"],
         "quantity": payload.quantity}
    )
    # iter89: jezeli ilosc wzrosla, utworz confirmation event dla DELTY + powiadomienia
    if delta > 0:
        conf = await _create_confirmation(
            equipment_id=equipment_id,
            equipment_name=eq.get("name", "Sprzet"),
            foreman_id=payload.foreman_id,
            foreman_name=foreman["full_name"],
            quantity=delta,
            assigned_by=current_user["sub"],
        )
        await _notify_assignment_pending(
            equipment_id=equipment_id,
            equipment_name=eq.get("name", "Sprzet"),
            foreman_id=payload.foreman_id,
            foreman_name=foreman["full_name"],
            quantity=delta,
            confirmation_id=conf["id"],
        )
    return {"message": "Przypisanie zaktualizowane"}


# ============= Foreman view =============
@router.get("/equipment/my")
async def my_equipment(
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Equipment assigned to the current foreman."""
    foreman_id = current_user["sub"]
    assignments = await db.equipment_assignments.find(
        {"foreman_id": foreman_id}, {"_id": 0}
    ).to_list(1000)
    if not assignments:
        return []
    # Single batch fetch instead of N find_one calls
    eq_ids = [a["equipment_id"] for a in assignments]
    eq_docs = await db.equipment.find(
        {"id": {"$in": eq_ids}}, {"_id": 0}
    ).to_list(len(eq_ids))
    eq_map = {e["id"]: e for e in eq_docs}
    result = []
    for a in assignments:
        eq = eq_map.get(a["equipment_id"])
        if not eq:
            continue
        eq_cat = eq.get("category") or "electronics"
        if category and eq_cat != category:
            continue
        # Use thumb in 'photo' field for list rendering
        photo_for_list = eq.get("photo_thumb") or eq.get("photo")
        eq_out = {**eq, "photo": photo_for_list}
        eq_out.pop("photo_thumb", None)
        result.append({**eq_out, "category": eq_cat, "quantity": a["quantity"], "assigned_at": a.get("assigned_at")})
    return result


# ============= Transfers (foreman) =============
@router.post("/equipment/transfer")
async def request_transfer(payload: TransferCreate,
                            current_user: dict = Depends(get_current_user)):
    """A foreman requests to transfer equipment to another foreman.
    The receiving foreman must accept it for the assignment to actually move.
    """
    if current_user.get("role") != "foreman":
        raise HTTPException(status_code=403, detail="Tylko brygadzista moze przekazac sprzet")
    from_id = current_user["sub"]
    if from_id == payload.to_foreman_id:
        raise HTTPException(status_code=400, detail="Nie mozesz przekazac sprzetu samemu sobie")
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Ilosc musi byc dodatnia")

    eq = await db.equipment.find_one({"id": payload.equipment_id})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")

    to_user = await db.users.find_one({"id": payload.to_foreman_id, "role": "foreman"})
    if not to_user:
        raise HTTPException(status_code=404, detail="Brygadzista nie znaleziony")

    own = await db.equipment_assignments.find_one(
        {"equipment_id": payload.equipment_id, "foreman_id": from_id}
    )
    if not own or own["quantity"] < payload.quantity:
        raise HTTPException(status_code=400, detail="Nie posiadasz wystarczajacej ilosci")

    # Check there's no pending transfer of same equipment from this foreman exceeding amount
    pending = await db.equipment_transfers.find({
        "equipment_id": payload.equipment_id,
        "from_foreman_id": from_id,
        "status": "pending"
    }).to_list(100)
    pending_qty = sum(t.get("quantity", 0) for t in pending)
    if own["quantity"] - pending_qty < payload.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Masz juz oczekujace przekazania na {pending_qty} szt. Pozostalo: {own['quantity'] - pending_qty}"
        )

    transfer_id = str(uuid.uuid4())
    from_user = await db.users.find_one({"id": from_id}, {"_id": 0, "full_name": 1})
    transfer = {
        "id": transfer_id,
        "equipment_id": payload.equipment_id,
        "equipment_name": eq["name"],
        "from_foreman_id": from_id,
        "from_foreman_name": from_user["full_name"] if from_user else "?",
        "to_foreman_id": payload.to_foreman_id,
        "to_foreman_name": to_user["full_name"],
        "quantity": payload.quantity,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
    }
    await db.equipment_transfers.insert_one(transfer)
    transfer.pop("_id", None)
    await _add_history(
        payload.equipment_id, "transfer_requested", from_id,
        from_user["full_name"] if from_user else "?",
        {"to_foreman_name": to_user["full_name"], "quantity": payload.quantity,
         "transfer_id": transfer_id}
    )
    # Push: notify the receiving foreman
    try:
        from routes.push import send_push, send_push_to_admins
        eq = await db.equipment.find_one({"id": payload.equipment_id}, {"_id": 0, "name": 1})
        eq_name = (eq or {}).get("name", "Sprzet")
        await send_push(
            user_id=payload.to_foreman_id,
            title="Otrzymujesz sprzet",
            body=f"{from_user['full_name']}: {eq_name} x{payload.quantity}",
            url="/worker/dashboard",
            tag=f"transfer-{transfer_id}",
            require_interaction=True,
        )
        # Push do adminow: brygadzista przepisuje sprzet
        await send_push_to_admins(
            title="Przekazanie sprzetu",
            body=f"{from_user['full_name']} → {to_user['full_name']}: {eq_name} x{payload.quantity}",
            url="/admin/dashboard",
            tag=f"transfer-{transfer_id}",
        )
    except Exception as e:
        logger.warning(f"Push (transfer) failed: {e}")
    return transfer


@router.post("/equipment/transfer-from-warehouse")
async def transfer_from_warehouse(payload: TransferCreate,
                                   current_user: dict = Depends(get_current_admin_or_warehouse)):
    """Admin/magazynier tworzy 'przekazanie' sprzetu z magazynu do brygadzisty.
    Brygadzista musi zaakceptowac, dopiero wtedy stan sie zmieni.
    """
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Ilosc musi byc dodatnia")
    eq = await db.equipment.find_one({"id": payload.equipment_id})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")
    to_user = await db.users.find_one({"id": payload.to_foreman_id, "role": "foreman"})
    if not to_user:
        raise HTTPException(status_code=404, detail="Brygadzista nie znaleziony")

    # Sprawdz dostepnosc w magazynie
    agg = await db.equipment_assignments.aggregate([
        {"$match": {"equipment_id": payload.equipment_id}},
        {"$group": {"_id": None, "total": {"$sum": "$quantity"}}}
    ]).to_list(1)
    assigned = agg[0]["total"] if agg else 0
    broken = eq.get("broken_quantity", 0) or 0
    lost = eq.get("lost_quantity", 0) or 0
    # Tez odjac ilosci w pending_transfers z magazynu (zeby nie zarezerwowac 2x)
    pending = await db.equipment_transfers.find({
        "equipment_id": payload.equipment_id,
        "from_foreman_id": "warehouse",
        "status": "pending"
    }).to_list(100)
    pending_qty = sum(t.get("quantity", 0) for t in pending)
    available = eq["total_quantity"] - assigned - broken - lost - pending_qty
    if available < payload.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Brak ilosci w magazynie. Dostepne: {max(0, available)} szt."
        )

    transfer_id = str(uuid.uuid4())
    actor_name = await _get_user_name(current_user["sub"])
    transfer = {
        "id": transfer_id,
        "equipment_id": payload.equipment_id,
        "equipment_name": eq["name"],
        "from_foreman_id": "warehouse",
        "from_foreman_name": f"Magazyn ({actor_name})",
        "to_foreman_id": payload.to_foreman_id,
        "to_foreman_name": to_user["full_name"],
        "quantity": payload.quantity,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "created_by_admin": current_user["sub"],
    }
    await db.equipment_transfers.insert_one(transfer)
    transfer.pop("_id", None)
    await _add_history(
        payload.equipment_id, "transfer_from_warehouse_requested", current_user["sub"],
        actor_name,
        {"to_foreman_name": to_user["full_name"], "quantity": payload.quantity,
         "transfer_id": transfer_id}
    )
    try:
        from routes.push import send_push
        await send_push(
            user_id=payload.to_foreman_id,
            title="Sprzet z magazynu do akceptacji",
            body=f"{actor_name} przekazuje: {eq['name']} x{payload.quantity}",
            url="/foreman/equipment",
            tag=f"transfer-wh-{transfer_id}",
            require_interaction=True,
        )
    except Exception as e:
        logger.warning(f"Push (warehouse transfer) failed: {e}")
    return transfer


@router.post("/equipment/returns/{notification_id}/to-repair")
async def return_to_repair(notification_id: str,
                            current_user: dict = Depends(get_current_user)):
    """Admin/magazynier przekierowuje zwrot do naprawy: sprzet juz nie wraca do magazynu
    dostepnego, lecz do `broken_quantity` (oznacza ze idzie do serwisu)."""
    notif = await db.equipment_return_notifications.find_one({"id": notification_id})
    if not notif:
        raise HTTPException(status_code=404, detail="Zwrot nie znaleziony")
    if notif["status"] != "pending":
        raise HTTPException(status_code=400, detail="Zwrot juz rozpatrzony")
    is_admin = current_user.get("role") == "admin"
    is_keeper = current_user["sub"] == notif.get("warehouse_keeper_id")
    if not (is_admin or is_keeper):
        raise HTTPException(status_code=403, detail="Brak uprawnien")

    eq_id = notif["equipment_id"]
    qty = int(notif["quantity"])

    # Sprzet w /equipment/return juz zostal odjety od brygadzisty.
    # Zwiekszamy broken_quantity (idzie do naprawy zamiast magazynu dostepnego)
    await db.equipment.update_one(
        {"id": eq_id},
        {"$inc": {"broken_quantity": qty}}
    )

    actor_name = await _get_user_name(current_user["sub"])

    # iter91: Tworzymy automatyczny wpis w equipment_defects zeby admin mial przyciski
    # "Naprawione" / "Zlom" w panelu Zgloszone usterki.
    defect_doc = {
        "id": str(uuid.uuid4()),
        "equipment_id": eq_id,
        "equipment_name": notif["equipment_name"],
        "foreman_id": notif["from_foreman_id"],
        "foreman_name": notif["from_foreman_name"],
        "quantity": qty,
        "description": "Sprzet przekierowany do naprawy podczas odbioru zwrotu.",
        "photo": None,
        "status": "open",
        "source": "return_to_repair",
        "created_at": datetime.now().isoformat(),
    }
    await db.equipment_defects.insert_one(defect_doc)
    await db.equipment_return_notifications.update_one(
        {"id": notification_id},
        {"$set": {
            "status": "to_repair",
            "routed_by": current_user["sub"],
            "routed_by_name": actor_name,
            "routed_at": datetime.now().isoformat(),
        }}
    )
    await _add_history(
        eq_id, "return_to_repair", current_user["sub"], actor_name,
        {"quantity": qty, "from_foreman_name": notif["from_foreman_name"],
         "equipment_name": notif["equipment_name"]}
    )
    # Push do brygadzisty
    try:
        from routes.push import send_push
        await send_push(
            user_id=notif["from_foreman_id"],
            title="Zwrot skierowany do naprawy",
            body=f"{notif['equipment_name']} x{qty} - magazynier ocenil, ze wymaga naprawy",
            url="/foreman/equipment",
            tag=f"return-repair-{notification_id}",
        )
    except Exception as e:
        logger.warning(f"Push (to-repair) failed: {e}")

    return {"message": "Sprzet skierowany do naprawy", "quantity": qty, "equipment_name": notif["equipment_name"]}


@router.get("/equipment/transfers/pending")
async def my_pending_transfers(current_user: dict = Depends(get_current_user)):
    """Pending transfers awaiting current foreman's acceptance."""
    foreman_id = current_user["sub"]
    items = await db.equipment_transfers.find(
        {"to_foreman_id": foreman_id, "status": "pending"}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return items


@router.get("/equipment/transfers/all")
async def all_transfers(current_user: dict = Depends(get_current_admin_or_warehouse)):
    items = await db.equipment_transfers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.post("/equipment/transfers/{transfer_id}/accept")
async def accept_transfer(transfer_id: str,
                           current_user: dict = Depends(get_current_user)):
    transfer = await db.equipment_transfers.find_one({"id": transfer_id})
    if not transfer:
        raise HTTPException(status_code=404, detail="Przekazanie nie znalezione")
    if transfer["status"] != "pending":
        raise HTTPException(status_code=400, detail="Przekazanie juz zostalo rozpatrzone")
    if transfer["to_foreman_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="To nie jest Twoje przekazanie")

    eq_id = transfer["equipment_id"]
    qty = transfer["quantity"]
    from_warehouse = transfer["from_foreman_id"] == "warehouse"

    if not from_warehouse:
        # Decrement source assignment (od brygadzisty A)
        src = await db.equipment_assignments.find_one(
            {"equipment_id": eq_id, "foreman_id": transfer["from_foreman_id"]}
        )
        if not src or src["quantity"] < qty:
            raise HTTPException(status_code=400,
                                 detail="Brygadzista nie posiada juz wystarczajacej ilosci")
        new_src_qty = src["quantity"] - qty
        if new_src_qty == 0:
            await db.equipment_assignments.delete_one(
                {"equipment_id": eq_id, "foreman_id": transfer["from_foreman_id"]}
            )
        else:
            await db.equipment_assignments.update_one(
                {"equipment_id": eq_id, "foreman_id": transfer["from_foreman_id"]},
                {"$set": {"quantity": new_src_qty}}
            )
    else:
        # Z magazynu - sprawdz tylko czy jest dostepna ilosc w magazynie
        eq_doc = await db.equipment.find_one({"id": eq_id})
        if not eq_doc:
            raise HTTPException(status_code=404, detail="Sprzet nie istnieje")
        agg = await db.equipment_assignments.aggregate([
            {"$match": {"equipment_id": eq_id}},
            {"$group": {"_id": None, "total": {"$sum": "$quantity"}}}
        ]).to_list(1)
        assigned = agg[0]["total"] if agg else 0
        broken = eq_doc.get("broken_quantity", 0) or 0
        lost = eq_doc.get("lost_quantity", 0) or 0
        available = eq_doc["total_quantity"] - assigned - broken - lost
        if available < qty:
            raise HTTPException(status_code=400,
                                 detail=f"Brak ilosci w magazynie. Dostepne: {max(0, available)} szt.")

    # Increment destination assignment
    await db.equipment_assignments.update_one(
        {"equipment_id": eq_id, "foreman_id": transfer["to_foreman_id"]},
        {"$inc": {"quantity": qty},
         "$setOnInsert": {
             "id": str(uuid.uuid4()),
             "equipment_id": eq_id,
             "foreman_id": transfer["to_foreman_id"],
             "assigned_at": datetime.now().isoformat(),
             "assigned_by": transfer["from_foreman_id"]
         }},
        upsert=True
    )

    await db.equipment_transfers.update_one(
        {"id": transfer_id},
        {"$set": {"status": "accepted",
                  "responded_at": datetime.now().isoformat()}}
    )
    await _add_history(
        eq_id, "transfer_accepted", current_user["sub"],
        await _get_user_name(current_user["sub"]),
        {"from_foreman_name": transfer.get("from_foreman_name"),
         "to_foreman_name": transfer.get("to_foreman_name"),
         "quantity": qty, "transfer_id": transfer_id}
    )

    # Push: nadawca dostaje info ze przekazanie zaakceptowane + admini
    try:
        from routes.push import send_push, send_push_to_admins
        eq_doc = await db.equipment.find_one({"id": eq_id}, {"_id": 0, "name": 1})
        eq_name = (eq_doc or {}).get("name", "Sprzet")
        await send_push(
            user_id=transfer["from_foreman_id"],
            title="Przekazanie zaakceptowane",
            body=f"{transfer.get('to_foreman_name','?')}: {eq_name} x{qty}",
            url="/worker/dashboard",
            tag=f"transfer-acc-{transfer_id}",
        )
        await send_push_to_admins(
            title="Przekazanie zaakceptowane",
            body=f"{transfer.get('from_foreman_name','?')} → {transfer.get('to_foreman_name','?')}: {eq_name} x{qty}",
            url="/admin/dashboard",
            tag=f"transfer-acc-{transfer_id}",
        )
    except Exception as e:
        logger.warning(f"Push (transfer accept) failed: {e}")

    return {"message": "Przekazanie zaakceptowane"}


@router.post("/equipment/transfers/{transfer_id}/reject")
async def reject_transfer(transfer_id: str,
                           current_user: dict = Depends(get_current_user)):
    transfer = await db.equipment_transfers.find_one({"id": transfer_id})
    if not transfer:
        raise HTTPException(status_code=404, detail="Przekazanie nie znalezione")
    if transfer["status"] != "pending":
        raise HTTPException(status_code=400, detail="Przekazanie juz zostalo rozpatrzone")
    if transfer["to_foreman_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="To nie jest Twoje przekazanie")

    await db.equipment_transfers.update_one(
        {"id": transfer_id},
        {"$set": {"status": "rejected",
                  "responded_at": datetime.now().isoformat()}}
    )
    await _add_history(
        transfer["equipment_id"], "transfer_rejected", current_user["sub"],
        await _get_user_name(current_user["sub"]),
        {"from_foreman_name": transfer.get("from_foreman_name"),
         "quantity": transfer["quantity"], "transfer_id": transfer_id}
    )

    # Push: nadawca dostaje info ze przekazanie odrzucone
    try:
        from routes.push import send_push
        eq_doc = await db.equipment.find_one({"id": transfer["equipment_id"]}, {"_id": 0, "name": 1})
        eq_name = (eq_doc or {}).get("name", "Sprzet")
        await send_push(
            user_id=transfer["from_foreman_id"],
            title="Przekazanie odrzucone",
            body=f"{transfer.get('to_foreman_name','?')}: {eq_name} x{transfer['quantity']}",
            url="/worker/dashboard",
            tag=f"transfer-rej-{transfer_id}",
        )
    except Exception as e:
        logger.warning(f"Push (transfer reject) failed: {e}")

    return {"message": "Przekazanie odrzucone"}


# ============= Defect / return reporting (foreman) =============
@router.post("/equipment/defect")
async def report_defect(payload: DefectReport,
                          current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "foreman":
        raise HTTPException(status_code=403, detail="Tylko brygadzista moze zglosic usterke")
    eq = await db.equipment.find_one({"id": payload.equipment_id})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Ilosc musi byc dodatnia")

    foreman_id = current_user["sub"]
    own = await db.equipment_assignments.find_one(
        {"equipment_id": payload.equipment_id, "foreman_id": foreman_id}
    )
    if not own or own["quantity"] < payload.quantity:
        raise HTTPException(status_code=400, detail="Nie posiadasz wystarczajacej ilosci")

    # 1. Decrement foreman's assignment by q (item moves from foreman to "in repair")
    new_qty = own["quantity"] - payload.quantity
    if new_qty == 0:
        await db.equipment_assignments.delete_one(
            {"equipment_id": payload.equipment_id, "foreman_id": foreman_id}
        )
    else:
        await db.equipment_assignments.update_one(
            {"equipment_id": payload.equipment_id, "foreman_id": foreman_id},
            {"$set": {"quantity": new_qty}}
        )

    # 2. Increment equipment.broken_quantity by q (visible in "Zdane do magazynu do naprawy" column)
    await db.equipment.update_one(
        {"id": payload.equipment_id},
        {"$inc": {"broken_quantity": payload.quantity},
         "$set": {"updated_at": datetime.now().isoformat()}}
    )

    actor_name = await _get_user_name(foreman_id)
    doc = {
        "id": str(uuid.uuid4()),
        "equipment_id": payload.equipment_id,
        "equipment_name": eq["name"],
        "foreman_id": foreman_id,
        "foreman_name": actor_name,
        "quantity": payload.quantity,
        "description": payload.description,
        "photo": payload.photo,
        "status": "open",
        "created_at": datetime.now().isoformat(),
    }
    await db.equipment_defects.insert_one(doc)
    doc.pop("_id", None)
    await _add_history(payload.equipment_id, "defect_reported", foreman_id, actor_name,
                        {"quantity": payload.quantity, "description": payload.description})

    # Push do adminow: brygadzista zglosil usterke (de facto zwrot do naprawy)
    try:
        from routes.push import send_push_to_admins
        await send_push_to_admins(
            title="Zgloszono usterke sprzetu",
            body=f"{actor_name}: {eq['name']} x{payload.quantity}",
            url="/admin/dashboard",
            tag=f"defect-{doc['id']}",
        )
    except Exception as e:
        logger.warning(f"Push (defect) failed: {e}")

    return doc


@router.get("/equipment/defects")
async def list_defects(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") == "admin":
        items = await db.equipment_defects.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    else:
        items = await db.equipment_defects.find(
            {"foreman_id": current_user["sub"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(500)
    return items


class ResolveDefect(BaseModel):
    disposition: str  # 'repaired' | 'scrapped'
    destination: Optional[str] = None  # 'warehouse' | 'foreman' (only when disposition='repaired')
    foreman_id: Optional[str] = None  # required when destination='foreman'


@router.post("/equipment/defects/{defect_id}/resolve")
async def resolve_defect(defect_id: str,
                          payload: ResolveDefect,
                          current_user: dict = Depends(get_current_admin)):
    """Admin marks a defect as repaired (and chooses destination) or scrapped."""
    defect = await db.equipment_defects.find_one({"id": defect_id})
    if not defect:
        raise HTTPException(status_code=404, detail="Usterka nie znaleziona")
    if defect.get("status") in ("resolved", "scrapped"):
        raise HTTPException(status_code=400, detail="Usterka juz rozpatrzona")

    qty = int(defect.get("quantity") or 0)
    eq_id = defect["equipment_id"]
    eq = await db.equipment.find_one({"id": eq_id})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")
    cur_broken = int(eq.get("broken_quantity") or 0)

    if payload.disposition == "scrapped":
        # Remove from inventory: broken -= qty, total -= qty
        new_broken = max(0, cur_broken - qty)
        new_total = max(0, int(eq.get("total_quantity") or 0) - qty)
        await db.equipment.update_one(
            {"id": eq_id},
            {"$set": {"broken_quantity": new_broken, "total_quantity": new_total,
                       "updated_at": datetime.now().isoformat()}}
        )
        actor_name = await _get_user_name(current_user["sub"])
        await db.equipment_defects.update_one(
            {"id": defect_id},
            {"$set": {
                "status": "scrapped",
                "resolved_by": current_user["sub"],
                "resolved_by_name": actor_name,
                "resolved_at": datetime.now().isoformat(),
                "disposition": "scrapped",
            }}
        )
        await _add_history(eq_id, "defect_scrapped", current_user["sub"], actor_name,
                            {"quantity": qty, "equipment_name": defect.get("equipment_name")})
        return {"message": "Sprzet przeniesiony na zlom"}

    if payload.disposition != "repaired":
        raise HTTPException(status_code=400, detail="Nieznana dyspozycja")

    # repaired: decrement broken_quantity by qty
    new_broken = max(0, cur_broken - qty)
    await db.equipment.update_one(
        {"id": eq_id},
        {"$set": {"broken_quantity": new_broken,
                   "updated_at": datetime.now().isoformat()}}
    )

    target_foreman_name = None
    if payload.destination == "foreman":
        if not payload.foreman_id:
            raise HTTPException(status_code=400, detail="Wybierz brygadziste")
        target = await db.users.find_one({"id": payload.foreman_id, "role": "foreman"})
        if not target:
            raise HTTPException(status_code=404, detail="Brygadzista nie znaleziony")
        target_foreman_name = target["full_name"]
        await db.equipment_assignments.update_one(
            {"equipment_id": eq_id, "foreman_id": payload.foreman_id},
            {"$inc": {"quantity": qty},
             "$setOnInsert": {
                 "id": str(uuid.uuid4()),
                 "equipment_id": eq_id,
                 "foreman_id": payload.foreman_id,
                 "assigned_at": datetime.now().isoformat(),
                 "assigned_by": current_user["sub"],
             }},
            upsert=True
        )
    elif payload.destination not in (None, "warehouse"):
        raise HTTPException(status_code=400, detail="Nieznane miejsce przekazania")

    actor_name = await _get_user_name(current_user["sub"])
    await db.equipment_defects.update_one(
        {"id": defect_id},
        {"$set": {
            "status": "resolved",
            "resolved_by": current_user["sub"],
            "resolved_by_name": actor_name,
            "resolved_at": datetime.now().isoformat(),
            "disposition": "repaired",
            "destination": payload.destination or "warehouse",
            "destination_foreman_id": payload.foreman_id,
            "destination_foreman_name": target_foreman_name,
        }}
    )
    await _add_history(eq_id, "defect_resolved", current_user["sub"], actor_name,
                        {"quantity": qty, "equipment_name": defect.get("equipment_name"),
                         "destination": payload.destination or "warehouse",
                         "foreman_name": target_foreman_name})
    return {"message": "Usterka oznaczona jako naprawiona"}


@router.get("/equipment/scrapped")
async def list_scrapped(category: Optional[str] = None,
                          current_user: dict = Depends(get_current_admin)):
    """Returns defects with status='scrapped' optionally filtered by equipment category."""
    defects = await db.equipment_defects.find(
        {"status": "scrapped"}, {"_id": 0}
    ).sort("resolved_at", -1).to_list(500)
    if category:
        result = []
        for d in defects:
            eq = await db.equipment.find_one(
                {"id": d["equipment_id"]}, {"_id": 0, "category": 1}
            )
            eq_cat = (eq or {}).get("category") or "electronics"
            if eq_cat == category:
                result.append(d)
        return result
    return defects


@router.delete("/equipment/defects/{defect_id}")
async def delete_defect(defect_id: str,
                         current_user: dict = Depends(get_current_admin)):
    defect = await db.equipment_defects.find_one({"id": defect_id})
    if not defect:
        raise HTTPException(status_code=404, detail="Usterka nie znaleziona")
    await db.equipment_defects.delete_one({"id": defect_id})
    return {"message": "Usterka usunieta"}


# ============= History =============
@router.get("/equipment/history")
async def get_history(equipment_id: Optional[str] = None,
                       current_user: dict = Depends(get_current_user)):
    """Admin sees all history. Foreman sees only history involving themselves."""
    query = {}
    if equipment_id:
        query["equipment_id"] = equipment_id

    if current_user.get("role") != "admin":
        # Foreman: only entries where they are the actor (created/transferred/etc.)
        query["actor_id"] = current_user["sub"]

    items = await db.equipment_history.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


# ============= Return to warehouse (foreman) =============
@router.post("/equipment/return")
async def return_to_warehouse(payload: ReturnToWarehouse,
                                current_user: dict = Depends(get_current_user)):
    """Foreman returns equipment back to warehouse (decreases their assignment)."""
    if current_user.get("role") != "foreman":
        raise HTTPException(status_code=403, detail="Tylko brygadzista moze zwrocic sprzet")
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Ilosc musi byc dodatnia")

    foreman_id = current_user["sub"]
    eq = await db.equipment.find_one({"id": payload.equipment_id})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")

    own = await db.equipment_assignments.find_one(
        {"equipment_id": payload.equipment_id, "foreman_id": foreman_id}
    )
    if not own or own["quantity"] < payload.quantity:
        raise HTTPException(status_code=400, detail="Nie posiadasz wystarczajacej ilosci")

    new_qty = own["quantity"] - payload.quantity
    if new_qty == 0:
        await db.equipment_assignments.delete_one(
            {"equipment_id": payload.equipment_id, "foreman_id": foreman_id}
        )
    else:
        await db.equipment_assignments.update_one(
            {"equipment_id": payload.equipment_id, "foreman_id": foreman_id},
            {"$set": {"quantity": new_qty}}
        )

    actor_name = await _get_user_name(foreman_id)
    eq_name = eq["name"]
    # Create a return notification awaiting acknowledgment
    keeper_setting = await db.app_settings.find_one({"key": "warehouse_keeper"})
    keeper_id = (keeper_setting or {}).get("foreman_id")

    # DEDUPE: jezeli ten sam foreman zwraca ten sam sprzet w ciagu 30s i poprzedni notif jest pending,
    # zwiekszamy quantity zamiast tworzyc duplikat (chroni przed wielokrotnym klikiem)
    now = datetime.now()
    thirty_sec_ago = (now - timedelta(seconds=30)).isoformat()
    existing_pending = await db.equipment_return_notifications.find_one({
        "equipment_id": payload.equipment_id,
        "from_foreman_id": foreman_id,
        "status": "pending",
        "created_at": {"$gte": thirty_sec_ago},
    }, sort=[("created_at", -1)])

    if existing_pending:
        new_qty = int(existing_pending.get("quantity", 0)) + int(payload.quantity)
        await db.equipment_return_notifications.update_one(
            {"id": existing_pending["id"]},
            {"$set": {"quantity": new_qty, "updated_at": now.isoformat()}}
        )
        notif = {**existing_pending, "quantity": new_qty}
        notif.pop("_id", None)
        deduped = True
    else:
        notif = {
            "id": str(uuid.uuid4()),
            "equipment_id": payload.equipment_id,
            "equipment_name": eq_name,
            "from_foreman_id": foreman_id,
            "from_foreman_name": actor_name,
            "quantity": payload.quantity,
            "warehouse_keeper_id": keeper_id,
            "status": "pending",
            "acknowledged_by": None,
            "acknowledged_at": None,
            "created_at": now.isoformat(),
        }
        await db.equipment_return_notifications.insert_one(notif)
        notif.pop("_id", None)
        deduped = False

    await _add_history(
        payload.equipment_id, "returned_to_warehouse", foreman_id, actor_name,
        {"quantity": payload.quantity, "equipment_name": eq_name}
    )

    # Push do adminow + magazyniera: ktos zwrocil sprzet (pomijamy przy deduplicate by nie spamowac)
    if not deduped:
        try:
            from routes.push import send_push_to_admins, send_push
            await send_push_to_admins(
                title="Zwrocono sprzet do magazynu",
                body=f"{actor_name}: {eq_name} x{payload.quantity}",
                url="/admin/dashboard",
                tag=f"return-{notif['id']}",
            )
            if keeper_id and keeper_id != foreman_id:
                await send_push(
                    user_id=keeper_id,
                    title="Zwrocono sprzet do magazynu",
                    body=f"{actor_name}: {eq_name} x{payload.quantity}",
                    url="/worker/dashboard",
                    tag=f"return-{notif['id']}",
                )
        except Exception as e:
            logger.warning(f"Push (return) failed: {e}")

    return {"message": "Sprzet zwrocony do magazynu", "quantity_returned": payload.quantity,
            "notification_id": notif["id"], "deduped": deduped}


# ============= My history (foreman) =============
@router.get("/equipment/my-history")
async def my_history(current_user: dict = Depends(get_current_user)):
    """Foreman's transfer history: outgoing + incoming + returns + defects (their own only)."""
    foreman_id = current_user["sub"]
    foreman_name = await _get_user_name(foreman_id)
    # Find transfers where foreman is sender or receiver
    transfers = await db.equipment_transfers.find(
        {"$or": [{"from_foreman_id": foreman_id}, {"to_foreman_id": foreman_id}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    # Find returns and defects from history
    extra = await db.equipment_history.find(
        {"actor_id": foreman_id,
         "action": {"$in": ["returned_to_warehouse", "defect_reported"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"transfers": transfers, "events": extra, "foreman_name": foreman_name}




# ============= Warehouse keeper settings (admin) =============
@router.get("/settings/warehouse-keeper")
async def get_warehouse_keeper(current_user: dict = Depends(get_current_user)):
    s = await db.app_settings.find_one({"key": "warehouse_keeper"}, {"_id": 0})
    keeper_id = (s or {}).get("foreman_id")
    keeper_name = None
    if keeper_id:
        u = await db.users.find_one({"id": keeper_id}, {"_id": 0, "full_name": 1})
        keeper_name = u["full_name"] if u else None
    return {"foreman_id": keeper_id, "foreman_name": keeper_name}


@router.put("/settings/warehouse-keeper")
async def set_warehouse_keeper(payload: WarehouseKeeperSet,
                                 current_user: dict = Depends(get_current_admin)):
    if payload.foreman_id:
        u = await db.users.find_one({"id": payload.foreman_id, "role": "foreman"})
        if not u:
            raise HTTPException(status_code=404, detail="Brygadzista nie znaleziony")
    await db.app_settings.update_one(
        {"key": "warehouse_keeper"},
        {"$set": {"key": "warehouse_keeper", "foreman_id": payload.foreman_id,
                  "updated_at": datetime.now().isoformat()}},
        upsert=True
    )
    return {"message": "Zaktualizowano magazyniera", "foreman_id": payload.foreman_id}


# ============= Pending returns (admin + warehouse keeper) =============
@router.get("/equipment/returns/pending")
async def list_pending_returns(current_user: dict = Depends(get_current_user)):
    """Admin sees all pending returns. Foreman sees only those assigned to them as warehouse keeper."""
    if current_user.get("role") == "admin":
        items = await db.equipment_return_notifications.find(
            {"status": "pending"}, {"_id": 0}
        ).sort("created_at", -1).to_list(500)
    else:
        items = await db.equipment_return_notifications.find(
            {"status": "pending", "warehouse_keeper_id": current_user["sub"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(500)
    return items


@router.post("/equipment/returns/{notification_id}/acknowledge")
async def acknowledge_return(notification_id: str,
                              current_user: dict = Depends(get_current_user)):
    notif = await db.equipment_return_notifications.find_one({"id": notification_id})
    if not notif:
        raise HTTPException(status_code=404, detail="Zwrot nie znaleziony")
    if notif["status"] != "pending":
        raise HTTPException(status_code=400, detail="Zwrot juz potwierdzony")

    # Allow admin OR the assigned warehouse keeper
    is_admin = current_user.get("role") == "admin"
    is_keeper = current_user["sub"] == notif.get("warehouse_keeper_id")
    if not (is_admin or is_keeper):
        raise HTTPException(status_code=403, detail="Nie masz uprawnien do potwierdzenia")

    actor_name = await _get_user_name(current_user["sub"])
    await db.equipment_return_notifications.update_one(
        {"id": notification_id},
        {"$set": {
            "status": "acknowledged",
            "acknowledged_by": current_user["sub"],
            "acknowledged_by_name": actor_name,
            "acknowledged_at": datetime.now().isoformat(),
        }}
    )
    await _add_history(
        notif["equipment_id"], "return_acknowledged", current_user["sub"], actor_name,
        {"quantity": notif["quantity"], "from_foreman_name": notif["from_foreman_name"],
         "equipment_name": notif["equipment_name"]}
    )
    return {"message": "Zwrot potwierdzony"}


@router.post("/equipment/returns/{notification_id}/reject")
async def reject_return(notification_id: str,
                        current_user: dict = Depends(get_current_user)):
    """Odrzucenie zwrotu - sprzet wraca z magazynu do brygadzisty.
    Akcja przeznaczona dla admina lub magazyniera (np. uszkodzony sprzet, brak miejsca,
    nieprawidlowy zwrot)."""
    notif = await db.equipment_return_notifications.find_one({"id": notification_id})
    if not notif:
        raise HTTPException(status_code=404, detail="Zwrot nie znaleziony")
    if notif["status"] != "pending":
        raise HTTPException(status_code=400, detail="Zwrot juz rozpatrzony")

    is_admin = current_user.get("role") == "admin"
    is_keeper = current_user["sub"] == notif.get("warehouse_keeper_id")
    if not (is_admin or is_keeper):
        raise HTTPException(status_code=403, detail="Nie masz uprawnien do odrzucenia")

    # COFNIJ stan: dodaj sprzet z powrotem brygadziscie
    foreman_id = notif["from_foreman_id"]
    eq_id = notif["equipment_id"]
    qty = int(notif["quantity"])
    existing_assignment = await db.equipment_assignments.find_one(
        {"equipment_id": eq_id, "foreman_id": foreman_id}
    )
    if existing_assignment:
        await db.equipment_assignments.update_one(
            {"equipment_id": eq_id, "foreman_id": foreman_id},
            {"$inc": {"quantity": qty}}
        )
    else:
        await db.equipment_assignments.insert_one({
            "id": str(uuid.uuid4()),
            "equipment_id": eq_id,
            "foreman_id": foreman_id,
            "quantity": qty,
            "created_at": datetime.now().isoformat(),
        })

    actor_name = await _get_user_name(current_user["sub"])
    await db.equipment_return_notifications.update_one(
        {"id": notification_id},
        {"$set": {
            "status": "rejected",
            "rejected_by": current_user["sub"],
            "rejected_by_name": actor_name,
            "rejected_at": datetime.now().isoformat(),
        }}
    )
    await _add_history(
        eq_id, "return_rejected", current_user["sub"], actor_name,
        {"quantity": qty, "from_foreman_name": notif["from_foreman_name"],
         "equipment_name": notif["equipment_name"]}
    )

    # Push do brygadzisty: zwrot odrzucony, sprzet wrocil
    try:
        from routes.push import send_push
        await send_push(
            user_id=foreman_id,
            title="Zwrot ODRZUCONY",
            body=f"{notif['equipment_name']} x{qty} wrocil do Ciebie. Powod: nie zostal przyjety przez magazyn.",
            url="/foreman/equipment",
            tag=f"return-rejected-{notification_id}",
        )
    except Exception as e:
        logger.warning(f"Push (return rejected) failed: {e}")

    return {"message": "Zwrot odrzucony, sprzet wrocil do brygadzisty",
            "returned_to": notif["from_foreman_name"],
            "quantity": qty}


# ============= Inventory checks =============
class InventoryStart(BaseModel):
    category: str  # electronics | accessories | formwork


@router.post("/equipment/inventory/start")
async def start_inventory(payload: InventoryStart,
                           current_user: dict = Depends(get_current_admin)):
    """Admin starts an inventory check for one category. All foremen who have
    equipment in this category must confirm before they can edit hours."""
    if payload.category not in ("electronics", "accessories", "formwork"):
        raise HTTPException(status_code=400, detail="Nieprawidlowa kategoria")

    # Close any existing active check for this category
    await db.inventory_checks.update_many(
        {"category": payload.category, "status": "active"},
        {"$set": {"status": "finished", "finished_at": datetime.now().isoformat()}},
    )

    # Find foremen who have at least one piece in this category.
    # equipment_assignments is a separate collection; join with equipment to filter by category.
    cat_filter = (
        {"$or": [{"category": "electronics"}, {"category": {"$exists": False}}, {"category": None}]}
        if payload.category == "electronics"
        else {"category": payload.category}
    )
    eq_in_cat = await db.equipment.find(cat_filter, {"_id": 0, "id": 1}).to_list(5000)
    eq_ids = [e["id"] for e in eq_in_cat]
    foremen_ids = []
    if eq_ids:
        pipeline = [
            {"$match": {"equipment_id": {"$in": eq_ids}, "quantity": {"$gt": 0}}},
            {"$group": {"_id": "$foreman_id"}},
        ]
        async for row in db.equipment_assignments.aggregate(pipeline):
            if row["_id"]:
                foremen_ids.append(row["_id"])

    check = {
        "id": str(uuid.uuid4()),
        "category": payload.category,
        "started_at": datetime.now().isoformat(),
        "started_by": current_user["sub"],
        "status": "active",
        "finished_at": None,
        "required_foremen": foremen_ids,
        "confirmed_foremen": [],
    }
    await db.inventory_checks.insert_one(check)

    # In-app notification per foreman
    cat_label = {"electronics": "elektronarzedzi", "accessories": "akcesoriow", "formwork": "szalunkow"}[payload.category]
    for fid in foremen_ids:
        try:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "type": "inventory_required",
                "title": "Wymagana inwentaryzacja",
                "message": f"Wykonaj inwentaryzacje {cat_label} - potwierdz posiadanie sprzetu",
                "foreman_id": fid,
                "check_id": check["id"],
                "category": payload.category,
                "status": "unread",
                "created_at": datetime.now().isoformat(),
            })
        except Exception:
            pass

    check.pop("_id", None)
    return check


@router.get("/equipment/inventory/list")
async def list_inventory(current_user: dict = Depends(get_current_admin)):
    """List all inventory checks for admin overview."""
    items = await db.inventory_checks.find({}, {"_id": 0}).sort("started_at", -1).to_list(200)
    return items


@router.post("/equipment/inventory/{check_id}/finish")
async def finish_inventory(check_id: str,
                            current_user: dict = Depends(get_current_admin)):
    """Admin manually finishes an inventory check (closes it for all foremen)."""
    result = await db.inventory_checks.update_one(
        {"id": check_id, "status": "active"},
        {"$set": {"status": "finished", "finished_at": datetime.now().isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Aktywna inwentaryzacja nie znaleziona")
    return {"message": "Zakonczono"}


@router.get("/equipment/inventory/active-for-me")
async def my_active_inventory(current_user: dict = Depends(get_current_user)):
    """Foreman: returns active inventory checks where he must confirm.
    Returns empty list if foreman has nothing to confirm."""
    if current_user.get("role") != "foreman":
        return []
    foreman_id = current_user["sub"]
    checks = await db.inventory_checks.find(
        {
            "status": "active",
            "required_foremen": foreman_id,
            "confirmed_foremen": {"$ne": foreman_id},
        },
        {"_id": 0},
    ).sort("started_at", -1).to_list(20)
    # Attach foreman's equipment for each check
    for c in checks:
        cat = c["category"]
        cat_filter = (
            {"$or": [{"category": "electronics"}, {"category": {"$exists": False}}, {"category": None}]}
            if cat == "electronics"
            else {"category": cat}
        )
        # Find assignment rows for this foreman
        my_assigns = await db.equipment_assignments.find(
            {"foreman_id": foreman_id, "quantity": {"$gt": 0}},
            {"_id": 0, "equipment_id": 1, "quantity": 1},
        ).to_list(1000)
        eq_qty_map = {a["equipment_id"]: a["quantity"] for a in my_assigns}
        if not eq_qty_map:
            c["equipment"] = []
            continue
        eq_items = await db.equipment.find(
            {"$and": [cat_filter, {"id": {"$in": list(eq_qty_map.keys())}}]},
            {"_id": 0, "id": 1, "name": 1, "brand": 1, "photo": 1},
        ).sort("name", 1).to_list(500)
        c["equipment"] = [
            {**eq, "assigned_quantity": eq_qty_map.get(eq["id"], 0)}
            for eq in eq_items
        ]
    return checks


class ConfirmInventoryPayload(BaseModel):
    confirmed_equipment_ids: Optional[List[str]] = None  # for audit


class ShortageReport(BaseModel):
    equipment_id: str
    reported_quantity: int  # what foreman actually has (may be 0)
    description: Optional[str] = None
    photo: Optional[str] = None  # base64


@router.post("/equipment/inventory/{check_id}/report-shortage")
async def report_shortage(check_id: str,
                           payload: ShortageReport,
                           current_user: dict = Depends(get_current_user)):
    """Foreman reports a discrepancy: 'I have less / none' for a specific equipment.
    Stored separately from confirmation; admin can review and decide to adjust assignment.
    """
    if current_user.get("role") != "foreman":
        raise HTTPException(status_code=403, detail="Tylko brygadzista")
    if payload.reported_quantity < 0:
        raise HTTPException(status_code=400, detail="Ilosc nie moze byc ujemna")

    foreman_id = current_user["sub"]
    check = await db.inventory_checks.find_one({"id": check_id, "status": "active"}, {"_id": 0})
    if not check:
        raise HTTPException(status_code=404, detail="Aktywna inwentaryzacja nie znaleziona")
    if foreman_id not in check.get("required_foremen", []):
        raise HTTPException(status_code=400, detail="Nie jestes wymagany w tej inwentaryzacji")

    eq = await db.equipment.find_one({"id": payload.equipment_id}, {"_id": 0, "name": 1, "brand": 1})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")

    own = await db.equipment_assignments.find_one(
        {"equipment_id": payload.equipment_id, "foreman_id": foreman_id},
        {"_id": 0, "quantity": 1},
    )
    expected = (own or {}).get("quantity", 0)
    if payload.reported_quantity > expected:
        raise HTTPException(status_code=400, detail="Zglaszana ilosc nie moze byc wieksza niz przypisana")

    foreman_name = await _get_user_name(foreman_id)
    # Idempotency: replace prior open shortage from same foreman+check+equipment
    # so spam-clicking 'Brak' doesn't create duplicates.
    existing = await db.inventory_shortages.find_one({
        "check_id": check_id,
        "foreman_id": foreman_id,
        "equipment_id": payload.equipment_id,
        "status": "open",
    }, {"_id": 0, "id": 1})
    shortage_id = existing["id"] if existing else str(uuid.uuid4())
    doc = {
        "id": shortage_id,
        "check_id": check_id,
        "category": check.get("category"),
        "equipment_id": payload.equipment_id,
        "equipment_name": eq.get("name"),
        "equipment_brand": eq.get("brand"),
        "foreman_id": foreman_id,
        "foreman_name": foreman_name,
        "expected_quantity": expected,
        "reported_quantity": payload.reported_quantity,
        "missing_quantity": max(0, expected - payload.reported_quantity),
        "description": payload.description,
        "photo": payload.photo,
        "status": "open",  # open | resolved
        "created_at": datetime.now().isoformat(),
    }
    if existing:
        await db.inventory_shortages.update_one(
            {"id": shortage_id}, {"$set": doc}
        )
    else:
        await db.inventory_shortages.insert_one(doc)
    doc.pop("_id", None)

    # Notify admin
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "type": "inventory_shortage",
            "title": "Zgloszono brak sprzetu",
            "message": f"{foreman_name}: {eq.get('name')} - {payload.reported_quantity}/{expected} szt.",
            "shortage_id": shortage_id,
            "check_id": check_id,
            "status": "unread",
            "created_at": datetime.now().isoformat(),
        })
    except Exception as e:
        # log but don't fail the user-facing call
        print(f"Notification insert failed: {e}")

    await _add_history(payload.equipment_id, "shortage_reported", foreman_id, foreman_name,
                       {"expected": expected, "reported": payload.reported_quantity,
                        "description": payload.description, "check_id": check_id})
    return doc


@router.get("/equipment/inventory/shortages")
async def list_shortages(check_id: Optional[str] = None,
                          status: Optional[str] = None,
                          current_user: dict = Depends(get_current_admin)):
    """Admin: list discrepancies. Filterable by check_id and status (open/resolved)."""
    query = {}
    if check_id:
        query["check_id"] = check_id
    if status:
        query["status"] = status
    items = await db.inventory_shortages.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.post("/equipment/inventory/shortages/{shortage_id}/resolve")
async def resolve_shortage(shortage_id: str,
                            current_user: dict = Depends(get_current_admin)):
    """Mark a shortage as reviewed/resolved by admin (no stock changes - 'found' case)."""
    actor_name = await _get_user_name(current_user["sub"])
    sh = await db.inventory_shortages.find_one({"id": shortage_id}, {"_id": 0})
    if not sh:
        raise HTTPException(status_code=404, detail="Zgloszenie nie znalezione")
    if sh.get("status") != "open":
        raise HTTPException(status_code=400, detail="Zgloszenie juz rozpatrzone")
    await db.inventory_shortages.update_one(
        {"id": shortage_id},
        {"$set": {"status": "resolved",
                  "resolution": "found",
                  "resolved_by": current_user["sub"],
                  "resolved_by_name": actor_name,
                  "resolved_at": datetime.now().isoformat()}},
    )
    return {"message": "Zgloszenie rozpatrzone"}


@router.post("/equipment/inventory/shortages/{shortage_id}/mark-lost")
async def mark_shortage_lost(shortage_id: str,
                              current_user: dict = Depends(get_current_admin)):
    """Mark a shortage as lost: deduct missing qty from foreman's assignment
    and increment equipment.lost_quantity. Closes the shortage with resolution='lost'.
    """
    sh = await db.inventory_shortages.find_one({"id": shortage_id}, {"_id": 0})
    if not sh:
        raise HTTPException(status_code=404, detail="Zgloszenie nie znalezione")
    if sh.get("status") != "open":
        raise HTTPException(status_code=400, detail="Zgloszenie juz rozpatrzone")

    equipment_id = sh["equipment_id"]
    foreman_id = sh["foreman_id"]
    missing = int(sh.get("missing_quantity") or 0)
    if missing <= 0:
        raise HTTPException(status_code=400, detail="Brak ilosci do oznaczenia jako zaginione")

    # Decrement foreman's assignment (delete if reaches 0)
    own = await db.equipment_assignments.find_one(
        {"equipment_id": equipment_id, "foreman_id": foreman_id},
        {"_id": 0, "quantity": 1},
    )
    cur_qty = int((own or {}).get("quantity") or 0)
    new_qty = max(0, cur_qty - missing)
    if new_qty == 0:
        await db.equipment_assignments.delete_one(
            {"equipment_id": equipment_id, "foreman_id": foreman_id}
        )
    else:
        await db.equipment_assignments.update_one(
            {"equipment_id": equipment_id, "foreman_id": foreman_id},
            {"$set": {"quantity": new_qty,
                      "assigned_at": datetime.now().isoformat(),
                      "assigned_by": current_user["sub"]}},
        )

    # Increment lost_quantity on equipment
    await db.equipment.update_one(
        {"id": equipment_id},
        {"$inc": {"lost_quantity": missing},
         "$set": {"updated_at": datetime.now().isoformat()}},
    )

    actor_name = await _get_user_name(current_user["sub"])
    await db.inventory_shortages.update_one(
        {"id": shortage_id},
        {"$set": {"status": "resolved",
                  "resolution": "lost",
                  "lost_quantity": missing,
                  "resolved_by": current_user["sub"],
                  "resolved_by_name": actor_name,
                  "resolved_at": datetime.now().isoformat()}},
    )

    await _add_history(equipment_id, "marked_lost", current_user["sub"], actor_name,
                       {"foreman_id": foreman_id,
                        "foreman_name": sh.get("foreman_name"),
                        "quantity": missing,
                        "shortage_id": shortage_id,
                        "check_id": sh.get("check_id")})

    # Notify foreman that admin deducted lost items
    try:
        from routes.push import send_push
        await send_push(
            user_id=foreman_id,
            title="Oznaczono jako zaginione",
            body=f"{sh.get('equipment_name','Sprzet')} - {missing} szt. odjete z Twojego stanu",
            url="/worker/dashboard",
            tag=f"lost-{equipment_id}-{shortage_id}",
        )
    except Exception:
        pass

    return {"message": "Oznaczono jako zaginione",
            "missing_quantity": missing,
            "new_assigned_quantity": new_qty}


@router.post("/equipment/inventory/{check_id}/confirm")
async def confirm_inventory(check_id: str,
                             payload: Optional[ConfirmInventoryPayload] = None,
                             current_user: dict = Depends(get_current_user)):
    """Foreman confirms he has reviewed all his equipment for this check."""
    if current_user.get("role") != "foreman":
        raise HTTPException(status_code=403, detail="Tylko brygadzista")
    foreman_id = current_user["sub"]
    check = await db.inventory_checks.find_one({"id": check_id, "status": "active"}, {"_id": 0})
    if not check:
        raise HTTPException(status_code=404, detail="Aktywna inwentaryzacja nie znaleziona")
    if foreman_id not in check.get("required_foremen", []):
        raise HTTPException(status_code=400, detail="Nie jestes wymagany w tej inwentaryzacji")
    if foreman_id in check.get("confirmed_foremen", []):
        return {"message": "Juz potwierdzone"}

    confirmed_ids = (payload.confirmed_equipment_ids if payload else None) or []

    await db.inventory_checks.update_one(
        {"id": check_id},
        {
            "$addToSet": {"confirmed_foremen": foreman_id},
            "$push": {
                "confirmation_log": {
                    "foreman_id": foreman_id,
                    "confirmed_equipment_ids": confirmed_ids,
                    "confirmed_at": datetime.now().isoformat(),
                }
            },
        },
    )
    # Auto-finish if all confirmed
    updated = await db.inventory_checks.find_one({"id": check_id}, {"_id": 0})
    if set(updated.get("required_foremen", [])) == set(updated.get("confirmed_foremen", [])):
        await db.inventory_checks.update_one(
            {"id": check_id},
            {"$set": {"status": "finished", "finished_at": datetime.now().isoformat()}},
        )
    return {"message": "Potwierdzono"}


# ============= iter89: Assignment confirmation endpoints =============
class ContestPayload(BaseModel):
    reason: Optional[str] = None


class ResolveDispute(BaseModel):
    decision: str  # 'keep' | 'revoke'


@router.get("/equipment/confirmations/pending")
async def my_pending_confirmations(current_user: dict = Depends(get_current_user)):
    """Pracownik: lista przypisan oczekujacych na potwierdzenie odbioru."""
    items = await db.equipment_confirmations.find(
        {"foreman_id": current_user["sub"], "status": "pending_confirmation"},
        {"_id": 0},
    ).sort("assigned_at", -1).to_list(200)
    return {"rows": items}


@router.post("/equipment/confirmations/{cid}/confirm")
async def confirm_assignment(cid: str, current_user: dict = Depends(get_current_user)):
    """Pracownik potwierdza odbior sprzetu."""
    conf = await db.equipment_confirmations.find_one({"id": cid})
    if not conf:
        raise HTTPException(status_code=404, detail="Potwierdzenie nie znalezione")
    if conf["foreman_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="To nie jest Twoje przypisanie")
    if conf["status"] != "pending_confirmation":
        raise HTTPException(status_code=400, detail="Potwierdzenie juz rozpatrzone")
    await db.equipment_confirmations.update_one(
        {"id": cid},
        {"$set": {
            "status": "confirmed",
            "confirmed_at": datetime.now().isoformat(),
        }},
    )
    await _add_history(
        conf["equipment_id"], "assignment_confirmed", current_user["sub"],
        conf["foreman_name"],
        {"quantity": conf["quantity"], "confirmation_id": cid},
    )
    return {"message": "Potwierdzono"}


@router.post("/equipment/confirmations/{cid}/contest")
async def contest_assignment(cid: str, payload: ContestPayload,
                              current_user: dict = Depends(get_current_user)):
    """Pracownik zglasza ze nie otrzymal sprzetu - tworzy spor do rozpatrzenia przez admina."""
    conf = await db.equipment_confirmations.find_one({"id": cid})
    if not conf:
        raise HTTPException(status_code=404, detail="Potwierdzenie nie znalezione")
    if conf["foreman_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="To nie jest Twoje przypisanie")
    if conf["status"] != "pending_confirmation":
        raise HTTPException(status_code=400, detail="Potwierdzenie juz rozpatrzone")
    now = datetime.now().isoformat()
    await db.equipment_confirmations.update_one(
        {"id": cid},
        {"$set": {
            "status": "disputed",
            "contested_at": now,
            "contested_reason": payload.reason,
        }},
    )
    conf["status"] = "disputed"
    conf["contested_reason"] = payload.reason
    conf["contested_at"] = now
    await _add_history(
        conf["equipment_id"], "assignment_contested", current_user["sub"],
        conf["foreman_name"],
        {"quantity": conf["quantity"], "confirmation_id": cid, "reason": payload.reason},
    )
    await _notify_assignment_disputed(confirmation=conf, reason=payload.reason)
    return {"message": "Spor zgloszony - czekaj na decyzje admina"}


@router.get("/equipment/confirmations/disputes")
async def list_disputes(current_user: dict = Depends(get_current_admin)):
    """Admin: lista sporow do rozpatrzenia."""
    items = await db.equipment_confirmations.find(
        {"status": "disputed"}, {"_id": 0},
    ).sort("contested_at", -1).to_list(200)
    return {"rows": items}


@router.get("/equipment/confirmations/all")
async def list_all_confirmations(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_admin),
):
    """Admin: lista wszystkich confirmation events, opcjonalnie filtrowana po statusie."""
    q: dict = {}
    if status:
        q["status"] = status
    items = await db.equipment_confirmations.find(q, {"_id": 0}).sort("assigned_at", -1).to_list(500)
    return {"rows": items}


@router.post("/equipment/confirmations/{cid}/resolve")
async def resolve_dispute(cid: str, payload: ResolveDispute,
                            current_user: dict = Depends(get_current_admin)):
    """Admin rozstrzyga spor: 'keep' (zostawia przypisany) lub 'revoke' (cofa przypisanie).

    'revoke' decrementuje equipment_assignments o quantity (sprzet wraca do magazynu)."""
    if payload.decision not in ("keep", "revoke"):
        raise HTTPException(status_code=400, detail="Nieznana decyzja")
    conf = await db.equipment_confirmations.find_one({"id": cid})
    if not conf:
        raise HTTPException(status_code=404, detail="Potwierdzenie nie znalezione")
    if conf["status"] not in ("disputed", "pending_confirmation"):
        raise HTTPException(status_code=400, detail="Potwierdzenie juz rozpatrzone")

    if payload.decision == "revoke":
        # Zmniejsz equipment_assignments o quantity
        src = await db.equipment_assignments.find_one(
            {"equipment_id": conf["equipment_id"], "foreman_id": conf["foreman_id"]},
        )
        if src:
            new_qty = int(src.get("quantity") or 0) - int(conf["quantity"])
            if new_qty <= 0:
                await db.equipment_assignments.delete_one({"id": src["id"]})
            else:
                await db.equipment_assignments.update_one(
                    {"id": src["id"]},
                    {"$set": {"quantity": new_qty}},
                )

    actor_name = await _get_user_name(current_user["sub"])
    new_status = "resolved_revoked" if payload.decision == "revoke" else "resolved_kept"
    await db.equipment_confirmations.update_one(
        {"id": cid},
        {"$set": {
            "status": new_status,
            "resolved_at": datetime.now().isoformat(),
            "resolved_by": current_user["sub"],
            "resolved_by_name": actor_name,
            "resolved_decision": payload.decision,
        }},
    )
    await _add_history(
        conf["equipment_id"], "dispute_resolved", current_user["sub"], actor_name,
        {"quantity": conf["quantity"], "decision": payload.decision,
         "foreman_name": conf["foreman_name"], "confirmation_id": cid},
    )
    # Notify foreman about resolution
    try:
        from routes.push import send_push
        msg_decision = "zostawiony przypisany" if payload.decision == "keep" else "wycofany z Twojego stanu"
        await send_push(
            user_id=conf["foreman_id"],
            title="Spor rozpatrzony",
            body=f"{conf['equipment_name']} x{conf['quantity']} - sprzet zostal {msg_decision}.",
            url="/worker/dashboard",
            tag=f"dispute-resolved-{cid}",
        )
    except Exception:
        pass
    return {"message": "Spor rozpatrzony", "decision": payload.decision}

