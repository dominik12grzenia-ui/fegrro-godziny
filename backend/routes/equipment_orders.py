"""Equipment ordering (catalog) - foremen browse equipment stock and submit orders.

Admin can then fulfill (issue) or reject orders.
"""
import os
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid

from database import db
from auth import get_current_user, get_current_admin, get_current_admin_or_warehouse

logger = logging.getLogger(__name__)
router = APIRouter()


CATEGORY_LABELS = {
    "electronics": "Elektronarzedzia",
    "accessories": "Akcesoria",
    "formwork": "Szalunki",
}


async def _send_equipment_order_email(order: dict):
    """Send email to admin about new equipment order via Resend."""
    api_key = os.environ.get("RESEND_API_KEY")
    to_addr = os.environ.get("WAREHOUSE_NOTIFY_EMAIL", "biuro@fegrro.pl")
    from_addr = os.environ.get("RESEND_FROM_EMAIL", "noreply@fegrro.pl")
    if not api_key:
        logger.info("RESEND_API_KEY not configured - skipping equipment order email")
        return
    try:
        import httpx
    except ImportError:
        logger.warning("httpx not installed - cannot send email")
        return

    cat_label = CATEGORY_LABELS.get(order.get("category"), order.get("category", "?"))
    variant_line = (
        f"<p>Wariant / rozmiar: <b>{order['variant']}</b></p>"
        if order.get("variant") else ""
    )
    notes_line = (
        f"<p>Uwagi: <i>{order['notes']}</i></p>"
        if order.get("notes") else ""
    )
    html = f"""
    <html><body style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#5F7151">FeGrro - Nowe zamowienie sprzetu</h2>
      <p>Brygadzista <b>{order['foreman_name']}</b> zlozyl zamowienie:</p>
      <table style="border-collapse:collapse;width:100%;margin:12px 0">
        <tr><td style="padding:8px;border:1px solid #ddd">Kategoria</td>
            <td style="padding:8px;border:1px solid #ddd"><b>{cat_label}</b></td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd">Sprzet</td>
            <td style="padding:8px;border:1px solid #ddd"><b>{order['equipment_name']}</b>"""
    if order.get("equipment_brand"):
        html += f" ({order['equipment_brand']})"
    html += f"""</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd">Ilosc</td>
            <td style="padding:8px;border:1px solid #ddd"><b>{order['quantity_requested']}</b> szt.</td></tr>
      </table>
      {variant_line}
      {notes_line}
      <p style="color:#666;font-size:12px">
        Zaloguj sie do panelu admina aby wydac sprzet.
      </p>
    </body></html>
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "from": from_addr,
                    "to": [to_addr],
                    "reply_to": ["biuro@fegrro.pl"],
                    "subject": f"FeGrro: zamowienie sprzetu od {order['foreman_name']}",
                    "html": html,
                },
            )
            if resp.status_code >= 300:
                logger.warning(f"Resend equipment order email failed {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.warning(f"Resend equipment order email exception: {e}")



class EquipmentOrderCreate(BaseModel):
    equipment_id: str
    quantity: int
    variant: Optional[str] = None  # selected variant name, e.g. "8mm"
    notes: Optional[str] = None


@router.get("/equipment/catalog")
async def equipment_catalog(
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Foreman-visible catalog of ALL equipment with current stock (assigned/available).
    Same data as /api/equipment but without admin-only fields.
    """
    query = {}
    if category:
        if category == "electronics":
            query = {"$or": [{"category": "electronics"}, {"category": {"$exists": False}}, {"category": None}]}
        else:
            query = {"category": category}

    items = await db.equipment.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "brand": 1, "photo": 1, "category": 1,
         "total_quantity": 1, "broken_quantity": 1, "variants": 1},
    ).sort("name", 1).to_list(1000)
    if not items:
        return []

    # Compute assigned totals in one pass
    eq_ids = [it["id"] for it in items]
    pipeline = [
        {"$match": {"equipment_id": {"$in": eq_ids}}},
        {"$group": {"_id": "$equipment_id", "total": {"$sum": "$quantity"}}},
    ]
    sums = {row["_id"]: row["total"] async for row in db.equipment_assignments.aggregate(pipeline)}

    result = []
    for it in items:
        total = int(it.get("total_quantity") or 0)
        broken = int(it.get("broken_quantity") or 0)
        assigned = int(sums.get(it["id"], 0))
        available = max(0, total - broken - assigned)
        result.append({
            **it,
            "category": it.get("category") or "electronics",
            "variants": it.get("variants") or [],
            "total_quantity": total,
            "broken_quantity": broken,
            "assigned_quantity": assigned,
            "available_quantity": available,
        })
    return result


