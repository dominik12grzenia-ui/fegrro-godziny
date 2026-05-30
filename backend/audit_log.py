"""Audit log helpers - centralny modul rejestracji zmian w danych finansowych.

iter95bo: Pakiet A - audit trail. Kazda zmiana w finance_zapisy/invoices/budowy
zapisywana w `audit_log` z polami: kto, kiedy, co, stary, nowy.

Uzycie:
    from audit_log import log_audit, soft_delete_filter

    # Wpis - dodanie nowego rekordu
    await log_audit(entity="finance_zapis", entity_id=z["id"], action="create",
                    user=current_user, new=z)

    # Wpis - update z diff
    await log_audit(entity="finance_zapis", entity_id=z["id"], action="update",
                    user=current_user, old=old_doc, new=new_doc)

    # Wpis - soft-delete
    await log_audit(entity="finance_zapis", entity_id=z["id"], action="delete",
                    user=current_user, old=old_doc)
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from database import db


# Pola ktore ignorujemy w diff (techniczne, nieinteresujace dla audytu)
_IGNORED_FIELDS = {"_id", "updated_at", "created_at", "deleted_at", "deleted_by"}


def _diff(old: Optional[Dict[str, Any]], new: Optional[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Zwraca slownik {pole: {old: val, new: val}} dla wszystkich zmienionych pol."""
    diff = {}
    # Usun _id (ObjectId nie jest JSON-serializable)
    old = {k: v for k, v in (old or {}).items() if k != "_id"}
    new = {k: v for k, v in (new or {}).items() if k != "_id"}
    if not old and not new:
        return diff
    if not old:
        for k, v in new.items():
            if k not in _IGNORED_FIELDS:
                diff[k] = {"old": None, "new": v}
        return diff
    if not new:
        for k, v in old.items():
            if k not in _IGNORED_FIELDS:
                diff[k] = {"old": v, "new": None}
        return diff
    # Obie strony
    keys = set(old.keys()) | set(new.keys())
    for k in keys:
        if k in _IGNORED_FIELDS:
            continue
        ov, nv = old.get(k), new.get(k)
        if ov != nv:
            diff[k] = {"old": ov, "new": nv}
    return diff


async def log_audit(
    entity: str,
    entity_id: str,
    action: str,  # "create" | "update" | "delete" | "restore"
    user: dict,
    old: Optional[dict] = None,
    new: Optional[dict] = None,
    extra: Optional[dict] = None,
) -> None:
    """Zapisuje wpis audytu w kolekcji `audit_log`.

    Nigdy nie rzuca wyjatku - audyt nie moze blokowac glownej operacji.
    """
    try:
        # Usun _id (ObjectId nie jest JSON-serializable przez FastAPI)
        old_clean = {k: v for k, v in (old or {}).items() if k != "_id"} if old else None
        new_clean = {k: v for k, v in (new or {}).items() if k != "_id"} if new else None
        entry = {
            "id": str(uuid.uuid4()),
            "entity": entity,
            "entity_id": entity_id,
            "action": action,
            "user_id": user.get("sub") if user else "system",
            "user_name": user.get("full_name") or user.get("email") or user.get("sub") if user else "system",
            "user_role": user.get("role") if user else "system",
            "ts": datetime.now(timezone.utc),
            "diff": _diff(old_clean, new_clean) if action == "update" else None,
            "snapshot": (new_clean if action in ("create", "restore") else old_clean) if action != "update" else None,
        }
        if extra:
            entry["extra"] = extra
        await db.audit_log.insert_one(entry)
    except Exception as e:  # noqa: BLE001
        # Nie chcemy blokowac glownej operacji przez bledy audytu
        import logging
        logging.warning(f"audit_log failed for {entity}/{entity_id}/{action}: {e}")


def soft_delete_filter(include_deleted: bool = False) -> dict:
    """Zwraca filtr MongoDB ktory domyslnie ukrywa miekko-usunete rekordy.

    iter95bo: soft-delete = ustawiamy `deleted_at` i `deleted_by` zamiast fizycznie kasowac.

    Uzycie:
        await db.finance_zapisy.find({**soft_delete_filter(), "budowa_id": "X"})
    """
    if include_deleted:
        return {}
    return {"deleted_at": None}


async def soft_delete(collection_name: str, entity_id: str, user: dict, entity_label: str) -> Optional[dict]:
    """Wykonuje soft-delete: ustawia deleted_at + zapisuje audyt.

    Zwraca skasowany dokument (przed update'em) lub None gdy nie znaleziono.
    """
    coll = db[collection_name]
    old = await coll.find_one({"id": entity_id, **soft_delete_filter()})
    if not old:
        return None
    now = datetime.now(timezone.utc)
    await coll.update_one(
        {"id": entity_id},
        {"$set": {
            "deleted_at": now,
            "deleted_by": user.get("sub") if user else "system",
            "deleted_by_name": user.get("full_name") or user.get("email") if user else "system",
        }},
    )
    await log_audit(entity=entity_label, entity_id=entity_id, action="delete", user=user, old=old)
    return old


async def restore_soft_deleted(collection_name: str, entity_id: str, user: dict, entity_label: str) -> Optional[dict]:
    """Przywraca soft-deleted rekord (czysci deleted_at)."""
    coll = db[collection_name]
    old = await coll.find_one({"id": entity_id, "deleted_at": {"$ne": None}})
    if not old:
        return None
    await coll.update_one(
        {"id": entity_id},
        {"$unset": {"deleted_at": "", "deleted_by": "", "deleted_by_name": ""}},
    )
    restored = await coll.find_one({"id": entity_id}, {"_id": 0})
    await log_audit(entity=entity_label, entity_id=entity_id, action="restore", user=user, new=restored)
    return restored
