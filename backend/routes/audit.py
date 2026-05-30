"""Audit log API - przegladanie zmian w danych finansowych.

iter95bo: Pakiet A. Endpointy:
- GET /api/audit-log              - lista zmian z filtrami
- GET /api/audit-log/{entity}/{id} - historia konkretnego rekordu
- POST /api/audit-log/restore     - przywrocenie miekko-usunietego rekordu
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone, timedelta

from database import db
from auth import get_current_admin, get_current_finance_reader
from audit_log import restore_soft_deleted

router = APIRouter()


# Mapowanie entity_label -> collection_name (dla restore)
_ENTITY_TO_COLLECTION = {
    "finance_zapis": "finance_zapisy",
    "finance_invoice": "finance_invoices",
    "finance_budowa": "finance_budowy",
}


@router.get("/audit-log")
async def list_audit_log(
    entity: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,  # create|update|delete|restore
    user_id: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(200, ge=1, le=1000),
    _user: dict = Depends(get_current_finance_reader),
):
    """Lista zmian z filtrowaniem. Domyslnie ostatnie 30 dni, max 200 wpisow."""
    q = {"ts": {"$gte": datetime.now(timezone.utc) - timedelta(days=days)}}
    if entity:
        q["entity"] = entity
    if entity_id:
        q["entity_id"] = entity_id
    if action:
        q["action"] = action
    if user_id:
        q["user_id"] = user_id
    rows = await db.audit_log.find(q, {"_id": 0}).sort([("ts", -1)]).limit(limit).to_list(length=limit)
    return {"rows": rows, "count": len(rows)}


@router.get("/audit-log/entity/{entity}/{entity_id}")
async def get_entity_history(entity: str, entity_id: str, _user: dict = Depends(get_current_finance_reader)):
    """Pelna historia zmian konkretnego rekordu (od najnowszej)."""
    rows = await db.audit_log.find(
        {"entity": entity, "entity_id": entity_id},
        {"_id": 0},
    ).sort([("ts", -1)]).to_list(length=500)
    return {"rows": rows}


@router.post("/audit-log/restore")
async def restore_record(payload: dict, current_user: dict = Depends(get_current_admin)):
    """Przywraca miekko-usuniety rekord (deleted_at -> None).

    Body: {"entity": "finance_zapis", "entity_id": "..."}
    """
    entity = payload.get("entity")
    entity_id = payload.get("entity_id")
    if not entity or not entity_id:
        raise HTTPException(400, "entity i entity_id sa wymagane")
    coll = _ENTITY_TO_COLLECTION.get(entity)
    if not coll:
        raise HTTPException(400, f"Nieznany typ rekordu: {entity}")
    restored = await restore_soft_deleted(coll, entity_id, current_user, entity_label=entity)
    if not restored:
        raise HTTPException(404, "Rekord nie istnieje lub nie jest usuniety")
    return {"ok": True, "restored": restored}


@router.get("/audit-log/deleted")
async def list_soft_deleted(
    entity: Optional[str] = None,
    days: int = Query(90, ge=1, le=365),
    _user: dict = Depends(get_current_admin),
):
    """Lista miekko-usunietych rekordow z ostatnich N dni. Pozwala je przywrocic.

    Skanuje 3 kolekcje finansowe.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    entities = [entity] if entity else list(_ENTITY_TO_COLLECTION.keys())
    for ent_label in entities:
        coll_name = _ENTITY_TO_COLLECTION.get(ent_label)
        if not coll_name:
            continue
        async for d in db[coll_name].find(
            {"deleted_at": {"$gte": cutoff}},
            {"_id": 0},
        ).sort([("deleted_at", -1)]).limit(500):
            out.append({"entity": ent_label, "record": d})
    return {"rows": out, "count": len(out)}
