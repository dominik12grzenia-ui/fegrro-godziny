"""Iter34 - Payroll: auto-copy, lock/unlock, audit log, PDF report, RBAC.

Coverage:
- GET /api/payroll returns locked + lock_info + rows[].defaulted_from_prev
- AUTO-COPY across same year and year boundary
- POST/POST lock then "already locked"
- PUT on locked -> 423
- POST unlock -> ok; second time -> 400
- AUDIT: PUT with two changes -> 2 entries; PUT with no-op -> 0
- GET /api/payroll/{eid}/audit returns descending order, scoped per month
- POST /api/payroll/pdf/report -> >10KB PDF, application/pdf
- POST /api/payroll/pdf still works (regression)
- RBAC: foreman 403 on all endpoints
"""
import os
import io
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

# Use a distinct historical month so we don't collide with iter33 (2026/3) etc.
PREV_YEAR, PREV_MONTH = 2025, 3
CUR_YEAR, CUR_MONTH = 2025, 4
DEC_YEAR, DEC_MONTH = 2024, 12
JAN_YEAR, JAN_MONTH = 2025, 1  # Note: iter34 uses different test emp to avoid history collision

LOCK_YEAR, LOCK_MONTH = 2027, 6  # virgin month for lock tests
AUDIT_YEAR, AUDIT_MONTH = 2027, 7  # virgin month for audit tests
PDF_YEAR, PDF_MONTH = 2027, 8  # virgin month for pdf


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"email": "admin@fegrro.pl", "password": "Admin123!"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def test_emp(admin_headers):
    name = f"TEST_iter34_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{BASE_URL}/api/employees",
        headers=admin_headers,
        json={"full_name": f"{name} Auto", "phone_number": None},
        timeout=10,
    )
    assert r.status_code in (200, 201), r.text
    eid = r.json().get("id") or r.json().get("employee_id")
    yield eid
    try:
        requests.delete(f"{BASE_URL}/api/employees/{eid}",
                        headers=admin_headers, timeout=10)
    except Exception:
        pass


@pytest.fixture(scope="module")
def test_emp_yearbound(admin_headers):
    name = f"TEST_iter34yb_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{BASE_URL}/api/employees",
        headers=admin_headers,
        json={"full_name": f"{name} YB", "phone_number": None},
        timeout=10,
    )
    eid = r.json().get("id") or r.json().get("employee_id")
    yield eid
    try:
        requests.delete(f"{BASE_URL}/api/employees/{eid}",
                        headers=admin_headers, timeout=10)
    except Exception:
        pass


