"""Equipment (Sprzet) management routes.

Features:
- Admin: full CRUD on equipment, assign quantities to foremen, view history
- Foreman: list own equipment, transfer equipment to another foreman (requires acceptance),
  report defect, request return
- Constraint: total assigned across all foremen must never exceed equipment.total_quantity
- Public: each equipment item has a public_token enabling QR-code labels;
  scanning shows holders, status, history and an anonymous defect report form.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import Optional, List
import uuid
import secrets

from database import db
from auth import get_current_user, get_current_admin
from pydantic import BaseModel

router = APIRouter()


# ============= Pydantic schemas =============
class EquipmentCreate(BaseModel):
    name: str
    brand: Optional[str] = None
    total_quantity: int
    photo: Optional[str] = None  # base64 encoded


class EquipmentUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    total_quantity: Optional[int] = None
    photo: Optional[str] = None
    status: Optional[str] = None  # working / broken / maintenance


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


# ============= Equipment CRUD (admin) =============
@router.get("/equipment")
async def list_equipment(current_user: dict = Depends(get_current_user)):
    items = await db.equipment.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    # enrich with assigned totals + ensure public_token exists (lazy migration)
    result = []
    for item in items:
        if not item.get("public_token"):
            token = secrets.token_urlsafe(12)
            await db.equipment.update_one({"id": item["id"]}, {"$set": {"public_token": token}})
            item["public_token"] = token
        total_assigned = await _get_total_assigned(item["id"])
        result.append({
            **item,
            "assigned_quantity": total_assigned,
            "available_quantity": max(0, item.get("total_quantity", 0) - total_assigned)
        })
    return result


@router.post("/equipment")
async def create_equipment(payload: EquipmentCreate,
                            current_user: dict = Depends(get_current_admin)):
    if payload.total_quantity < 0:
        raise HTTPException(status_code=400, detail="Ilosc nie moze byc ujemna")
    eq_id = str(uuid.uuid4())
    doc = {
        "id": eq_id,
        "name": payload.name.strip(),
        "brand": (payload.brand or "").strip() or None,
        "total_quantity": payload.total_quantity,
        "photo": payload.photo,
        "status": "working",
        "public_token": secrets.token_urlsafe(12),
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    await db.equipment.insert_one(doc)
    doc.pop("_id", None)
    await _add_history(eq_id, "created", current_user["sub"],
                        await _get_user_name(current_user["sub"]),
                        {"total_quantity": payload.total_quantity, "name": payload.name})
    return {**doc, "assigned_quantity": 0, "available_quantity": payload.total_quantity}


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
    if payload.status is not None:
        update_doc["status"] = payload.status
    if payload.total_quantity is not None:
        if payload.total_quantity < 0:
            raise HTTPException(status_code=400, detail="Ilosc nie moze byc ujemna")
        total_assigned = await _get_total_assigned(equipment_id)
        if payload.total_quantity < total_assigned:
            raise HTTPException(
                status_code=400,
                detail=f"Nie mozesz zmniejszyc do {payload.total_quantity}: aktualnie przypisanych jest {total_assigned} szt."
            )
        update_doc["total_quantity"] = payload.total_quantity

    await db.equipment.update_one({"id": equipment_id}, {"$set": update_doc})
    await _add_history(equipment_id, "updated", current_user["sub"],
                        await _get_user_name(current_user["sub"]), update_doc)
    eq2 = await db.equipment.find_one({"id": equipment_id}, {"_id": 0})
    total_assigned = await _get_total_assigned(equipment_id)
    return {**eq2, "assigned_quantity": total_assigned,
            "available_quantity": max(0, eq2["total_quantity"] - total_assigned)}


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
                          current_user: dict = Depends(get_current_admin)):
    """Set the quantity assigned to a specific foreman for an equipment.
    quantity=0 removes the assignment.
    """
    eq = await db.equipment.find_one({"id": equipment_id})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")
    foreman = await db.users.find_one({"id": payload.foreman_id, "role": "foreman"})
    if not foreman:
        raise HTTPException(status_code=404, detail="Brygadzista nie znaleziony")
    if payload.quantity < 0:
        raise HTTPException(status_code=400, detail="Ilosc nie moze byc ujemna")

    # Compute total assigned excluding this foreman
    pipeline = [
        {"$match": {"equipment_id": equipment_id, "foreman_id": {"$ne": payload.foreman_id}}},
        {"$group": {"_id": None, "total": {"$sum": "$quantity"}}}
    ]
    others = await db.equipment_assignments.aggregate(pipeline).to_list(1)
    other_sum = others[0]["total"] if others else 0

    if other_sum + payload.quantity > eq["total_quantity"]:
        raise HTTPException(
            status_code=400,
            detail=f"Brak wystarczajacej ilosci. Dostepne: {eq['total_quantity'] - other_sum} szt."
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
    return {"message": "Przypisanie zaktualizowane"}


# ============= Foreman view =============
@router.get("/equipment/my")
async def my_equipment(current_user: dict = Depends(get_current_user)):
    """Equipment assigned to the current foreman."""
    foreman_id = current_user["sub"]
    assignments = await db.equipment_assignments.find(
        {"foreman_id": foreman_id}, {"_id": 0}
    ).to_list(1000)
    result = []
    for a in assignments:
        eq = await db.equipment.find_one({"id": a["equipment_id"]}, {"_id": 0})
        if eq:
            result.append({**eq, "quantity": a["quantity"], "assigned_at": a.get("assigned_at")})
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
    return transfer


@router.get("/equipment/transfers/pending")
async def my_pending_transfers(current_user: dict = Depends(get_current_user)):
    """Pending transfers awaiting current foreman's acceptance."""
    foreman_id = current_user["sub"]
    items = await db.equipment_transfers.find(
        {"to_foreman_id": foreman_id, "status": "pending"}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return items


@router.get("/equipment/transfers/all")
async def all_transfers(current_user: dict = Depends(get_current_admin)):
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

    # Decrement source assignment
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

    actor_name = await _get_user_name(current_user["sub"])
    doc = {
        "id": str(uuid.uuid4()),
        "equipment_id": payload.equipment_id,
        "equipment_name": eq["name"],
        "foreman_id": current_user["sub"],
        "foreman_name": actor_name,
        "quantity": payload.quantity,
        "description": payload.description,
        "photo": payload.photo,
        "status": "open",
        "created_at": datetime.now().isoformat(),
    }
    await db.equipment_defects.insert_one(doc)
    doc.pop("_id", None)
    await _add_history(payload.equipment_id, "defect_reported", current_user["sub"], actor_name,
                        {"quantity": payload.quantity, "description": payload.description})
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



# ============= Public (QR) endpoints — no auth =============
class PublicDefectReport(BaseModel):
    reporter_name: str
    quantity: int
    description: Optional[str] = None
    photo: Optional[str] = None  # base64


@router.get("/public/equipment/{token}")
async def public_equipment_view(token: str):
    """Public view returned after scanning a QR label.
    Returns equipment summary + current holders + recent history (no PII beyond names).
    """
    eq = await db.equipment.find_one({"public_token": token}, {"_id": 0})
    if not eq:
        raise HTTPException(status_code=404, detail="Nieznany kod QR")

    total_assigned = await _get_total_assigned(eq["id"])
    assignments = await db.equipment_assignments.find(
        {"equipment_id": eq["id"]}, {"_id": 0}
    ).to_list(1000)

    holders = []
    for a in assignments:
        u = await db.users.find_one({"id": a["foreman_id"]}, {"_id": 0, "full_name": 1})
        holders.append({
            "foreman_name": u["full_name"] if u else "Nieznany",
            "quantity": a["quantity"],
            "assigned_at": a.get("assigned_at"),
        })
    holders.sort(key=lambda h: h["foreman_name"])

    history = await db.equipment_history.find(
        {"equipment_id": eq["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(15)

    return {
        "id": eq["id"],
        "name": eq["name"],
        "brand": eq.get("brand"),
        "photo": eq.get("photo"),
        "status": eq.get("status", "working"),
        "total_quantity": eq["total_quantity"],
        "assigned_quantity": total_assigned,
        "available_quantity": max(0, eq["total_quantity"] - total_assigned),
        "holders": holders,
        "history": history,
    }


@router.post("/public/equipment/{token}/defect")
async def public_report_defect(token: str, payload: PublicDefectReport):
    """Anonymous defect report from QR-scan page. Includes the reporter's typed name."""
    eq = await db.equipment.find_one({"public_token": token})
    if not eq:
        raise HTTPException(status_code=404, detail="Nieznany kod QR")
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Ilosc musi byc dodatnia")
    if not payload.reporter_name.strip():
        raise HTTPException(status_code=400, detail="Podaj swoje imie i nazwisko")

    doc = {
        "id": str(uuid.uuid4()),
        "equipment_id": eq["id"],
        "equipment_name": eq["name"],
        "foreman_id": None,
        "foreman_name": payload.reporter_name.strip(),
        "quantity": payload.quantity,
        "description": payload.description,
        "photo": payload.photo,
        "status": "open",
        "source": "qr_public",
        "created_at": datetime.now().isoformat(),
    }
    await db.equipment_defects.insert_one(doc)
    doc.pop("_id", None)
    await _add_history(eq["id"], "defect_reported", "public", payload.reporter_name.strip(),
                        {"quantity": payload.quantity, "description": payload.description,
                         "source": "qr_public"})
    return {"message": "Usterka zgloszona", "id": doc["id"]}
