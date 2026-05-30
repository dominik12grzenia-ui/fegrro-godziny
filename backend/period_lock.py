"""Okresy ksiegowe - zamykanie/odblokowanie miesiecy + walidacja inwariantow.

iter95bp: Pakiet B - integralnosc danych.

Funkcjonalnosc:
- Admin moze "zamknac" miesiac (year, month) - dane finansowe sa zablokowane przed edycja
- Lock dotyczy: finance_zapisy + finance_invoices w danym okresie
- Edycja zablokowanych rekordow rzuca HTTPException 423 Locked
- Odblokowanie wymaga rownie wysokich uprawnien (admin)

Sklad zapisu w db.finance_periods:
    {year: 2026, month: 5, status: 'closed', closed_at, closed_by, closed_by_name}
"""
import logging
from datetime import datetime, timezone
from fastapi import HTTPException
from typing import Optional

from database import db

logger = logging.getLogger(__name__)


async def is_period_locked(year: int, month: int) -> bool:
    """Zwraca True jezeli miesiac jest zamkniety (read-only)."""
    if year is None or month is None:
        return False
    doc = await db.finance_periods.find_one(
        {"year": int(year), "month": int(month), "status": "closed"},
        {"_id": 0, "status": 1},
    )
    return doc is not None


async def assert_period_open(year: int, month: int, action: str = "edytowac"):
    """Rzuca HTTPException 423 jezeli okres jest zamkniety."""
    if await is_period_locked(year, month):
        raise HTTPException(
            status_code=423,
            detail=f"Miesiac {month:02d}/{year} jest zamkniety - nie mozna {action} zapisow. "
                   f"Otworz okres w panelu Finanse > Okresy.",
        )


def parse_date_to_period(date_str: str) -> tuple:
    """Zwraca (year, month) z stringa YYYY-MM-DD. Lub (None, None) gdy invalid."""
    if not date_str:
        return None, None
    try:
        d = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return d.year, d.month
    except (ValueError, TypeError):
        return None, None


# === Walidacja invariant finansowych ===

async def validate_invoice_integrity(invoice_id: str, tolerance: float = 0.01) -> dict:
    """Sprawdza ze suma pozycji = netto faktury (z tolerancja 1 grosza).

    Zwraca dict z polami: ok (bool), netto_invoice, sum_positions, diff.
    """
    inv = await db.finance_invoices.find_one({"id": invoice_id}, {"_id": 0, "netto": 1})
    if not inv:
        return {"ok": False, "error": "Faktura nie znaleziona"}
    netto = float(inv.get("netto") or 0)
    positions = await db.finance_zapisy.find(
        {"parent_invoice_id": invoice_id, "deleted_at": None},
        {"_id": 0, "netto": 1, "kod_id": 1},
    ).to_list(length=None)
    sum_pos = sum(float(p.get("netto") or 0) for p in positions if p.get("kod_id"))
    diff = round(netto - sum_pos, 2)
    return {
        "ok": abs(diff) <= tolerance,
        "netto_invoice": netto,
        "sum_positions": round(sum_pos, 2),
        "diff": diff,
        "positions_count": len(positions),
    }
