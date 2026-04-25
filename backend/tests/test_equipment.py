"""Backend tests for the new Equipment (Sprzet) module - FeGrro Godziny.

Covers:
- POST /api/equipment - create (admin only, validation)
- GET /api/equipment - list with filters (status, employee_id, site_id)
- PUT /api/equipment/{id} - update (admin only)
- POST /api/equipment/{id}/assign - assign / return to warehouse
- DELETE /api/equipment/{id} - delete (admin only)
- Regression: health, login, employees/sites/hours/requests/sync/reports endpoints
"""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

# Load frontend .env for REACT_APP_BACKEND_URL
load_dotenv(Path("/app/frontend/.env"))

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASSWORD = "Admin123!"


# ============= FIXTURES =============
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def foreman_token():
    name = f"TEST_Foreman_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/auth/worker/register",
                      json={"full_name": name},
                      timeout=15)
    assert r.status_code == 200, f"Worker register failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def foreman_headers(foreman_token):
    return {"Authorization": f"Bearer {foreman_token}", "Content-Type": "application/json"}


# ============= HEALTH / AUTH REGRESSION =============
class TestHealthAndAuth:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "healthy"
        assert "timestamp" in body

    def test_admin_login_works(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_admin_login_invalid(self):
        r = requests.post(f"{API}/auth/admin/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code == 401


# ============= EQUIPMENT - AUTH/VALIDATION =============
class TestEquipmentAuth:
    def test_create_without_token_401(self):
        r = requests.post(f"{API}/equipment", json={"name": "Test"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_create_as_foreman_403(self, foreman_headers):
        r = requests.post(f"{API}/equipment",
                          json={"name": "ForemanShouldFail"},
                          headers=foreman_headers, timeout=10)
        assert r.status_code == 403

    def test_create_missing_name_returns_4xx(self, admin_headers):
        # Pydantic should return 422 for missing required field
        r = requests.post(f"{API}/equipment", json={}, headers=admin_headers, timeout=10)
        assert r.status_code in (400, 422)

    def test_create_empty_name_returns_400(self, admin_headers):
        r = requests.post(f"{API}/equipment", json={"name": "   "},
                          headers=admin_headers, timeout=10)
        assert r.status_code == 400

    def test_list_without_token_401(self):
        r = requests.get(f"{API}/equipment", timeout=10)
        assert r.status_code in (401, 403)


# ============= EQUIPMENT - CRUD =============
class TestEquipmentCRUD:
    created_ids = []

    def test_create_equipment_minimal(self, admin_headers):
        payload = {"name": "TEST_Wiertarka_Bosch"}
        r = requests.post(f"{API}/equipment", json=payload, headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_Wiertarka_Bosch"
        assert data["status"] == "sprawny"
        assert "id" in data and len(data["id"]) > 0
        assert "_id" not in data
        TestEquipmentCRUD.created_ids.append(data["id"])

    def test_create_equipment_full_payload(self, admin_headers):
        payload = {
            "name": "TEST_Mlot_Hilti",
            "category": "Elektronarzedzia",
            "serial_number": "SN-12345",
            "status": "uszkodzony",
            "notes": "Wymaga naprawy szczotek",
            "image_data": "data:image/png;base64,iVBORw0KGgo="
        }
        r = requests.post(f"{API}/equipment", json=payload, headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["category"] == "Elektronarzedzia"
        assert data["serial_number"] == "SN-12345"
        assert data["status"] == "uszkodzony"
        assert data["image_data"].startswith("data:image/png")
        TestEquipmentCRUD.created_ids.append(data["id"])

    def test_get_after_create_persisted(self, admin_headers):
        assert TestEquipmentCRUD.created_ids, "Need created equipment"
        r = requests.get(f"{API}/equipment", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        items = r.json()
        ids = [it["id"] for it in items]
        for cid in TestEquipmentCRUD.created_ids:
            assert cid in ids, f"Created {cid} not found in list"

    def test_list_filter_by_status_uszkodzony(self, admin_headers):
        r = requests.get(f"{API}/equipment?status=uszkodzony",
                         headers=admin_headers, timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert all(it["status"] == "uszkodzony" for it in items)
        # We created one uszkodzony
        assert any(it["name"] == "TEST_Mlot_Hilti" for it in items)

    def test_list_foreman_can_view(self, foreman_headers):
        r = requests.get(f"{API}/equipment", headers=foreman_headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_update_equipment(self, admin_headers):
        eq_id = TestEquipmentCRUD.created_ids[0]
        r = requests.put(f"{API}/equipment/{eq_id}",
                         json={"status": "w_serwisie", "notes": "Oddany do serwisu"},
                         headers=admin_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "w_serwisie"
        assert data["notes"] == "Oddany do serwisu"
        # Verify persisted via GET filter
        r2 = requests.get(f"{API}/equipment?status=w_serwisie",
                          headers=admin_headers, timeout=10)
        assert r2.status_code == 200
        assert any(it["id"] == eq_id for it in r2.json())

    def test_update_nonexistent_returns_404(self, admin_headers):
        r = requests.put(f"{API}/equipment/nonexistent-id-zzz",
                         json={"status": "sprawny"},
                         headers=admin_headers, timeout=10)
        assert r.status_code == 404

    def test_update_as_foreman_403(self, foreman_headers):
        eq_id = TestEquipmentCRUD.created_ids[0]
        r = requests.put(f"{API}/equipment/{eq_id}",
                         json={"status": "sprawny"},
                         headers=foreman_headers, timeout=10)
        assert r.status_code == 403

    def test_assign_to_employee(self, admin_headers):
        eq_id = TestEquipmentCRUD.created_ids[0]
        emp_id = "emp-test-123"
        r = requests.post(f"{API}/equipment/{eq_id}/assign",
                         params={"employee_id": emp_id},
                         headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["assigned_to_employee_id"] == emp_id

        # Verify filter by employee_id
        r2 = requests.get(f"{API}/equipment?employee_id={emp_id}",
                          headers=admin_headers, timeout=10)
        assert r2.status_code == 200
        assert any(it["id"] == eq_id for it in r2.json())

    def test_assign_to_site(self, admin_headers):
        eq_id = TestEquipmentCRUD.created_ids[1]
        site_id = "site-test-456"
        r = requests.post(f"{API}/equipment/{eq_id}/assign",
                         params={"site_id": site_id},
                         headers=admin_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["assigned_to_site_id"] == site_id

        r2 = requests.get(f"{API}/equipment?site_id={site_id}",
                          headers=admin_headers, timeout=10)
        assert r2.status_code == 200
        assert any(it["id"] == eq_id for it in r2.json())

    def test_assign_return_to_warehouse(self, admin_headers):
        eq_id = TestEquipmentCRUD.created_ids[0]
        # Empty params -> return to warehouse
        r = requests.post(f"{API}/equipment/{eq_id}/assign",
                         headers=admin_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["assigned_to_employee_id"] is None
        assert data["assigned_to_site_id"] is None

    def test_assign_nonexistent_404(self, admin_headers):
        r = requests.post(f"{API}/equipment/does-not-exist/assign",
                         params={"employee_id": "x"},
                         headers=admin_headers, timeout=10)
        assert r.status_code == 404

    def test_delete_equipment(self, admin_headers):
        # Create a throwaway item
        r = requests.post(f"{API}/equipment", json={"name": "TEST_DeleteMe"},
                         headers=admin_headers, timeout=10)
        assert r.status_code == 200
        eq_id = r.json()["id"]

        d = requests.delete(f"{API}/equipment/{eq_id}", headers=admin_headers, timeout=10)
        assert d.status_code == 200
        assert d.json().get("success") is True

        # Verify removed
        r2 = requests.get(f"{API}/equipment", headers=admin_headers, timeout=10)
        assert all(it["id"] != eq_id for it in r2.json())

    def test_delete_nonexistent_404(self, admin_headers):
        r = requests.delete(f"{API}/equipment/missing-uuid",
                           headers=admin_headers, timeout=10)
        assert r.status_code == 404

    def test_delete_as_foreman_403(self, foreman_headers):
        # Create then attempt delete with foreman
        eq_id = TestEquipmentCRUD.created_ids[1]
        r = requests.delete(f"{API}/equipment/{eq_id}", headers=foreman_headers, timeout=10)
        assert r.status_code == 403


# ============= REGRESSION - existing endpoints not broken =============
class TestExistingEndpointsRegression:
    def test_employees_list(self, admin_headers):
        r = requests.get(f"{API}/employees", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_sites_list(self, admin_headers):
        r = requests.get(f"{API}/sites", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_hours_list(self, admin_headers):
        r = requests.get(f"{API}/hours", headers=admin_headers, timeout=10)
        assert r.status_code == 200

    def test_requests_list(self, admin_headers):
        r = requests.get(f"{API}/requests", headers=admin_headers, timeout=10)
        assert r.status_code == 200

    def test_assignments_list(self, admin_headers):
        r = requests.get(f"{API}/assignments", headers=admin_headers, timeout=10)
        # allowed: 200 (list) or 405 if only POST exists
        assert r.status_code in (200, 405)

    def test_sync_logs(self, admin_headers):
        r = requests.get(f"{API}/sync/logs", headers=admin_headers, timeout=10)
        assert r.status_code in (200, 404)

    def test_reports_monthly(self, admin_headers):
        r = requests.get(f"{API}/reports/monthly?year=2026&month=1",
                         headers=admin_headers, timeout=15)
        assert r.status_code in (200, 404, 422)
