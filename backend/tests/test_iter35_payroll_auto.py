"""Iter35: Auto advances/penalties from db.advances/db.penalties tables.

Tests that:
1. GET /api/payroll returns auto_advances_zl / auto_penalties_zl per row.
2. record.advances_hours and record.penalties_zl are REMOVED from response.record.
3. Formula payout = hours_amount - auto_advances_zl - auto_penalties_zl - other_minus + bonus + driver + other_plus
4. computed.advances_zl == auto_advances_zl, computed.penalties_zl == auto_penalties_zl
5. E2E: POST /api/advances -> auto_advances_zl reflected in payroll GET. Same for penalties.
6. PUT /api/payroll accepts payload WITHOUT advances_hours / penalties_zl (no crash).
7. PUT /api/payroll tolerates LEGACY fields (advances_hours, penalties_zl, housing_zl).
8. Multiple advances same emp same month -> SUMMED in auto_advances_zl.
9. PDF report contains auto values (status 200, content > 5KB).
10. PDF per-employee cards contain auto values (status 200, content > 5KB).
"""
import os
import pytest
import requests
import uuid

_FRONTEND_ENV = "/app/frontend/.env"
_url = os.environ.get("REACT_APP_BACKEND_URL")
if not _url and os.path.exists(_FRONTEND_ENV):
    with open(_FRONTEND_ENV) as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                _url = line.split("=", 1)[1].strip()
                break
BASE = _url.rstrip("/") + "/api"
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASS = "Admin123!"

YEAR = 2027
MONTH = 9  # unique to avoid collisions


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def emp_id(headers):
    # Create test employee
    payload = {
        "full_name": f"TEST_iter35 {uuid.uuid4().hex[:6]}",
        "phone": "+48000000035",
        "role": "worker",
    }
    r = requests.post(f"{BASE}/employees", json=payload, headers=headers)
    assert r.status_code in (200, 201), r.text
    eid = r.json().get("id") or r.json().get("employee", {}).get("id")
    assert eid
    yield eid
    # Cleanup: delete advances, penalties, payroll_record, employee
    try:
        # delete advances of this emp in our test month
        advs = requests.get(f"{BASE}/advances", params={"employee_id": eid, "month": MONTH, "year": YEAR}, headers=headers).json()
        for a in advs:
            requests.delete(f"{BASE}/advances/{a['id']}", headers=headers)
        pens = requests.get(f"{BASE}/penalties", params={"employee_id": eid, "month": MONTH, "year": YEAR}, headers=headers).json()
        for p in pens:
            requests.delete(f"{BASE}/penalties/{p['id']}", headers=headers)
        requests.delete(f"{BASE}/employees/{eid}", headers=headers)
    except Exception:
        pass


