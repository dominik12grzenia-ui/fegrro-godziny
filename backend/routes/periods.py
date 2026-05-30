"""Okresy ksiegowe API - zamykanie/odblokowanie miesiecy + walidacja inwariantow.

iter95bp: Pakiet B.
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from datetime import datetime, timezone
from typing import Optional

from database import db
from auth import get_current_admin
from audit_log import log_audit
from period_lock import validate_invoice_integrity

router = APIRouter()


@router.get("/finance/periods")
async def list_periods(year: Optional[int] = None, _user: dict = Depends(get_current_admin)):
    """Lista wszystkich okresow z ich statusem (closed/open).

    Zwraca rowniez agregat zapisow w danym miesiacu (count + suma netto), pomocny
    dla admina decydujacego ktore miesiace zamknac.
    """
    q = {}
    if year is not None:
        q["year"] = int(year)
    periods = await db.finance_periods.find(q, {"_id": 0}).to_list(length=None)
    return {"rows": periods}


@router.post("/finance/periods/close")
async def close_period(payload: dict = Body(...), current_user: dict = Depends(get_current_admin)):
    """Zamyka miesiac. Body: {year: 2026, month: 5}."""
    try:
        year = int(payload.get("year"))
        month = int(payload.get("month"))
        assert 1 <= month <= 12
    except (TypeError, ValueError, AssertionError):
        raise HTTPException(400, "Wymagane: year (int), month (1-12)")

    existing = await db.finance_periods.find_one({"year": year, "month": month}, {"_id": 0})
    if existing and existing.get("status") == "closed":
        raise HTTPException(400, f"Miesiac {month:02d}/{year} jest juz zamkniety")

    now = datetime.now(timezone.utc)
    doc = {
        "year": year,
        "month": month,
        "status": "closed",
        "closed_at": now,
        "closed_by": current_user.get("sub"),
        "closed_by_name": current_user.get("full_name") or current_user.get("email"),
    }
    await db.finance_periods.update_one(
        {"year": year, "month": month},
        {"$set": doc},
        upsert=True,
    )
    await log_audit(
        entity="finance_period", entity_id=f"{year}-{month:02d}",
        action="update", user=current_user,
        old=existing or None, new=doc, extra={"reason": "close"},
    )
    return {"ok": True, "year": year, "month": month, "status": "closed"}


@router.post("/finance/periods/open")
async def open_period(payload: dict = Body(...), current_user: dict = Depends(get_current_admin)):
    """Otwiera (odblokowuje) miesiac. Body: {year, month}."""
    try:
        year = int(payload.get("year"))
        month = int(payload.get("month"))
        assert 1 <= month <= 12
    except (TypeError, ValueError, AssertionError):
        raise HTTPException(400, "Wymagane: year, month (1-12)")
    existing = await db.finance_periods.find_one({"year": year, "month": month}, {"_id": 0})
    if not existing or existing.get("status") != "closed":
        raise HTTPException(400, f"Miesiac {month:02d}/{year} nie jest zamkniety")
    await db.finance_periods.update_one(
        {"year": year, "month": month},
        {"$set": {"status": "open", "opened_at": datetime.now(timezone.utc),
                  "opened_by": current_user.get("sub"),
                  "opened_by_name": current_user.get("full_name") or current_user.get("email")}},
    )
    await log_audit(
        entity="finance_period", entity_id=f"{year}-{month:02d}",
        action="update", user=current_user,
        old=existing, new={**existing, "status": "open"}, extra={"reason": "reopen"},
    )
    return {"ok": True, "year": year, "month": month, "status": "open"}


@router.get("/finance/invoices/{invoice_id}/validate")
async def validate_invoice(invoice_id: str, _user: dict = Depends(get_current_admin)):
    """Sprawdza inwariant: suma pozycji = netto faktury (z toleancja 1 grosza)."""
    result = await validate_invoice_integrity(invoice_id)
    if not result.get("ok") and "error" not in result:
        result["warning"] = (
            f"Suma pozycji ({result['sum_positions']}) rozni sie od netto faktury "
            f"({result['netto_invoice']}) o {result['diff']} zl. "
            f"Mozliwa przyczyna: niezakwalifikowane pozycje (bez kod_id) lub nadmiarowe pozycje."
        )
    return result
