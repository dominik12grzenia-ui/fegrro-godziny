"""BHP items routes.

Admin manages a catalog of BHP items (e.g. szelki, kask, rękawice) and
records issuances to individual employees. One record per physical piece.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
import uuid

from database import db
from auth import get_current_admin

router = APIRouter()


# ============= Schemas =============
class BhpItemCreate(BaseModel):
    name: str
    photo: Optional[str] = None  # base64


class BhpItemUpdate(BaseModel):
    name: Optional[str] = None
    photo: Optional[str] = None
    is_active: Optional[bool] = None


class BhpIssuanceCreate(BaseModel):
    employee_id: str
    bhp_item_id: str
    quantity: int = Field(ge=1, default=1)
    serial_number: Optional[str] = None
    note: Optional[str] = None


class BhpIssuanceUpdate(BaseModel):
    quantity: Optional[int] = Field(default=None, ge=1)
    serial_number: Optional[str] = None
    note: Optional[str] = None


# ============= Items CRUD =============
@router.get("/bhp/items")
async def list_items(current_user: dict = Depends(get_current_admin)):
    items = await db.bhp_items.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return items


@router.post("/bhp/items")
async def create_item(payload: BhpItemCreate,
                       current_user: dict = Depends(get_current_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "photo": payload.photo,
        "is_active": True,
        "created_at": datetime.now().isoformat(),
    }
    await db.bhp_items.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/bhp/items/{item_id}")
async def update_item(item_id: str, payload: BhpItemUpdate,
                       current_user: dict = Depends(get_current_admin)):
    update_doc = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_doc:
        raise HTTPException(status_code=400, detail="Brak pol do aktualizacji")
    if "name" in update_doc:
        update_doc["name"] = update_doc["name"].strip()
    result = await db.bhp_items.update_one({"id": item_id}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pozycja nie znaleziona")
    doc = await db.bhp_items.find_one({"id": item_id}, {"_id": 0})
    return doc


@router.delete("/bhp/items/{item_id}")
async def delete_item(item_id: str,
                       current_user: dict = Depends(get_current_admin)):
    # Delete item + all its issuances
    result = await db.bhp_items.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pozycja nie znaleziona")
    await db.bhp_issuances.delete_many({"bhp_item_id": item_id})
    return {"message": "Pozycja usunieta"}


# ============= Issuances =============
@router.get("/bhp/issuances")
async def list_issuances(current_user: dict = Depends(get_current_admin)):
    """Returns flat list of issuances. Admin UI groups them by item or by employee."""
    items = await db.bhp_issuances.find({}, {"_id": 0}).sort("issued_at", -1).to_list(5000)
    return items


@router.post("/bhp/issuances")
async def create_issuance(payload: BhpIssuanceCreate,
                           current_user: dict = Depends(get_current_admin)):
    emp = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0, "id": 1, "full_name": 1})
    if not emp:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")
    item = await db.bhp_items.find_one({"id": payload.bhp_item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Rzecz BHP nie znaleziona")

    doc = {
        "id": str(uuid.uuid4()),
        "employee_id": emp["id"],
        "employee_name": emp["full_name"],
        "bhp_item_id": item["id"],
        "bhp_item_name": item["name"],
        "quantity": int(payload.quantity),
        "serial_number": (payload.serial_number or "").strip() or None,
        "note": (payload.note or "").strip() or None,
        "issued_at": datetime.now().isoformat(),
        "issued_by": current_user["sub"],
    }
    await db.bhp_issuances.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/bhp/issuances/{issuance_id}")
async def update_issuance(issuance_id: str, payload: BhpIssuanceUpdate,
                           current_user: dict = Depends(get_current_admin)):
    update_doc = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_doc:
        raise HTTPException(status_code=400, detail="Brak pol do aktualizacji")
    if "serial_number" in update_doc:
        update_doc["serial_number"] = (update_doc["serial_number"] or "").strip() or None
    if "note" in update_doc:
        update_doc["note"] = (update_doc["note"] or "").strip() or None
    result = await db.bhp_issuances.update_one({"id": issuance_id}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Wydanie nie znalezione")
    doc = await db.bhp_issuances.find_one({"id": issuance_id}, {"_id": 0})
    return doc


@router.delete("/bhp/issuances/{issuance_id}")
async def delete_issuance(issuance_id: str,
                           current_user: dict = Depends(get_current_admin)):
    result = await db.bhp_issuances.delete_one({"id": issuance_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Wydanie nie znalezione")
    return {"message": "Wydanie usuniete"}
