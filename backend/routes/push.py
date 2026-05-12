"""Web Push notifications (VAPID + pywebpush).

Workflow:
- Frontend requests Notification permission, subscribes via PushManager,
  POSTs the subscription to /api/push/subscribe (one per device).
- send_push(user_id, title, body, url) is invoked from existing event flows
  (new order, absence request, equipment issued, etc.) and pushes to ALL
  active subscriptions of that user.
- Invalid (410 Gone / 404) subscriptions are auto-deactivated.

VAPID keys live in backend/.env; they must NEVER be regenerated in
production or all clients will silently stop receiving notifications.
"""
import json
import logging
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import db
from auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


# --- VAPID config (lazily loaded so missing env doesn't crash the import) ---
def _vapid_claims():
    return {"sub": os.environ.get("VAPID_SUBJECT", "mailto:biuro@fegrro.pl")}


def _vapid_private():
    return os.environ.get("VAPID_PRIVATE_KEY")


def _vapid_public():
    return os.environ.get("VAPID_PUBLIC_KEY")


# --- Schemas ---
class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribePayload(BaseModel):
    endpoint: str
    keys: PushKeys
    user_agent: Optional[str] = None


# --- Endpoints ---
@router.get("/push/vapid-key")
async def get_vapid_public_key():
    """Return the VAPID public key (safe to expose).
    Frontend uses this to subscribe to PushManager.
    """
    pub = _vapid_public()
    if not pub:
        raise HTTPException(status_code=500, detail="VAPID_PUBLIC_KEY not configured")
    return {"public_key": pub}


@router.post("/push/subscribe")
async def subscribe_push(
    payload: PushSubscribePayload,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Register (or update) a push subscription for the current user.

    Idempotent on (user_id, endpoint): re-subscribing the same browser
    updates the auth/p256dh keys and timestamps without duplicating rows.
    """
    user_id = current_user["sub"]
    ua = payload.user_agent or request.headers.get("User-Agent", "")
    doc = {
        "user_id": user_id,
        "role": current_user.get("role"),
        "endpoint": payload.endpoint,
        "p256dh": payload.keys.p256dh,
        "auth": payload.keys.auth,
        "user_agent": ua[:300],
        "is_active": True,
        "last_used": datetime.now().isoformat(),
    }
    existing = await db.push_subscriptions.find_one(
        {"user_id": user_id, "endpoint": payload.endpoint}, {"_id": 1}
    )
    if existing:
        await db.push_subscriptions.update_one(
            {"_id": existing["_id"]}, {"$set": doc}
        )
        return {"status": "updated"}
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now().isoformat()
    await db.push_subscriptions.insert_one(doc)
    return {"status": "created", "id": doc["id"]}


@router.delete("/push/unsubscribe")
async def unsubscribe_push(
    endpoint: str,
    current_user: dict = Depends(get_current_user),
):
    res = await db.push_subscriptions.delete_one(
        {"user_id": current_user["sub"], "endpoint": endpoint}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Subskrypcja nie znaleziona")
    return {"status": "deleted"}


@router.post("/push/test")
async def push_test(current_user: dict = Depends(get_current_user)):
    """Send a test push to the current user (for the 'Test powiadomien' button)."""
    res = await send_push(
        user_id=current_user["sub"],
        title="FeGrro - test powiadomien",
        body="Powiadomienia push dzialaja poprawnie!",
        url="/",
    )
    return res


# --- Core sender ---
async def send_push(
    user_id: str,
    title: str,
    body: str,
    url: str = "/",
    tag: Optional[str] = None,
    require_interaction: bool = False,
) -> dict:
    """Push to every active subscription belonging to user_id.

    Safe to call from anywhere - errors are caught and logged. Invalid
    subscriptions (HTTP 404/410) are auto-deactivated so they aren't
    retried on future pushes.
    """
    priv = _vapid_private()
    if not priv:
        logger.info("VAPID_PRIVATE_KEY not configured - skip push")
        return {"sent": 0, "failed": 0, "skipped": "no_vapid"}
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("pywebpush not installed - cannot send push")
        return {"sent": 0, "failed": 0, "skipped": "no_lib"}

    subs = await db.push_subscriptions.find(
        {"user_id": user_id, "is_active": True}, {"_id": 0}
    ).to_list(50)
    if not subs:
        return {"sent": 0, "failed": 0}

    payload = {
        "title": title,
        "body": body,
        "url": url,
        "tag": tag or "fegrro",
        "requireInteraction": bool(require_interaction),
        "timestamp": datetime.now().isoformat(),
    }
    payload_json = json.dumps(payload)
    sent, failed = 0, 0
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                },
                data=payload_json,
                vapid_private_key=priv,
                vapid_claims=_vapid_claims(),
            )
            sent += 1
            await db.push_subscriptions.update_one(
                {"endpoint": sub["endpoint"], "user_id": user_id},
                {"$set": {"last_used": datetime.now().isoformat()}},
            )
        except WebPushException as e:
            failed += 1
            status = getattr(e.response, "status_code", None) if e.response is not None else None
            logger.warning(f"push fail (status={status}): {e}")
            if status in (404, 410):
                await db.push_subscriptions.update_one(
                    {"endpoint": sub["endpoint"], "user_id": user_id},
                    {"$set": {"is_active": False, "deactivated_at": datetime.now().isoformat()}},
                )
        except Exception as e:
            failed += 1
            logger.warning(f"push exception: {e}")
    return {"sent": sent, "failed": failed}


async def send_push_to_admins(title: str, body: str, url: str = "/admin/dashboard", tag: Optional[str] = None) -> dict:
    """Push to all users with role=admin. Used for foreman-originated events."""
    sent_total, failed_total = 0, 0
    admins = db.users.find({"role": "admin"}, {"_id": 0, "id": 1})
    async for a in admins:
        r = await send_push(a["id"], title, body, url, tag=tag)
        sent_total += r.get("sent", 0)
        failed_total += r.get("failed", 0)
    return {"sent": sent_total, "failed": failed_total}
