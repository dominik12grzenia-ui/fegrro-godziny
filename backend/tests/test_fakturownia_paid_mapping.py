"""Test mapowania statusu platnosci z Fakturowni do finance_invoices.

Fakturownia API zwraca pola:
 - status: "paid" / "new" / "sent" / "partial" / "overdue" / "cancelled"
 - paid_date: "YYYY-MM-DD" (kiedy zaplacono)
 - paid_at: timestamp (alternatywa)
 - payment_to: "YYYY-MM-DD" (termin platnosci)

WAZNE: NIE istnieje pole 'payment_date' - wczesniej zle uzywany, przez co
WSZYSTKIE faktury mialy paid=False.
"""


def _derive_paid(inv: dict):
    """Replikuje logike z routes/finance.py _do_fakturownia_sync."""
    status_val = (inv.get("status") or "").lower()
    paid_date_val = inv.get("paid_date") or inv.get("payment_date") or None
    if not paid_date_val and inv.get("paid_at"):
        paid_date_val = str(inv["paid_at"])[:10]
    is_paid = status_val == "paid" or bool(paid_date_val)
    return is_paid, paid_date_val


def test_status_paid_marks_invoice_paid():
    inv = {"status": "paid", "payment_to": "2026-05-15"}
    paid, pdate = _derive_paid(inv)
    assert paid is True
    assert pdate is None


def test_paid_date_marks_invoice_paid():
    inv = {"status": "issued", "paid_date": "2026-05-10", "payment_to": "2026-05-15"}
    paid, pdate = _derive_paid(inv)
    assert paid is True
    assert pdate == "2026-05-10"


def test_paid_at_fallback_extracts_date_only():
    inv = {"status": "new", "paid_at": "2026-05-10 12:34:56", "payment_to": "2026-05-15"}
    paid, pdate = _derive_paid(inv)
    assert paid is True
    assert pdate == "2026-05-10"


def test_unpaid_invoice_not_paid():
    inv = {"status": "new", "payment_to": "2026-05-15"}
    paid, pdate = _derive_paid(inv)
    assert paid is False
    assert pdate is None


def test_overdue_status_still_unpaid():
    inv = {"status": "overdue", "payment_to": "2026-04-01"}
    paid, pdate = _derive_paid(inv)
    assert paid is False
    assert pdate is None


def test_case_insensitive_status():
    inv = {"status": "PAID", "paid_date": "2026-05-10"}
    paid, pdate = _derive_paid(inv)
    assert paid is True
    assert pdate == "2026-05-10"
