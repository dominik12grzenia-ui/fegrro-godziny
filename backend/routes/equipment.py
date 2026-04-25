from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
import uuid

from database import db
from auth import get_current_user, get_current_admin

router = APIRouter()


# ============= MODELS =============
class EquipmentCreate(BaseModel):
    name: str
    category: Optional[str] = None
    serial_number: Optional[str] = None
    status: str = "sprawny"  # sprawny | uszkodzony | w_serwisie | wycofany
    assigned_to_employee_id: Optional[str] = None
    assigned_to_site_id: Optional[str] = None
    notes: Optional[str] = None
    image_data: Optional[str] = None  # base64


class EquipmentUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    serial_number: Optional[str] = None
    status: Optional[str] = None
    assigned_to_employee_id: Optional[str] = None
    assigned_to_site_id: Optional[str] = None
    notes: Optional[str] = None
    image_data: Optional[str] = None


class Equipment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    category: Optional[str] = None
    serial_number: Optional[str] = None
    status: str = "sprawny"
    assigned_to_employee_id: Optional[str] = None
    assigned_to_site_id: Optional[str] = None
    notes: Optional[str] = None
    image_data: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now())
    updated_at: datetime = Field(default_factory=lambda: datetime.now())


# ============= ENDPOINTS =============
PROJECTION = {
    "_id": 0,
    "id": 1, "name": 1, "category": 1, "serial_number": 1, "status": 1,
    "assigned_to_employee_id": 1, "assigned_to_site_id": 1,
    "notes": 1, "image_data": 1, "created_at": 1, "updated_at": 1
}


@router.get("/equipment")
async def list_equipment(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    site_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if employee_id:
        query["assigned_to_employee_id"] = employee_id
    if site_id:
        query["assigned_to_site_id"] = site_id

    items = await db.equipment.find(query, PROJECTION).sort("name", 1).to_list(2000)
    return items


@router.post("/equipment")
async def create_equipment(
    payload: EquipmentCreate,
    current_user: dict = Depends(get_current_admin)
):
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Nazwa sprzetu jest wymagana")

    eq_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    doc = {
        "id": eq_id,
        "name": payload.name.strip(),
        "category": payload.category,
        "serial_number": payload.serial_number,
        "status": payload.status or "sprawny",
        "assigned_to_employee_id": payload.assigned_to_employee_id,
        "assigned_to_site_id": payload.assigned_to_site_id,
        "notes": payload.notes,
        "image_data": payload.image_data,
        "created_at": now,
        "updated_at": now,
    }
    await db.equipment.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/equipment/{equipment_id}")
async def update_equipment(
    equipment_id: str,
    payload: EquipmentUpdate,
    current_user: dict = Depends(get_current_admin)
):
    existing = await db.equipment.find_one({"id": equipment_id}, PROJECTION)
    if not existing:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")

    update_doc = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None or k in ("assigned_to_employee_id", "assigned_to_site_id", "notes", "image_data")}
    update_doc["updated_at"] = datetime.now().isoformat()

    await db.equipment.update_one({"id": equipment_id}, {"$set": update_doc})
    updated = await db.equipment.find_one({"id": equipment_id}, PROJECTION)
    return updated


@router.post("/equipment/{equipment_id}/assign")
async def assign_equipment(
    equipment_id: str,
    employee_id: Optional[str] = None,
    site_id: Optional[str] = None,
    current_user: dict = Depends(get_current_admin)
):
    """Przypisz sprzet do pracownika lub budowy. Pusty employee_id = zwrot na magazyn."""
    existing = await db.equipment.find_one({"id": equipment_id}, PROJECTION)
    if not existing:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")

    update_doc = {
        "assigned_to_employee_id": employee_id or None,
        "assigned_to_site_id": site_id or None,
        "updated_at": datetime.now().isoformat(),
    }
    await db.equipment.update_one({"id": equipment_id}, {"$set": update_doc})
    updated = await db.equipment.find_one({"id": equipment_id}, PROJECTION)
    return updated


@router.delete("/equipment/{equipment_id}")
async def delete_equipment(
    equipment_id: str,
    current_user: dict = Depends(get_current_admin)
):
    result = await db.equipment.delete_one({"id": equipment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")
    return {"success": True, "id": equipment_id}
