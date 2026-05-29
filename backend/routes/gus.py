"""
GUS / Biała Lista MF — endpoint do auto-pobierania danych firmy po NIP.

Używamy publicznego API Białej Listy Ministerstwa Finansów (bez klucza):
  https://wl-api.mf.gov.pl/api/search/nip/{nip}?date=YYYY-MM-DD

Zwracane dane: nazwa firmy, adres siedziby, NIP, REGON, KRS, status (czynny/zwolniony).
"""
from datetime import date
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException

from routes.auth import get_current_admin

router = APIRouter()

WL_BASE = "https://wl-api.mf.gov.pl/api/search/nip"


def _clean_nip(nip: str) -> str:
    return "".join(ch for ch in (nip or "") if ch.isdigit())


@router.get("/gus/{nip}")
async def lookup_company_by_nip(nip: str, _user: dict = Depends(get_current_admin)):
    """Pobiera dane firmy z Białej Listy MF po NIP.

    Zwraca:
        {
          "found": True,
          "nip": "1234567890",
          "name": "ACME Sp. z o.o.",
          "address": "ul. Przykładowa 12, 00-001 Warszawa",
          "regon": "...",
          "krs": "...",
          "status": "Czynny"
        }
    """
    clean = _clean_nip(nip)
    if len(clean) != 10:
        raise HTTPException(status_code=400, detail="NIP musi zawierać 10 cyfr")

    today = date.today().isoformat()
    url = f"{WL_BASE}/{clean}?date={today}"
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "FeGrro-ERP/1.0 (+contact: admin@fegrro.pl)",
                },
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Błąd połączenia z API MF: {exc}")

    if resp.status_code == 400:
        raise HTTPException(status_code=400, detail="Nieprawidłowy NIP (odrzucony przez API MF)")
    if resp.status_code == 404:
        return {"found": False, "nip": clean, "message": "Nie znaleziono firmy o tym NIP"}
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"API MF zwróciło {resp.status_code}")

    payload = resp.json() or {}
    subject = (payload.get("result") or {}).get("subject")
    if not subject:
        return {"found": False, "nip": clean, "message": "Nie znaleziono firmy o tym NIP"}

    name: Optional[str] = subject.get("name")
    address_parts = [
        subject.get("workingAddress") or subject.get("residenceAddress") or ""
    ]
    address = ", ".join(p for p in address_parts if p)

    return {
        "found": True,
        "nip": clean,
        "name": name,
        "address": address,
        "regon": subject.get("regon"),
        "krs": subject.get("krs"),
        "status": subject.get("statusVat"),
        "raw": {
            "registrationLegalDate": subject.get("registrationLegalDate"),
            "workingAddress": subject.get("workingAddress"),
            "residenceAddress": subject.get("residenceAddress"),
        },
    }
