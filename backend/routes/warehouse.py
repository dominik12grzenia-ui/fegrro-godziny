"""Warehouse module - materials catalog + foreman orders + history.

Workflow:
- Admin defines materials (name, photo, unit, current_stock).
- Foreman places an order (one or more materials with quantities + optional note).
- Order creates an in-app notification for admin + email (if Resend configured).
- Admin can mark order as "issued" (deducting from stock if available).
- All issuances form an auditable history with foreman filter.
"""
import os
import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
import uuid

from database import db
from auth import get_current_admin, get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


# ============= Schemas =============
class MaterialCreate(BaseModel):
    name: str
    photo: Optional[str] = None  # base64 data URI
    unit: Optional[str] = "szt."  # szt., m, m2, m3, kg, t, l, op., szt.
    current_stock: float = Field(default=0, ge=0)
    note: Optional[str] = None


class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    photo: Optional[str] = None
    unit: Optional[str] = None
    current_stock: Optional[float] = None
    note: Optional[str] = None
    is_active: Optional[bool] = None


class StockAdjust(BaseModel):
    delta: float  # +N add, -N remove
    reason: Optional[str] = None  # przyjęcie | korekta | strata


class OrderItem(BaseModel):
    material_id: str
    quantity: float = Field(gt=0)


class OrderCreate(BaseModel):
    items: List[OrderItem] = Field(min_length=1)
    note: Optional[str] = None
    site_id: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: str  # pending | issued | rejected
    issued_quantity_per_item: Optional[dict] = None  # material_id -> issued qty (default = ordered qty)
    admin_note: Optional[str] = None