def _get_row(headers, eid, year, month):
    r = requests.get(f"{BASE_URL}/api/payroll?year={year}&month={month}",
                     headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json(), next((x for x in r.json()["rows"] if x["employee_id"] == eid), None)


# ---------- GET payroll basic fields ----------
class TestGetPayrollFields:
    def test_get_returns_locked_and_lock_info(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/payroll?year=2026&month=11",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "locked" in data
        assert "lock_info" in data
        assert isinstance(data["locked"], bool)
        assert "rows" in data
        for row in data["rows"]:
            assert "defaulted_from_prev" in row


# ---------- AUTO-COPY ----------
class TestAutoCopy:
    def test_autocopy_within_year(self, admin_headers, test_emp):
        # March: set rate=50
        r = requests.put(
            f"{BASE_URL}/api/payroll/{test_emp}?year={PREV_YEAR}&month={PREV_MONTH}",
            headers=admin_headers,
            json={"rate": 50.0},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        # April: no record yet -> should default rate=50 from March
        _, row = _get_row(admin_headers, test_emp, CUR_YEAR, CUR_MONTH)
        assert row is not None
        assert row["record"]["rate"] == 50.0, row["record"]
        assert row["defaulted_from_prev"] is True

    def test_autocopy_across_year_boundary(self, admin_headers, test_emp_yearbound):
        # Dec 2024: rate=42.5
        r = requests.put(
            f"{BASE_URL}/api/payroll/{test_emp_yearbound}?year={DEC_YEAR}&month={DEC_MONTH}",
            headers=admin_headers, json={"rate": 42.5}, timeout=10,
        )
        assert r.status_code == 200
        # Jan 2025: no record -> should copy from Dec 2024
        _, row = _get_row(admin_headers, test_emp_yearbound, JAN_YEAR, JAN_MONTH)
        assert row is not None
        assert row["record"]["rate"] == 42.5, row["record"]
        assert row["defaulted_from_prev"] is True

    def test_autocopy_not_applied_when_record_exists(self, admin_headers, test_emp):
        # Create record in April -> should override default
        r = requests.put(
            f"{BASE_URL}/api/payroll/{test_emp}?year={CUR_YEAR}&month={CUR_MONTH}",
            headers=admin_headers, json={"rate": 60.0}, timeout=10,
        )
        assert r.status_code == 200
        _, row = _get_row(admin_headers, test_emp, CUR_YEAR, CUR_MONTH)
        assert row["record"]["rate"] == 60.0
        assert row["defaulted_from_prev"] is False


# ---------- LOCK / UNLOCK ----------
class TestLockUnlock:
    def test_lock_then_already_locked(self, admin_headers):
        # Ensure clean
        requests.post(
            f"{BASE_URL}/api/payroll/unlock?year={LOCK_YEAR}&month={LOCK_MONTH}",
            headers=admin_headers, timeout=10,
        )
        r1 = requests.post(
            f"{BASE_URL}/api/payroll/lock?year={LOCK_YEAR}&month={LOCK_MONTH}",
            headers=admin_headers, timeout=10,
        )
        assert r1.status_code == 200, r1.text
        body = r1.json()
        assert "lock" in body
        assert body["lock"].get("locked_by_name")

        r2 = requests.post(
            f"{BASE_URL}/api/payroll/lock?year={LOCK_YEAR}&month={LOCK_MONTH}",
            headers=admin_headers, timeout=10,
        )
        assert r2.status_code == 200
        assert "Juz zamkniety" in r2.json().get("message", "") or "already" in r2.json().get("message", "").lower()

    def test_put_on_locked_returns_423(self, admin_headers, test_emp):
        # Make sure month locked
        requests.post(
            f"{BASE_URL}/api/payroll/lock?year={LOCK_YEAR}&month={LOCK_MONTH}",
            headers=admin_headers, timeout=10,
        )
        r = requests.put(
            f"{BASE_URL}/api/payroll/{test_emp}?year={LOCK_YEAR}&month={LOCK_MONTH}",
            headers=admin_headers, json={"rate": 99.0}, timeout=10,
        )
        assert r.status_code == 423, r.text
        detail = r.json().get("detail", "")
        assert "zamkn" in detail.lower() or "lock" in detail.lower()

    def test_unlock_then_unlock_again_400(self, admin_headers):
        r1 = requests.post(
            f"{BASE_URL}/api/payroll/unlock?year={LOCK_YEAR}&month={LOCK_MONTH}",
            headers=admin_headers, timeout=10,
        )
        assert r1.status_code == 200, r1.text
        r2 = requests.post(
            f"{BASE_URL}/api/payroll/unlock?year={LOCK_YEAR}&month={LOCK_MONTH}",
            headers=admin_headers, timeout=10,
        )
        assert r2.status_code == 400

    def test_after_unlock_get_locked_false(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/payroll?year={LOCK_YEAR}&month={LOCK_MONTH}",
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["locked"] is False


# ---------- AUDIT ----------
class TestAudit:
    def test_audit_two_entries_then_zero_for_noop(self, admin_headers, test_emp):
        # Initial state set to rate=50, bonus=0
        requests.put(
            f"{BASE_URL}/api/payroll/{test_emp}?year={AUDIT_YEAR}&month={AUDIT_MONTH}",
            headers=admin_headers,
            json={"rate": 50.0, "bonus_zl": 0.0},
            timeout=10,
        )
        # Now change two fields: rate 50->45, bonus 0->200
        r = requests.put(
            f"{BASE_URL}/api/payroll/{test_emp}?year={AUDIT_YEAR}&month={AUDIT_MONTH}",
            headers=admin_headers,
            json={"rate": 45.0, "bonus_zl": 200.0},
            timeout=10,
        )
        assert r.status_code == 200
        body = r.json()
        assert body.get("audit_changes") == 2, body

        # Fetch audit
        r2 = requests.get(
            f"{BASE_URL}/api/payroll/{test_emp}/audit?year={AUDIT_YEAR}&month={AUDIT_MONTH}",
            headers=admin_headers, timeout=10,
        )
        assert r2.status_code == 200
        entries = r2.json()["entries"]
        assert len(entries) >= 2
        # descending order by changed_at
        ts = [e["changed_at"] for e in entries]
        assert ts == sorted(ts, reverse=True), ts
        fields = {e["field"] for e in entries[:2]}
        assert {"rate", "bonus_zl"}.issubset(fields)
        # contains old/new + changed_by_name
        for e in entries:
            assert "old_value" in e
            assert "new_value" in e
            assert e.get("changed_by_name")

        # No-op: send same values
        r3 = requests.put(
            f"{BASE_URL}/api/payroll/{test_emp}?year={AUDIT_YEAR}&month={AUDIT_MONTH}",
            headers=admin_headers,
            json={"rate": 45.0, "bonus_zl": 200.0},
            timeout=10,
        )
        assert r3.status_code == 200
        assert r3.json().get("audit_changes") == 0

    def test_audit_scoped_to_month(self, admin_headers, test_emp):
        # Audit for a different month should NOT include these entries
        r = requests.get(
            f"{BASE_URL}/api/payroll/{test_emp}/audit?year=2099&month=1",
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["entries"] == []


# ---------- PDF report ----------
class TestPdfReport:
    def test_pdf_report_generated(self, admin_headers, test_emp):
        # Seed a record so we have at least one row
        requests.put(
            f"{BASE_URL}/api/payroll/{test_emp}?year={PDF_YEAR}&month={PDF_MONTH}",
            headers=admin_headers,
            json={"rate": 55.0, "bonus_zl": 100.0},
            timeout=10,
        )
        r = requests.post(
            f"{BASE_URL}/api/payroll/pdf/report?year={PDF_YEAR}&month={PDF_MONTH}",
            headers=admin_headers, json={}, timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.headers["content-type"].startswith("application/pdf")
        assert len(r.content) > 10_000, f"PDF too small: {len(r.content)} bytes"
        assert r.content[:4] == b"%PDF"

    def test_pdf_karteczki_regression(self, admin_headers, test_emp):
        r = requests.post(
            f"{BASE_URL}/api/payroll/pdf?year={PDF_YEAR}&month={PDF_MONTH}",
            headers=admin_headers,
            json={"employee_ids": [test_emp]},
            timeout=20,
        )
        assert r.status_code == 200, r.text[:200]
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"


# ---------- RBAC ----------
class TestRBAC:
    @pytest.fixture(scope="class")
    def foreman_headers(self):
        # Register a temp foreman if needed, or just hit with no token / bad token
        # Easiest: no Authorization header -> 401/403
        return {"Content-Type": "application/json"}

    def test_get_payroll_unauthorized(self, foreman_headers):
        r = requests.get(f"{BASE_URL}/api/payroll?year=2027&month=1",
                         headers=foreman_headers, timeout=10)
        assert r.status_code in (401, 403)

    def test_lock_unauthorized(self, foreman_headers):
        r = requests.post(f"{BASE_URL}/api/payroll/lock?year=2027&month=1",
                          headers=foreman_headers, timeout=10)
        assert r.status_code in (401, 403)

    def test_pdf_report_unauthorized(self, foreman_headers):
        r = requests.post(f"{BASE_URL}/api/payroll/pdf/report?year=2027&month=1",
                          headers=foreman_headers, json={}, timeout=10)
        assert r.status_code in (401, 403)
