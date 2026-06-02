"""iter95cu: AI text polish dla wycen (Claude Haiku 4.5).

Endpoint: POST /api/wyceny/ai/polish
Body: { "text": "rurka pcv 110 + studnia rewizyjna fi 400", "kind": "name" | "description" }
Response: { "polished": "Rura PCV ø110 mm + studnia rewizyjna ø400 mm" }

Cel: skroty/literowki/slang budowlany -> czysta, profesjonalna terminologia
zachowujaca jednostki, wymiary, nazwy techniczne. Krotkie odpowiedzi (1-3 zdania).
"""
from __future__ import annotations
import logging
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_admin

logger = logging.getLogger(__name__)
router = APIRouter()


class PolishRequest(BaseModel):
    text: str = Field(..., max_length=2000)
    kind: str = Field("name", pattern="^(name|description|notes)$")


class PolishResponse(BaseModel):
    polished: str
    original: str


_SYSTEM_PROMPTS = {
    "name": (
        "Jesteś ekspertem terminologii budowlanej. Otrzymujesz krótką nazwę pozycji wyceny "
        "budowlanej w języku polskim — często ze skrótami, literówkami lub potocznym językiem. "
        "Zwróć tę nazwę poprawioną: profesjonalna polska budowlana terminologia, poprawna ortografia "
        "i interpunkcja, zachowane jednostki (mm, m², m³, mb, szt.) i wymiary (ø, średnice, klasy). "
        "Maksymalnie 1 zdanie. NIE dodawaj komentarzy, opisów, kontekstu — tylko poprawiony tekst. "
        "Nie zmieniaj sensu ani liczb. Jeśli wejście jest już poprawne, zwróć je bez zmian."
    ),
    "description": (
        "Jesteś ekspertem terminologii budowlanej. Otrzymujesz opis pozycji wyceny budowlanej w PL. "
        "Popraw: ortografia, interpunkcja, profesjonalna stylistyka i terminologia. Zachowaj wszystkie "
        "liczby, jednostki, normy i odniesienia techniczne. Maksymalnie 2-3 zdania. NIE dodawaj treści "
        "spoza oryginału. Zwróć wyłącznie poprawiony tekst."
    ),
    "notes": (
        "Popraw poniższą notatkę w języku polskim: ortografia, interpunkcja, profesjonalny ton. "
        "Zachowaj wszystkie fakty, liczby i odniesienia. Zwróć wyłącznie poprawioną treść."
    ),
}


@router.post("/wyceny/ai/polish", response_model=PolishResponse)
async def polish_text(body: PolishRequest, _user: dict = Depends(get_current_admin)):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Pusty tekst")
    if len(text) < 2:
        return PolishResponse(polished=text, original=text)

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="LLM klucz nie skonfigurowany (EMERGENT_LLM_KEY)")

    try:
        # Lazy import — biblioteka jest opcjonalna i jej brak nie powinien wywalac calego routera przy starcie
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except Exception as e:
        logger.exception("emergentintegrations import failed")
        raise HTTPException(status_code=503, detail=f"LLM lib brak: {e}")

    system_prompt = _SYSTEM_PROMPTS.get(body.kind, _SYSTEM_PROMPTS["name"])
    session_id = f"polish-{uuid.uuid4().hex[:12]}"

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=system_prompt,
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        response = await chat.send_message(UserMessage(text=text))
        polished = (response or "").strip()
        # Niektore modele potrafia opakowac odpowiedz w cudzyslowy — strip
        if len(polished) >= 2 and polished[0] in ('"', "'", "„") and polished[-1] in ('"', "'", "”"):
            polished = polished[1:-1].strip()
        if not polished:
            polished = text
        return PolishResponse(polished=polished, original=text)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("AI polish failed text=%s", text[:100])
        raise HTTPException(status_code=500, detail=f"AI polish blad: {type(e).__name__}: {str(e)[:200]}")