# ============= Materials CRUD =============
@router.get("/warehouse/materials")
async def list_materials(
    include_inactive: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    """List materials. Available to admin and foreman."""
    query = {}
    if not include_inactive:
        query["$or"] = [{"is_active": {"$exists": False}}, {"is_active": True}]
    materials = await db.warehouse_materials.find(query, {"_id": 0}).sort("name", 1).to_list(2000)
    return materials


@router.post("/warehouse/materials")
async def create_material(payload: MaterialCreate, current_user: dict = Depends(get_current_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "photo": payload.photo,
        "unit": (payload.unit or "szt.").strip(),
        "current_stock": float(payload.current_stock or 0),
        "note": (payload.note or "").strip() or None,
        "is_active": True,
        "created_at": datetime.now().isoformat(),
    }
    await db.warehouse_materials.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/warehouse/materials/{material_id}")
async def update_material(material_id: str, payload: MaterialUpdate,
                           current_user: dict = Depends(get_current_admin)):
    update_doc = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update_doc:
        raise HTTPException(status_code=400, detail="Brak pol do aktualizacji")
    if "name" in update_doc:
        update_doc["name"] = update_doc["name"].strip()
    if "unit" in update_doc:
        update_doc["unit"] = update_doc["unit"].strip() or "szt."
    if "current_stock" in update_doc:
        update_doc["current_stock"] = float(update_doc["current_stock"])
    update_doc["updated_at"] = datetime.now().isoformat()
    result = await db.warehouse_materials.update_one({"id": material_id}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Material nie znaleziony")
    return await db.warehouse_materials.find_one({"id": material_id}, {"_id": 0})


@router.delete("/warehouse/materials/{material_id}")
async def delete_material(material_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.warehouse_materials.delete_one({"id": material_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Material nie znaleziony")
    return {"message": "Usunieto"}


@router.post("/warehouse/materials/{material_id}/stock")
async def adjust_stock(material_id: str, payload: StockAdjust,
                        current_user: dict = Depends(get_current_admin)):
    mat = await db.warehouse_materials.find_one({"id": material_id}, {"_id": 0})
    if not mat:
        raise HTTPException(status_code=404, detail="Material nie znaleziony")
    new_stock = float(mat.get("current_stock") or 0) + float(payload.delta)
    if new_stock < 0:
        raise HTTPException(status_code=400, detail=f"Stan magazynu nie moze byc ujemny (proba: {new_stock})")
    await db.warehouse_materials.update_one(
        {"id": material_id},
        {"$set": {"current_stock": new_stock, "updated_at": datetime.now().isoformat()}},
    )
    # Log adjustment
    await db.warehouse_stock_log.insert_one({
        "id": str(uuid.uuid4()),
        "material_id": material_id,
        "material_name": mat["name"],
        "delta": float(payload.delta),
        "stock_after": new_stock,
        "reason": (payload.reason or "").strip() or None,
        "by": current_user["sub"],
        "at": datetime.now().isoformat(),
    })
    return {"current_stock": new_stock}


# ============= Orders (foreman) =============
@router.post("/warehouse/orders")
async def create_order(payload: OrderCreate, current_user: dict = Depends(get_current_user)):
    """Foreman creates an order. Allowed even when stock = 0."""
    role = current_user.get("role")
    if role not in ("foreman", "admin"):
        raise HTTPException(status_code=403, detail="Brak uprawnien")

    # Resolve foreman info
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "id": 1, "full_name": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Uzytkownik nie znaleziony")

    # Validate items
    material_ids = [it.material_id for it in payload.items]
    materials = await db.warehouse_materials.find(
        {"id": {"$in": material_ids}}, {"_id": 0}
    ).to_list(500)
    materials_by_id = {m["id"]: m for m in materials}
    missing = [mid for mid in material_ids if mid not in materials_by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"Material(y) nie znalezione: {missing}")

    enriched_items = []
    for it in payload.items:
        m = materials_by_id[it.material_id]
        enriched_items.append({
            "material_id": it.material_id,
            "material_name": m.get("name"),
            "unit": m.get("unit", "szt."),
            "quantity": float(it.quantity),
            "stock_at_order": float(m.get("current_stock") or 0),
            "issued_quantity": None,
        })

    # Resolve site name (if provided)
    site_name = None
    if payload.site_id:
        site = await db.sites.find_one({"id": payload.site_id}, {"_id": 0, "name": 1})
        if site:
            site_name = site.get("name")

    order = {
        "id": str(uuid.uuid4()),
        "foreman_id": user["id"],
        "foreman_name": user["full_name"],
        "site_id": payload.site_id,
        "site_name": site_name,
        "items": enriched_items,
        "note": (payload.note or "").strip() or None,
        "status": "pending",
        "admin_note": None,
        "created_at": datetime.now().isoformat(),
        "issued_at": None,
        "issued_by": None,
    }
    await db.warehouse_orders.insert_one(order)

    # In-app notification for admin
    summary = ", ".join(
        f"{it['material_name']} x{it['quantity']}{it['unit']}"
        for it in enriched_items[:5]
    )
    if len(enriched_items) > 5:
        summary += f" (+{len(enriched_items) - 5} wiecej)"
    notif = {
        "id": str(uuid.uuid4()),
        "type": "warehouse_order",
        "title": f"Zamowienie magazynu: {user['full_name']}",
        "message": summary + (f" - {payload.note}" if payload.note else ""),
        "order_id": order["id"],
        "foreman_id": user["id"],
        "status": "unread",
        "created_at": datetime.now().isoformat(),
    }
    try:
        await db.notifications.insert_one(notif)
    except Exception as e:
        logger.warning(f"Failed to insert notification for warehouse order: {e}")

    # Email to admin (if Resend configured)
    try:
        await _send_order_email(order)
    except Exception as e:
        logger.warning(f"Email send failed for warehouse order {order['id']}: {e}")

    order.pop("_id", None)
    return order


async def _send_order_email(order: dict):
    """Send email via Resend if RESEND_API_KEY is set in env."""
    api_key = os.environ.get("RESEND_API_KEY")
    to_addr = os.environ.get("WAREHOUSE_NOTIFY_EMAIL", "biuro@fegrro.pl")
    from_addr = os.environ.get("RESEND_FROM_EMAIL", "noreply@fegrro.pl")
    if not api_key:
        logger.info("RESEND_API_KEY not configured - skipping email")
        return
    try:
        import httpx
    except ImportError:
        logger.warning("httpx not installed - cannot send email")
        return

    rows_html = "".join(
        f"<tr><td style='padding:6px 10px;border:1px solid #ddd'>{it['material_name']}</td>"
        f"<td style='padding:6px 10px;border:1px solid #ddd;text-align:right'>{it['quantity']} {it['unit']}</td>"
        f"<td style='padding:6px 10px;border:1px solid #ddd;text-align:right;color:#666'>{it.get('stock_at_order', 0)} {it['unit']}</td></tr>"
        for it in order.get("items", [])
    )
    site_line = f"<p>Budowa: <b>{order.get('site_name')}</b></p>" if order.get("site_name") else ""
    note_line = f"<p>Notatka: <i>{order['note']}</i></p>" if order.get("note") else ""
    html = f"""
    <html><body style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#5F7151">FeGrro - Nowe zamowienie magazynu</h2>
      <p>Brygadzista <b>{order['foreman_name']}</b> zlozyl zamowienie:</p>
      {site_line}
      {note_line}
      <table style="border-collapse:collapse;width:100%;margin:12px 0">
        <thead><tr style="background:#2A384C;color:white">
          <th style="padding:8px;text-align:left">Material</th>
          <th style="padding:8px;text-align:right">Zamowiono</th>
          <th style="padding:8px;text-align:right">Stan magazynu</th>
        </tr></thead>
        <tbody>{rows_html}</tbody>
      </table>
      <p style="color:#666;font-size:12px">Zaloguj sie do panelu admina aby zatwierdzic.</p>
    </body></html>
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "from": from_addr,
                "to": [to_addr],
                "subject": f"FeGrro: zamowienie od {order['foreman_name']}",
                "html": html,
            },
        )
        if resp.status_code >= 300:
            logger.warning(f"Resend API returned {resp.status_code}: {resp.text}")


@router.get("/warehouse/orders")
async def list_orders(
    status: Optional[str] = Query(None),
    foreman_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    query = {}
    if status:
        query["status"] = status
    if role == "foreman":
        # Foreman can see only their own orders
        query["foreman_id"] = current_user["sub"]
    elif foreman_id:
        query["foreman_id"] = foreman_id
    orders = await db.warehouse_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return orders


@router.put("/warehouse/orders/{order_id}/status")
async def update_order_status(
    order_id: str,
    payload: OrderStatusUpdate,
    current_user: dict = Depends(get_current_admin),
):
    if payload.status not in ("pending", "issued", "rejected"):
        raise HTTPException(status_code=400, detail="Nieprawidlowy status")
    order = await db.warehouse_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Zamowienie nie znalezione")

    now = datetime.now().isoformat()
    set_doc = {
        "status": payload.status,
        "admin_note": (payload.admin_note or "").strip() or None,
    }

    if payload.status == "issued":
        set_doc["issued_at"] = now
        set_doc["issued_by"] = current_user["sub"]
        # Apply issued quantities + stock deduction
        per_item = payload.issued_quantity_per_item or {}
        new_items = []
        history_entries = []
        for it in order["items"]:
            issued_q = float(per_item.get(it["material_id"], it["quantity"]))
            if issued_q < 0:
                raise HTTPException(status_code=400, detail="Issued qty < 0")
            new_items.append({**it, "issued_quantity": issued_q})
            # Deduct stock (allow stock to go negative? user requested orders even at 0,
            # so do not block - but warn via stock_log)
            mat = await db.warehouse_materials.find_one({"id": it["material_id"]}, {"_id": 0})
            if mat:
                new_stock = float(mat.get("current_stock") or 0) - issued_q
                await db.warehouse_materials.update_one(
                    {"id": it["material_id"]},
                    {"$set": {"current_stock": new_stock, "updated_at": now}},
                )
                history_entries.append({
                    "id": str(uuid.uuid4()),
                    "material_id": it["material_id"],
                    "material_name": it["material_name"],
                    "unit": it.get("unit", "szt."),
                    "delta": -issued_q,
                    "stock_after": new_stock,
                    "reason": "wydanie zamowienia",
                    "order_id": order_id,
                    "foreman_id": order["foreman_id"],
                    "foreman_name": order["foreman_name"],
                    "by": current_user["sub"],
                    "at": now,
                })
        set_doc["items"] = new_items
        if history_entries:
            await db.warehouse_stock_log.insert_many(history_entries)

    await db.warehouse_orders.update_one({"id": order_id}, {"$set": set_doc})
    return await db.warehouse_orders.find_one({"id": order_id}, {"_id": 0})


@router.delete("/warehouse/orders/{order_id}")
async def delete_order(order_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.warehouse_orders.delete_one({"id": order_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zamowienie nie znalezione")
    return {"message": "Usunieto"}


# ============= History =============
@router.get("/warehouse/history")
async def list_history(
    foreman_id: Optional[str] = Query(None),
    material_id: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    current_user: dict = Depends(get_current_admin),
):
    """Returns merged history of issuances + adjustments, optionally filtered by foreman/material."""
    query = {}
    if foreman_id:
        query["foreman_id"] = foreman_id
    if material_id:
        query["material_id"] = material_id
    entries = await db.warehouse_stock_log.find(query, {"_id": 0}).sort("at", -1).to_list(limit)
    return entries