@router.post("/equipment/orders")
async def create_equipment_order(payload: EquipmentOrderCreate,
                                  current_user: dict = Depends(get_current_user)):
    """Foreman submits an order for equipment from warehouse stock."""
    if current_user.get("role") != "foreman":
        raise HTTPException(status_code=403, detail="Tylko brygadzista")
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Ilosc musi byc wieksza od 0")

    eq = await db.equipment.find_one({"id": payload.equipment_id}, {"_id": 0})
    if not eq:
        raise HTTPException(status_code=404, detail="Sprzet nie znaleziony")

    # If variant requested, validate it belongs to the equipment
    variants = eq.get("variants") or []
    if payload.variant and payload.variant not in variants:
        raise HTTPException(status_code=400, detail=f"Nieprawidlowy wariant. Dostepne: {', '.join(variants)}")
    if variants and not payload.variant:
        raise HTTPException(status_code=400, detail="Wybierz wariant (rozmiar/rodzaj)")

    # Resolve foreman name
    user_doc = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "full_name": 1})
    foreman_name = (user_doc or {}).get("full_name") or "Brygadzista"

    order = {
        "id": str(uuid.uuid4()),
        "foreman_id": current_user["sub"],
        "foreman_name": foreman_name,
        "equipment_id": payload.equipment_id,
        "equipment_name": eq.get("name"),
        "equipment_brand": eq.get("brand"),
        "equipment_photo": eq.get("photo"),
        "category": eq.get("category") or "electronics",
        "variant": payload.variant,
        "quantity_requested": int(payload.quantity),
        "quantity_issued": 0,
        "notes": payload.notes,
        "status": "pending",  # pending | issued | partial | rejected
        "created_at": datetime.now().isoformat(),
    }
    await db.equipment_orders.insert_one(order)
    order.pop("_id", None)

    # Notify admin (in-app)
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "type": "equipment_order",
            "title": "Nowe zamowienie sprzetu",
            "message": f"{foreman_name}: {eq.get('name')}"
                        + (f" ({payload.variant})" if payload.variant else "")
                        + f" x{payload.quantity}",
            "order_id": order["id"],
            "status": "unread",
            "created_at": datetime.now().isoformat(),
        })
    except Exception as e:
        print(f"Notification insert failed: {e}")

    # Push notification to admins (PWA)
    try:
        from routes.push import send_push_to_admins
        cat_label = CATEGORY_LABELS.get(order.get("category"), "Sprzet")
        await send_push_to_admins(
            title=f"Nowe zamowienie ({cat_label})",
            body=f"{foreman_name}: {eq.get('name')} x{payload.quantity}",
            url="/admin/dashboard",
            tag=f"order-{order['id']}",
        )
    except Exception as e:
        logger.warning(f"Push to admins failed: {e}")

    # Notify admin (email - non-blocking; errors logged but don't fail the request)
    try:
        await _send_equipment_order_email(order)
    except Exception as e:
        logger.warning(f"Email send failed: {e}")

    return order


