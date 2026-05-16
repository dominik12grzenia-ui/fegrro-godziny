"""Iter32 - Employee management (add/archive/unarchive/delete) + Payroll RBAC.

Covers:
- Backend: POST /api/employees (admin only); archive/unarchive/delete + cascade
- GET /api/employees ?include_archived=true filter
- Security: payroll endpoints reject foreman (403) and anonymous (401/403)
"""
import os
import asyncio
import uuid

import pytest
import requests

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
MONTH = 4
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASSWORD = "Admin123!"
FOREMAN_NAME = "TEST_ForemanIter32"
FOREMAN_PASSWORD = "ForemanPass123!"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def foreman_token():
    """Seed a foreman user directly in DB (test isolation) and login."""
    import sys
    sys.path.insert(0, "/app/backend")
    from database import db
    from auth import get_password_hash

    async def seed():
        existing = await db.users.find_one({"full_name": FOREMAN_NAME})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "full_name": FOREMAN_NAME,
                "email": f"{FOREMAN_NAME.lower()}@test.local",
                "role": "foreman",
                "hashed_password": get_password_hash(FOREMAN_PASSWORD),
                "assigned_sites": [],
            })
        else:
            # Make sure password matches (in case of pre-existing)
            await db.users.update_one(
                {"full_name": FOREMAN_NAME},
                {"$set": {"hashed_password": get_password_hash(FOREMAN_PASSWORD), "role": "foreman"}}
            )

    asyncio.get_event_loop().run_until_complete(seed())

    r = requests.post(
        f"{BASE_URL}/api/auth/foreman/login",
        json={"email": FOREMAN_NAME, "password": FOREMAN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Foreman login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def foreman_headers(foreman_token):
    return {"Authorization": f"Bearer {foreman_token}", "Content-Type": "application/json"}


# ---------- Payroll RBAC ----------
class TestPayrollRBAC:
    def test_get_payroll_anonymous_blocked(self):
        r = requests.get(f"{BASE_URL}/api/payroll?year={YEAR}&month={MONTH}", timeout=10)
        assert r.status_code in (401, 403), f"got {r.status_code}"

    def test_get_payroll_foreman_forbidden(self, foreman_headers):
        r = requests.get(
            f"{BASE_URL}/api/payroll?year={YEAR}&month={MONTH}",
            headers=foreman_headers, timeout=15,
        )
        assert r.status_code == 403, f"foreman should get 403, got {r.status_code} {r.text}"

    def test_put_payroll_anonymous_blocked(self):
        r = requests.put(
            f"{BASE_URL}/api/payroll/some-id?year={YEAR}&month={MONTH}",
            json={"rate": 30.0}, timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_put_payroll_foreman_forbidden(self, foreman_headers):
        r = requests.put(
            f"{BASE_URL}/api/payroll/some-id?year={YEAR}&month={MONTH}",
            headers=foreman_headers, json={"rate": 30.0}, timeout=15,
        )
        assert r.status_code == 403

    def test_post_pdf_anonymous_blocked(self):
        r = requests.post(
            f"{BASE_URL}/api/payroll/pdf?year={YEAR}&month={MONTH}",
            json={}, timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_post_pdf_foreman_forbidden(self, foreman_headers):
        r = requests.post(
            f"{BASE_URL}/api/payroll/pdf?year={YEAR}&month={MONTH}",
            headers=foreman_headers, json={}, timeout=15,
        )
        assert r.status_code == 403


# ---------- Employees CRUD ----------
class TestEmployeeAdd:
    def test_create_employee(self, admin_headers):
        name = f"TEST_iter32_emp_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/employees",
            headers=admin_headers,
            json={"full_name": name, "phone_number": "+48123456789"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["full_name"] == name
        assert data["phone_number"] == "+48123456789"
        assert "id" in data
        assert data.get("currently_active") is True

        # GET to verify persistence
        r2 = requests.get(
            f"{BASE_URL}/api/employees", headers=admin_headers, timeout=15
        )
        assert r2.status_code == 200
        assert any(e["id"] == data["id"] for e in r2.json())

    def test_create_employee_phone_optional(self, admin_headers):
        name = f"TEST_iter32_nophone_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/employees",
            headers=admin_headers, json={"full_name": name}, timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["full_name"] == name

    def test_create_employee_foreman_forbidden(self, foreman_headers):
        r = requests.post(
            f"{BASE_URL}/api/employees",
            headers=foreman_headers,
            json={"full_name": "TEST_should_fail"},
            timeout=15,
        )
        assert r.status_code == 403


class TestEmployeeArchive:
    @pytest.fixture
    def fresh_emp_id(self, admin_headers):
        name = f"TEST_iter32_lifecycle_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/employees",
            headers=admin_headers, json={"full_name": name}, timeout=15,
        )
        assert r.status_code == 200
        return r.json()["id"]

    def test_archive_sets_flags(self, admin_headers, fresh_emp_id):
        r = requests.post(
            f"{BASE_URL}/api/employees/{fresh_emp_id}/archive",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        assert "Zarchiwizowano" in r.json().get("message", "")

        # Default GET should NOT include archived
        r2 = requests.get(
            f"{BASE_URL}/api/employees", headers=admin_headers, timeout=15
        )
        ids = [e["id"] for e in r2.json()]
        assert fresh_emp_id not in ids

        # include_archived=true should include it with is_archived flag
        r3 = requests.get(
            f"{BASE_URL}/api/employees?include_archived=true&active_only=false",
            headers=admin_headers, timeout=15,
        )
        match = next((e for e in r3.json() if e["id"] == fresh_emp_id), None)
        assert match is not None
        assert match.get("is_archived") is True
        assert match.get("archived_at") is not None
        assert match.get("currently_active") is False

    def test_unarchive_restores(self, admin_headers, fresh_emp_id):
        # Archive then unarchive
        requests.post(
            f"{BASE_URL}/api/employees/{fresh_emp_id}/archive",
            headers=admin_headers, timeout=15,
        )
        r = requests.post(
            f"{BASE_URL}/api/employees/{fresh_emp_id}/unarchive",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        # Should re-appear in default list
        r2 = requests.get(
            f"{BASE_URL}/api/employees", headers=admin_headers, timeout=15
        )
        ids = [e["id"] for e in r2.json()]
        assert fresh_emp_id in ids

    def test_archive_foreman_forbidden(self, foreman_headers, fresh_emp_id):
        r = requests.post(
            f"{BASE_URL}/api/employees/{fresh_emp_id}/archive",
            headers=foreman_headers, timeout=15,
        )
        assert r.status_code == 403


class TestEmployeeDelete:
    def test_delete_not_archived_400(self, admin_headers):
        name = f"TEST_iter32_del_block_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/employees",
            headers=admin_headers, json={"full_name": name}, timeout=15,
        )
        emp_id = r.json()["id"]
        r2 = requests.delete(
            f"{BASE_URL}/api/employees/{emp_id}",
            headers=admin_headers, timeout=15,
        )
        assert r2.status_code == 400, r2.text
        detail = r2.json().get("detail", "")
        assert "zarchiwizuj" in detail.lower() or "najpierw" in detail.lower()
        # Clean up
        requests.post(f"{BASE_URL}/api/employees/{emp_id}/archive", headers=admin_headers, timeout=10)
        requests.delete(f"{BASE_URL}/api/employees/{emp_id}", headers=admin_headers, timeout=10)

    def test_delete_archived_cascades(self, admin_headers):
        name = f"TEST_iter32_cascade_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/employees",
            headers=admin_headers, json={"full_name": name}, timeout=15,
        )
        emp_id = r.json()["id"]
        # Seed a payroll record so cascade has something to remove
        requests.put(
            f"{BASE_URL}/api/payroll/{emp_id}?year={YEAR}&month={MONTH}",
            headers=admin_headers, json={"rate": 50.0}, timeout=15,
        )
        # Archive then delete
        requests.post(f"{BASE_URL}/api/employees/{emp_id}/archive", headers=admin_headers, timeout=10)
        r2 = requests.delete(
            f"{BASE_URL}/api/employees/{emp_id}",
            headers=admin_headers, timeout=15,
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert "cascaded" in body
        cascaded = body["cascaded"]
        for key in ["hour_entries", "assignments", "advances", "penalties",
                    "absences", "clothing_orders", "bhp_documents",
                    "bhp_issuances", "payroll_records"]:
            assert key in cascaded, f"missing cascade key {key}"
        # payroll_records should be >= 1 since we seeded one
        assert cascaded["payroll_records"] >= 1

        # GET 404 after deletion
        r3 = requests.get(
            f"{BASE_URL}/api/employees/{emp_id}",
            headers=admin_headers, timeout=15,
        )
        assert r3.status_code == 404

    def test_delete_foreman_forbidden(self, admin_headers, foreman_headers):
        # Setup
        name = f"TEST_iter32_del_rbac_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/employees",
            headers=admin_headers, json={"full_name": name}, timeout=15,
        )
        emp_id = r.json()["id"]
        requests.post(f"{BASE_URL}/api/employees/{emp_id}/archive", headers=admin_headers, timeout=10)

        r2 = requests.delete(
            f"{BASE_URL}/api/employees/{emp_id}",
            headers=foreman_headers, timeout=15,
        )
        assert r2.status_code == 403
        # Clean up
        requests.delete(f"{BASE_URL}/api/employees/{emp_id}", headers=admin_headers, timeout=10)


# ---------- include_archived filter ----------
class TestArchivedFilter:
    def test_default_excludes_archived(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/employees", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        for e in r.json():
            assert not e.get("is_archived", False), f"archived emp leaked: {e.get('full_name')}"

    def test_include_archived_shows_all(self, admin_headers):
        # Ensure at least one archived exists
        r = requests.get(
            f"{BASE_URL}/api/employees?include_archived=true&active_only=false",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        # We know 'Jan Testowy BHP' is archived in DB
        assert any(e.get("is_archived") for e in r.json()), "Should contain at least one archived employee"
