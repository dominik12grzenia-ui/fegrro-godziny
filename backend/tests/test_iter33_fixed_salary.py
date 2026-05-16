"""Iter33 - Payroll fixed salary (stala pensja) + housing removed.

Covers:
- PayrollRecord housing_zl removed: PUT with housing_zl is ignored (no payout impact)
- PUT is_fixed_salary=true with fixed_salary_amount=5000, advances_hours=10
  -> GET returns those values; computed.hours_amount=5000.00,
     rate_effective=5000/hours (or 0 when hours=0)
- Formula fixed: payout = fixed_amt - (adv_h*rate_eff) - penalties - other_minus
                       + bonus + driver + other_plus
- Formula hourly: payout = hours*rate - (adv_h*rate) - penalties - other_minus
                         + bonus + driver + other_plus
- PDF generation with is_fixed_salary=true >5KB and does NOT contain housing line
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

YEAR = 2026
MONTH = 3  # use distinct month to avoid collision with seed


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"email": "admin@fegrro.pl", "password": "Admin123!"},
        timeout=15,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def test_employee(admin_headers):
    """Create a TEST_ employee for this run; cleanup at the end."""
    name = f"TEST_iter33_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{BASE_URL}/api/employees",
        headers=admin_headers,
        json={"full_name": f"{name} Surname", "phone_number": None},
        timeout=10,
    )
    assert r.status_code in (200, 201), r.text
    emp = r.json()
    emp_id = emp.get("id") or emp.get("employee_id")
    assert emp_id
    yield emp_id
    # cleanup
    try:
        requests.delete(f"{BASE_URL}/api/employees/{emp_id}",
                        headers=admin_headers, timeout=10)
    except Exception:
        pass


def _find_row(admin_headers, emp_id, year=YEAR, month=MONTH):
    r = requests.get(f"{BASE_URL}/api/payroll?year={year}&month={month}",
                     headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    rows = r.json()["rows"]
    for row in rows:
        if row["employee_id"] == emp_id:
            return row
    return None


# ---------- housing_zl removed ----------
class TestHousingRemoved:
    def test_put_housing_ignored_no_payout_impact(self, admin_headers, test_employee):
        # Set base hourly record with rate; no housing
        payload = {
            "rate": 50.0,
            "advances_hours": 0,
            "penalties_zl": 0,
            "other_minus_zl": 0,
            "bonus_zl": 0,
            "driver_zl": 0,
            "other_plus_zl": 0,
        }
        r = requests.put(
            f"{BASE_URL}/api/payroll/{test_employee}?year={YEAR}&month={MONTH}",
            headers=admin_headers, json=payload, timeout=10,
        )
        assert r.status_code == 200, r.text
        row1 = _find_row(admin_headers, test_employee)
        assert row1 is not None
        base_payout = row1["computed"]["payout"]

        # Now PUT including housing_zl=999 — should NOT cause server error and NOT
        # affect payout (field is unknown to model — Pydantic will drop or 422).
        payload2 = dict(payload)
        payload2["housing_zl"] = 999.0
        r2 = requests.put(
            f"{BASE_URL}/api/payroll/{test_employee}?year={YEAR}&month={MONTH}",
            headers=admin_headers, json=payload2, timeout=10,
        )
        # Accept 200 (extra field ignored) or 422 (extra forbidden). Anyway: NOT
        # 5xx and payout unchanged.
        assert r2.status_code in (200, 422), r2.text

        row2 = _find_row(admin_headers, test_employee)
        assert row2["computed"]["payout"] == base_payout, (
            f"housing_zl must not affect payout: was {base_payout}, now {row2['computed']['payout']}"
        )
        # record should not include housing_zl in GET response
        assert "housing_zl" not in row2["record"], (
            f"housing_zl present in record: {row2['record']}"
        )


# ---------- is_fixed_salary toggling + persistence ----------
class TestFixedSalary:
    def test_put_fixed_persists(self, admin_headers, test_employee):
        payload = {
            "rate": 50.0,
            "is_fixed_salary": True,
            "fixed_salary_amount": 5000.0,
            "advances_hours": 10.0,
            "penalties_zl": 0,
            "other_minus_zl": 0,
            "bonus_zl": 0,
            "driver_zl": 0,
            "other_plus_zl": 0,
        }
        r = requests.put(
            f"{BASE_URL}/api/payroll/{test_employee}?year={YEAR}&month={MONTH}",
            headers=admin_headers, json=payload, timeout=10,
        )
        assert r.status_code == 200, r.text

        row = _find_row(admin_headers, test_employee)
        rec = row["record"]
        assert rec["is_fixed_salary"] is True
        assert rec["fixed_salary_amount"] == 5000.0
        assert rec["advances_hours"] == 10.0

    def test_computed_fixed_formula_zero_hours(self, admin_headers, test_employee):
        """With 0 hours: hours_amount=5000, rate_effective=0, advances_zl=0,
        payout=5000."""
        row = _find_row(admin_headers, test_employee)
        c = row["computed"]
        assert row["total_hours"] == 0, f"Test assumes employee has no hours, got {row['total_hours']}"
        assert c["hours_amount"] == 5000.0, c
        assert c["rate_effective"] == 0.0, c
        assert c["advances_zl"] == 0.0, c
        assert c["payout"] == 5000.0, c

    def test_toggle_back_to_hourly(self, admin_headers, test_employee):
        payload = {
            "rate": 50.0,
            "is_fixed_salary": False,
            "fixed_salary_amount": 5000.0,
            "advances_hours": 2.0,
            "penalties_zl": 100.0,
            "other_minus_zl": 0,
            "bonus_zl": 200.0,
            "driver_zl": 0,
            "other_plus_zl": 0,
        }
        r = requests.put(
            f"{BASE_URL}/api/payroll/{test_employee}?year={YEAR}&month={MONTH}",
            headers=admin_headers, json=payload, timeout=10,
        )
        assert r.status_code == 200
        row = _find_row(admin_headers, test_employee)
        c = row["computed"]
        # hours=0 so hours_amount = 0*50 = 0; advances = 2*50 = 100;
        # payout = 0 - 100 - 100 + 200 = 0
        assert c["rate_effective"] == 50.0
        assert c["hours_amount"] == 0.0
        assert c["advances_zl"] == 100.0
        assert c["payout"] == 0.0


# ---------- PDF without housing ----------
class TestPdf:
    def test_pdf_fixed_salary_size_no_housing(self, admin_headers, test_employee):
        # Switch back to fixed
        requests.put(
            f"{BASE_URL}/api/payroll/{test_employee}?year={YEAR}&month={MONTH}",
            headers=admin_headers,
            json={"rate": 0, "is_fixed_salary": True,
                  "fixed_salary_amount": 5000.0, "advances_hours": 0,
                  "penalties_zl": 0, "other_minus_zl": 0, "bonus_zl": 0,
                  "driver_zl": 0, "other_plus_zl": 0},
            timeout=10,
        )
        r = requests.post(
            f"{BASE_URL}/api/payroll/pdf?year={YEAR}&month={MONTH}",
            headers=admin_headers,
            json={"employee_ids": [test_employee]},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        body = r.content
        assert len(body) > 5000, f"PDF too small: {len(body)} bytes"
        # PDF binary should not contain Mieszkanie (extract text quick check)
        # ReportLab usually keeps text as literal in stream when font is embedded.
        # We test against common encodings.
        body_lower = body.lower()
        assert b"mieszkanie" not in body_lower, "PDF still contains 'Mieszkanie' line"