@router.get("/equipment/orders")
async def list_equipment_orders(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List equipment orders. Admin sees all; foreman sees his own only.

    Enriches each order with the up-to-date `category` from its equipment doc
    so historic orders (from before category was set) and recategorized items
    show up in the right admin/foreman tab.
    """
    query = {}
    if status:
        query["status"] = status
    if current_user.get("role") != "admin":
        query["foreman_id"] = current_user["sub"]
    items = await db.equipment_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    if not items:
        return items
    eq_ids = list({it.get("equipment_id") for it in items if it.get("equipment_id")})
    eq_cats = {}
    if eq_ids:
        async for e in db.equipment.find({"id": {"$in": eq_ids}}, {"_id": 0, "id": 1, "category": 1}):
            eq_cats[e["id"]] = e.get("category") or "electronics"
    for it in items:
        # Always prefer current equipment.category; fallback to stored or default.
        it["category"] = eq_cats.get(it.get("equipment_id"), it.get("category") or "electronics")
    return items


class IssueOrderPayload(BaseModel):
    quantity_issued: int


@router.post("/equipment/orders/{order_id}/issue")
async def issue_equipment_order(order_id: str,
                                 payload: IssueOrderPayload,
                                 current_user: dict = Depends(get_current_admin_or_warehouse)):
    """Admin issues (fulfills) equipment order fully or partially.
    Automatically adds quantity to foreman's equipment_assignments.
    """
    order = await db.equipment_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Zamowienie nie znalezione")
    if order.get("status") in ("issued", "rejected"):
        raise HTTPException(status_code=400, detail="Zamowienie juz zakonczone")
    if payload.quantity_issued < 0:
        raise HTTPException(status_code=400, detail="Ilosc nie moze byc ujemna")

    remaining = int(order["quantity_requested"]) - int(order.get("quantity_issued") or 0)
    if payload.quantity_issued > remaining:
        raise HTTPException(status_code=400, detail=f"Maks dostepne do wydania: {remaining}")

    new_issued = int(order.get("quantity_issued") or 0) + int(payload.quantity_issued)
    new_status = "issued" if new_issued >= int(order["quantity_requested"]) else "partial"

    # Strict stock check - NEVER issue more than is physically available.
    # available = total_quantity - broken_quantity - sum(all other assignments).
    # Note: self-assignment is included in "other" but we top it up with quantity_issued,
    # so total assigned will match after the update.
    if payload.quantity_issued > 0:
        eq_doc = await db.equipment.find_one({"id": order["equipment_id"]}, {"_id": 0, "total_quantity": 1, "broken_quantity": 1, "name": 1})
        total_q = int((eq_doc or {}).get("total_quantity") or 0)
        broken_q = int((eq_doc or {}).get("broken_quantity") or 0)
        agg = [{"$match": {"equipment_id": order["equipment_id"]}},
               {"$group": {"_id": None, "s": {"$sum": "$quantity"}}}]
        sum_assigned = 0
        async for row in db.equipment_assignments.aggregate(agg):
            sum_assigned = int(row.get("s") or 0)
        available = max(0, total_q - broken_q - sum_assigned)
        if payload.quantity_issued > available:
            raise HTTPException(
                status_code=400,
                detail=f"Brak wystarczajacej ilosci na stanie. Dostepne: {available} szt. (calkowita {total_q} − uszkodzone {broken_q} − przypisane {sum_assigned})",
            )

    # Increment foreman's assignment on that equipment
    if payload.quantity_issued > 0:
        existing = await db.equipment_assignments.find_one(
            {"equipment_id": order["equipment_id"], "foreman_id": order["foreman_id"]},
            {"_id": 0, "quantity": 1},
        )
        if existing:
            await db.equipment_assignments.update_one(
                {"equipment_id": order["equipment_id"], "foreman_id": order["foreman_id"]},
                {"$inc": {"quantity": int(payload.quantity_issued)},
                 "$set": {"updated_at": datetime.now().isoformat()}},
            )
        else:
            await db.equipment_assignments.insert_one({
                "id": str(uuid.uuid4()),
                "equipment_id": order["equipment_id"],
                "foreman_id": order["foreman_id"],
                "quantity": int(payload.quantity_issued),
                "assigned_at": datetime.now().isoformat(),
            })

    await db.equipment_orders.update_one(
        {"id": order_id},
        {"$set": {
            "quantity_issued": new_issued,
            "status": new_status,
            "issued_by": current_user["sub"],
            "issued_at": datetime.now().isoformat(),
        }},
    )

    # Push to foreman: their order was fulfilled (fully or partially)
    try:
        from routes.push import send_push
        cat_label = CATEGORY_LABELS.get(order.get("category"), "Sprzet")
        msg_status = "wydany w calosci" if new_status == "issued" else "wydany czesciowo"
        await send_push(
            user_id=order["foreman_id"],
            title=f"Sprzet {msg_status}",
            body=f"{order.get('equipment_name')} x{payload.quantity_issued} ({cat_label})",
            url="/worker/dashboard",
            tag=f"order-issued-{order_id}",
        )
    except Exception as e:
        logger.warning(f"Push to foreman (issued) failed: {e}")

    return {"message": "Wydano", "status": new_status, "quantity_issued": new_issued}


@router.post("/equipment/orders/{order_id}/reject")
async def reject_equipment_order(order_id: str,
                                  current_user: dict = Depends(get_current_admin)):
    """Admin rejects an order (e.g. out of stock, wrong item)."""
    res = await db.equipment_orders.update_one(
        {"id": order_id, "status": {"$in": ["pending", "partial"]}},
        {"$set": {"status": "rejected",
                  "rejected_by": current_user["sub"],
                  "rejected_at": datetime.now().isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Zamowienie nie znalezione lub juz zakonczone")
    return {"message": "Odrzucono"}


@router.delete("/equipment/orders/{order_id}")
async def delete_equipment_order(order_id: str,
                                  current_user: dict = Depends(get_current_user)):
    """Foreman can delete his own pending order. Admin can delete any."""
    query = {"id": order_id}
    if current_user.get("role") != "admin":
        query["foreman_id"] = current_user["sub"]
        query["status"] = "pending"
    res = await db.equipment_orders.delete_one(query)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zamowienie nie znalezione lub nie mozna usunac")
    return {"message": "Usunieto"}