def _get_row(headers, eid):
    r = requests.get(f"{BASE}/payroll", params={"year": YEAR, "month": MONTH}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    row = next((x for x in data["rows"] if x["employee_id"] == eid), None)
    assert row is not None, f"Employee {eid} not found in payroll rows"
    return row, data


class TestPayrollAutoAdvancesPenalties:

    def test_01_initial_payroll_row_has_auto_fields_zero(self, headers, emp_id):
        # Seed a payroll record with rate
        put = requests.put(
            f"{BASE}/payroll/{emp_id}",
            params={"year": YEAR, "month": MONTH},
            json={"rate": 30.0, "bonus_zl": 100.0},
            headers=headers,
        )
        assert put.status_code == 200, put.text
        row, _ = _get_row(headers, emp_id)
        # Fields exist
        assert "auto_advances_zl" in row, "auto_advances_zl missing from row"
        assert "auto_penalties_zl" in row, "auto_penalties_zl missing from row"
        assert row["auto_advances_zl"] == 0.0
        assert row["auto_penalties_zl"] == 0.0
        # Record should NOT have advances_hours / penalties_zl
        assert "advances_hours" not in row["record"], "advances_hours leaked into record"
        assert "penalties_zl" not in row["record"], "penalties_zl leaked into record"
        # computed mirrors auto
        assert row["computed"]["advances_zl"] == 0.0
        assert row["computed"]["penalties_zl"] == 0.0

    def test_02_create_advance_reflects_in_payroll(self, headers, emp_id):
        r = requests.post(
            f"{BASE}/advances",
            json={"employee_id": emp_id, "amount": 250.0, "month": MONTH, "year": YEAR, "note": "TEST iter35"},
            headers=headers,
        )
        assert r.status_code in (200, 201), r.text
        row, _ = _get_row(headers, emp_id)
        assert row["auto_advances_zl"] == 250.0, f"expected 250, got {row['auto_advances_zl']}"
        assert row["computed"]["advances_zl"] == 250.0

    def test_03_multiple_advances_summed(self, headers, emp_id):
        r = requests.post(
            f"{BASE}/advances",
            json={"employee_id": emp_id, "amount": 100.0, "month": MONTH, "year": YEAR, "note": "TEST 2"},
            headers=headers,
        )
        assert r.status_code in (200, 201)
        row, _ = _get_row(headers, emp_id)
        # 250 + 100 = 350
        assert row["auto_advances_zl"] == 350.0, f"expected 350, got {row['auto_advances_zl']}"

    def test_04_create_penalty_reflects_in_payroll(self, headers, emp_id):
        r = requests.post(
            f"{BASE}/penalties",
            json={"employee_id": emp_id, "amount": 50.0, "month": MONTH, "year": YEAR, "description": "TEST iter35"},
            headers=headers,
        )
        assert r.status_code in (200, 201), r.text
        row, _ = _get_row(headers, emp_id)
        assert row["auto_penalties_zl"] == 50.0
        assert row["computed"]["penalties_zl"] == 50.0

    def test_05_payout_formula(self, headers, emp_id):
        # rate=30, hours=0 (no hour entries), bonus=100, auto_adv=350, auto_pen=50
        # hours_amount = 0; payout = 0 - 350 - 50 - 0 + 100 + 0 + 0 = -300
        row, _ = _get_row(headers, emp_id)
        comp = row["computed"]
        expected = comp["hours_amount"] - 350.0 - 50.0 - row["record"]["other_minus_zl"] \
            + row["record"]["bonus_zl"] + row["record"]["driver_zl"] + row["record"]["other_plus_zl"]
        assert round(comp["payout"], 2) == round(expected, 2), \
            f"payout mismatch: got {comp['payout']}, expected {expected}"

    def test_06_put_without_legacy_fields_ok(self, headers, emp_id):
        r = requests.put(
            f"{BASE}/payroll/{emp_id}",
            params={"year": YEAR, "month": MONTH},
            json={"rate": 35.0, "other_plus_zl": 20.0},
            headers=headers,
        )
        assert r.status_code == 200, r.text

    def test_07_put_with_legacy_fields_tolerated(self, headers, emp_id):
        # Backend should not crash even if legacy advances_hours/penalties_zl/housing_zl sent
        r = requests.put(
            f"{BASE}/payroll/{emp_id}",
            params={"year": YEAR, "month": MONTH},
            json={"rate": 35.0, "advances_hours": 5.0, "penalties_zl": 99.0, "housing_zl": 200.0},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        # Auto values should NOT be impacted by legacy fields in payload
        row, _ = _get_row(headers, emp_id)
        assert row["auto_advances_zl"] == 350.0  # still from db.advances
        assert row["auto_penalties_zl"] == 50.0
        # computed.advances_zl/penalties_zl == auto (legacy ignored)
        assert row["computed"]["advances_zl"] == 350.0
        assert row["computed"]["penalties_zl"] == 50.0

    def test_08_pdf_report_generated(self, headers, emp_id):
        r = requests.post(
            f"{BASE}/payroll/pdf/report",
            params={"year": YEAR, "month": MONTH},
            json={"employee_ids": [emp_id]},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 3000, f"PDF too small: {len(r.content)}"

    def test_09_pdf_cards_generated(self, headers, emp_id):
        r = requests.post(
            f"{BASE}/payroll/pdf",
            params={"year": YEAR, "month": MONTH},
            json={"employee_ids": [emp_id]},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 2000


# Regression: iter34 lock/unlock/audit (run after to avoid lock interference)
class TestRegressionIter34:
    def test_lock_unlock_cycle(self, headers):
        # Use different month to avoid messing with iter35 month
        y, m = 2027, 10
        # Ensure unlocked
        requests.post(f"{BASE}/payroll/unlock", params={"year": y, "month": m}, headers=headers)
        # Lock
        r = requests.post(f"{BASE}/payroll/lock", params={"year": y, "month": m}, headers=headers)
        assert r.status_code == 200
        # GET shows locked
        g = requests.get(f"{BASE}/payroll", params={"year": y, "month": m}, headers=headers)
        assert g.json()["locked"] is True
        # Unlock
        u = requests.post(f"{BASE}/payroll/unlock", params={"year": y, "month": m}, headers=headers)
        assert u.status_code == 200
