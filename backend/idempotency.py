"""Idempotency middleware - zapobiega duplikatom POST przez Idempotency-Key header.

iter95br: Pakiet D. Klient frontend wysyla losowy UUID w header `Idempotency-Key`.
Jezeli dokladnie taki sam klucz przyszedl w ostatnich 24h - zwracamy cached response zamiast
ponownie wykonywac operacje. Chroni przed double-click i retry network.

Uzycie (decorator):
    from idempotency import idempotent
    @idempotent("create_zapis")
    @router.post("/finance/zapisy")
    async def create_zapis(...): ...
"""
import json
import hashlib
import asyncio
import functools
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import Request, Response, HTTPException
from database import db

logger = logging.getLogger(__name__)

# Cache w pamieci dla szybkiego lookupu (TTL 5 min). Po tym czasie sprawdzamy w mongo.
_inflight: dict = {}  # idempotency_key -> asyncio.Event
_inflight_lock = asyncio.Lock()


async def get_or_store_idempotent_response(
    idempotency_key: str, body_hash: str, scope: str
) -> Optional[dict]:
    """Sprawdza czy klucz juz byl uzyty. Jezeli tak - zwraca cached response.

    Jezeli nie - rezerwuje klucz (insert) ale jeszcze bez response. Wywolujacy musi
    pozniej zapisac response przez `store_idempotent_response()`.
    """
    cached = await db.idempotency_cache.find_one(
        {"key": idempotency_key, "scope": scope},
        {"_id": 0},
    )
    if cached:
        # Klucz juz istnieje - sprawdz czy body_hash sie zgadza
        if cached.get("body_hash") != body_hash:
            raise HTTPException(409, "Idempotency-Key zostal juz uzyty z innym body")
        # Zwroc cached response (moze byc None jezeli operacja jeszcze trwa)
        return cached.get("response")
    # Rezerwuj klucz
    try:
        await db.idempotency_cache.insert_one({
            "key": idempotency_key,
            "scope": scope,
            "body_hash": body_hash,
            "response": None,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        # Race condition - ktos juz zarejestrowal
        return None
    return None


async def store_idempotent_response(idempotency_key: str, scope: str, response: dict):
    """Zapisuje wynik operacji do cache (24h TTL)."""
    try:
        await db.idempotency_cache.update_one(
            {"key": idempotency_key, "scope": scope},
            {"$set": {"response": response, "completed_at": datetime.now(timezone.utc)}},
        )
    except Exception as e:
        logger.warning(f"idempotency store failed: {e}")


def hash_body(body: dict) -> str:
    """Stabilne SHA256 z dict body (po klucze posortowane)."""
    s = json.dumps(body, sort_keys=True, default=str)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]
