"""
Comprehensive E2E Test Suite for FeGrro Construction Worker Hours Logging App
Tests: Auth, Employees, Sites, Hours, Advances (Zaliczki), Penalties (Kary), 
       Foremen, Public Links, Excel Sync, Cron Status
"""
import pytest
from tests.test_config import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = TEST_ADMIN_EMAIL
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD


class TestHealthAndBasics:
    """Basic health check and API availability"""
    
    def test_health_endpoint(self):
        """GET /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print(f"✓ Health check passed: {data}")


class TestAdminAuth:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """POST /api/auth/admin/login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful: {data['user']['full_name']}")
        return data["access_token"]
    
    def test_admin_login_invalid_credentials(self):
        """POST /api/auth/admin/login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": "wrong@email.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected with 401")


class TestUnauthorizedAccess:
    """Test that protected endpoints return 401/403 without auth"""
    
    def test_employees_requires_auth(self):
        """GET /api/employees without token returns 401 or 403"""
        response = requests.get(f"{BASE_URL}/api/employees")
        assert response.status_code in [401, 403]
        print(f"✓ /api/employees requires auth (returned {response.status_code})")
    
    def test_sites_requires_auth(self):
        """GET /api/sites without token returns 401 or 403"""
        response = requests.get(f"{BASE_URL}/api/sites")
        assert response.status_code in [401, 403]
        print(f"✓ /api/sites requires auth (returned {response.status_code})")
    
    def test_advances_requires_admin(self):
        """GET /api/advances without token returns 401 or 403"""
        response = requests.get(f"{BASE_URL}/api/advances")
        assert response.status_code in [401, 403]
        print(f"✓ /api/advances requires auth (returned {response.status_code})")
    
    def test_penalties_requires_admin(self):
        """GET /api/penalties without token returns 401 or 403"""
        response = requests.get(f"{BASE_URL}/api/penalties")
        assert response.status_code in [401, 403]
        print(f"✓ /api/penalties requires auth (returned {response.status_code})")
    
    def test_foremen_requires_auth(self):
        """GET /api/foremen without token returns 401 or 403"""
        response = requests.get(f"{BASE_URL}/api/foremen")
        assert response.status_code in [401, 403]
        print(f"✓ /api/foremen requires auth (returned {response.status_code})")
    
    def test_cron_status_requires_admin(self):
        """GET /api/cron/status without token returns 401 or 403"""
        response = requests.get(f"{BASE_URL}/api/cron/status")
        assert response.status_code in [401, 403]
        print(f"✓ /api/cron/status requires auth (returned {response.status_code})")


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for authenticated tests"""
    response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Admin login failed - skipping authenticated tests")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth token"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestEmployeesAPI:
    """Employee CRUD tests"""
    
    def test_get_employees(self, admin_headers):
        """GET /api/employees returns list of employees"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/employees returned {len(data)} employees")
        if len(data) > 0:
            emp = data[0]
            assert "id" in emp
            assert "full_name" in emp
            print(f"  First employee: {emp['full_name']}")


class TestSitesAPI:
    """Construction sites API tests"""
    
    def test_get_sites(self, admin_headers):
        """GET /api/sites returns list of construction sites"""
        response = requests.get(f"{BASE_URL}/api/sites", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/sites returned {len(data)} sites")
        if len(data) > 0:
            site = data[0]
            assert "id" in site
            assert "name" in site
            print(f"  First site: {site['name']}")


class TestHoursAPI:
    """Hour entries API tests"""
    
    def test_get_hours(self, admin_headers):
        """GET /api/hours returns hour entries"""
        response = requests.get(f"{BASE_URL}/api/hours", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/hours returned {len(data)} entries")


class TestAdvancesAPI:
    """Advances (Zaliczki) CRUD tests"""
    
    def test_get_advances(self, admin_headers):
        """GET /api/advances returns advances list"""
        response = requests.get(f"{BASE_URL}/api/advances", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/advances returned {len(data)} advances")
    
    def test_get_advances_summary(self, admin_headers):
        """GET /api/advances/summary returns sums per employee"""
        now = datetime.now()
        response = requests.get(
            f"{BASE_URL}/api/advances/summary?month={now.month}&year={now.year}",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ GET /api/advances/summary returned {len(data)} employee sums")
    
    def test_create_advance(self, admin_headers):
        """POST /api/advances creates new advance"""
        # First get an employee
        emp_response = requests.get(f"{BASE_URL}/api/employees", headers=admin_headers)
        employees = emp_response.json()
        if not employees:
            pytest.skip("No employees to test with")
        
        employee_id = employees[0]["id"]
        now = datetime.now()
        
        response = requests.post(f"{BASE_URL}/api/advances", headers=admin_headers, json={
            "employee_id": employee_id,
            "amount": 100.0,
            "month": now.month,
            "year": now.year,
            "note": "TEST_advance_e2e"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["amount"] == 100.0
        assert data["employee_id"] == employee_id
        assert "id" in data
        print(f"✓ POST /api/advances created advance: {data['id']}")
        
        # Cleanup - delete the test advance
        delete_response = requests.delete(
            f"{BASE_URL}/api/advances/{data['id']}",
            headers=admin_headers
        )
        assert delete_response.status_code == 200
        print(f"✓ DELETE /api/advances/{data['id']} cleanup successful")
    
    def test_delete_nonexistent_advance(self, admin_headers):
        """DELETE /api/advances/{nonexistent} returns 404"""
        response = requests.delete(
            f"{BASE_URL}/api/advances/nonexistent-id-12345",
            headers=admin_headers
        )
        assert response.status_code == 404
        print("✓ DELETE nonexistent advance returns 404")
    
    def test_carry_forward_advance(self, admin_headers):
        """POST /api/advances/{id}/carry-forward moves advance to next month"""
        # Create an advance first
        emp_response = requests.get(f"{BASE_URL}/api/employees", headers=admin_headers)
        employees = emp_response.json()
        if not employees:
            pytest.skip("No employees to test with")
        
        employee_id = employees[0]["id"]
        now = datetime.now()
        
        create_response = requests.post(f"{BASE_URL}/api/advances", headers=admin_headers, json={
            "employee_id": employee_id,
            "amount": 200.0,
            "month": now.month,
            "year": now.year,
            "note": "TEST_carry_forward"
        })
        assert create_response.status_code == 200
        advance_id = create_response.json()["id"]
        
        # Carry forward partial amount
        target_month = now.month + 1 if now.month < 12 else 1
        target_year = now.year if now.month < 12 else now.year + 1
        
        carry_response = requests.post(
            f"{BASE_URL}/api/advances/{advance_id}/carry-forward",
            headers=admin_headers,
            json={
                "amount": 50.0,
                "target_month": target_month,
                "target_year": target_year
            }
        )
        assert carry_response.status_code == 200
        data = carry_response.json()
        assert data["remaining"] == 150.0
        assert "new_advance" in data
        print(f"✓ Carry-forward successful: remaining={data['remaining']}, new_id={data['new_advance']['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/advances/{advance_id}", headers=admin_headers)
        requests.delete(f"{BASE_URL}/api/advances/{data['new_advance']['id']}", headers=admin_headers)


class TestPenaltiesAPI:
    """Penalties (Kary) CRUD tests"""
    
    def test_get_penalties(self, admin_headers):
        """GET /api/penalties returns penalties list"""
        response = requests.get(f"{BASE_URL}/api/penalties", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/penalties returned {len(data)} penalties")
    
    def test_get_penalties_summary(self, admin_headers):
        """GET /api/penalties/summary returns sums per employee"""
        now = datetime.now()
        response = requests.get(
            f"{BASE_URL}/api/penalties/summary?month={now.month}&year={now.year}",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ GET /api/penalties/summary returned {len(data)} employee sums")
    
    def test_create_penalty_with_description(self, admin_headers):
        """POST /api/penalties creates penalty with description"""
        emp_response = requests.get(f"{BASE_URL}/api/employees", headers=admin_headers)
        employees = emp_response.json()
        if not employees:
            pytest.skip("No employees to test with")
        
        employee_id = employees[0]["id"]
        now = datetime.now()
        
        response = requests.post(f"{BASE_URL}/api/penalties", headers=admin_headers, json={
            "employee_id": employee_id,
            "amount": 50.0,
            "month": now.month,
            "year": now.year,
            "description": "TEST_penalty_e2e - test description",
            "image_data": None
        })
        assert response.status_code == 200
        data = response.json()
        assert data["amount"] == 50.0
        assert data["description"] == "TEST_penalty_e2e - test description"
        assert "id" in data
        print(f"✓ POST /api/penalties created penalty: {data['id']}")
        
        # Cleanup
        delete_response = requests.delete(
            f"{BASE_URL}/api/penalties/{data['id']}",
            headers=admin_headers
        )
        assert delete_response.status_code == 200
        print(f"✓ DELETE /api/penalties/{data['id']} cleanup successful")
    
    def test_delete_nonexistent_penalty(self, admin_headers):
        """DELETE /api/penalties/{nonexistent} returns 404"""
        response = requests.delete(
            f"{BASE_URL}/api/penalties/nonexistent-id-12345",
            headers=admin_headers
        )
        assert response.status_code == 404
        print("✓ DELETE nonexistent penalty returns 404")


class TestPublicEndpoints:
    """Public endpoints (no auth required)"""
    
    def test_public_advances_invalid_token(self):
        """GET /api/public/advances/{invalid} returns 404"""
        response = requests.get(f"{BASE_URL}/api/public/advances/invalid-token-xyz")
        assert response.status_code == 404
        print("✓ Public advances with invalid token returns 404")
    
    def test_public_penalties_invalid_token(self):
        """GET /api/public/penalties/{invalid} returns 404"""
        response = requests.get(f"{BASE_URL}/api/public/penalties/invalid-token-xyz")
        assert response.status_code == 404
        print("✓ Public penalties with invalid token returns 404")
    
    def test_public_hours_invalid_token(self):
        """GET /api/public/hours/{invalid} returns 404"""
        response = requests.get(f"{BASE_URL}/api/public/hours/invalid-token-xyz")
        assert response.status_code == 404
        print("✓ Public hours with invalid token returns 404")
    
    def test_public_advances_valid_token(self, admin_headers):
        """GET /api/public/advances/{valid_token} returns advances"""
        # Get employees with public tokens
        emp_response = requests.get(f"{BASE_URL}/api/employees", headers=admin_headers)
        employees = emp_response.json()
        
        # Generate links to ensure tokens exist
        links_response = requests.post(f"{BASE_URL}/api/employees/generate-all-links", headers=admin_headers)
        if links_response.status_code == 200:
            links = links_response.json()
            if links:
                token = links[0]["token"]
                response = requests.get(f"{BASE_URL}/api/public/advances/{token}")
                assert response.status_code == 200
                data = response.json()
                assert "advances" in data
                assert "total" in data
                print(f"✓ Public advances with valid token works: total={data['total']}")
                return
        
        pytest.skip("No employees with public tokens")
    
    def test_public_penalties_valid_token(self, admin_headers):
        """GET /api/public/penalties/{valid_token} returns penalties"""
        links_response = requests.post(f"{BASE_URL}/api/employees/generate-all-links", headers=admin_headers)
        if links_response.status_code == 200:
            links = links_response.json()
            if links:
                token = links[0]["token"]
                response = requests.get(f"{BASE_URL}/api/public/penalties/{token}")
                assert response.status_code == 200
                data = response.json()
                assert "penalties" in data
                assert "total" in data
                print(f"✓ Public penalties with valid token works: total={data['total']}")
                return
        
        pytest.skip("No employees with public tokens")


class TestForemenAPI:
    """Foremen management tests"""
    
    def test_get_foremen(self, admin_headers):
        """GET /api/foremen returns foremen list"""
        response = requests.get(f"{BASE_URL}/api/foremen", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/foremen returned {len(data)} foremen")
        if len(data) > 0:
            foreman = data[0]
            assert "id" in foreman
            assert "full_name" in foreman
            assert "status" in foreman
            print(f"  First foreman: {foreman['full_name']} (status: {foreman['status']})")
    
    def test_delete_nonexistent_foreman(self, admin_headers):
        """DELETE /api/foremen/{nonexistent} returns 404"""
        response = requests.delete(
            f"{BASE_URL}/api/foremen/nonexistent-id-12345",
            headers=admin_headers
        )
        assert response.status_code == 404
        print("✓ DELETE nonexistent foreman returns 404")


class TestCronAndSyncAPI:
    """Cron job and Excel sync tests"""
    
    def test_cron_status(self, admin_headers):
        """GET /api/cron/status returns cron job info"""
        response = requests.get(f"{BASE_URL}/api/cron/status", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "active" in data
        assert "jobs" in data
        print(f"✓ GET /api/cron/status: active={data['active']}, jobs={len(data['jobs'])}")
        for job in data["jobs"]:
            print(f"  Job: {job['job_id']} - next run: {job.get('next_run', 'N/A')}")
    
    def test_sync_excel_trigger(self, admin_headers):
        """POST /api/sync/excel triggers Excel sync"""
        response = requests.post(f"{BASE_URL}/api/sync/excel", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ POST /api/sync/excel: {data['message']}")
    
    def test_advances_sync_excel(self, admin_headers):
        """POST /api/advances/sync-excel triggers advances Excel sync"""
        now = datetime.now()
        response = requests.post(
            f"{BASE_URL}/api/advances/sync-excel?month={now.month}&year={now.year}",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ POST /api/advances/sync-excel: {data['message']}")
    
    def test_penalties_sync_excel(self, admin_headers):
        """POST /api/penalties/sync-excel triggers penalties Excel sync"""
        now = datetime.now()
        response = requests.post(
            f"{BASE_URL}/api/penalties/sync-excel?month={now.month}&year={now.year}",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ POST /api/penalties/sync-excel: {data['message']}")


class TestHolidaysAPI:
    """Polish holidays API tests"""
    
    def test_get_holidays(self):
        """GET /api/holidays returns Polish holidays (no auth required)"""
        response = requests.get(f"{BASE_URL}/api/holidays?year=2026")
        assert response.status_code == 200
        data = response.json()
        assert "year" in data
        assert "holidays" in data
        assert data["year"] == 2026
        assert len(data["holidays"]) > 0
        print(f"✓ GET /api/holidays returned {len(data['holidays'])} holidays for 2026")
        # Check some known Polish holidays
        assert "2026-01-01" in data["holidays"]  # New Year
        assert "2026-05-01" in data["holidays"]  # Labor Day
        assert "2026-12-25" in data["holidays"]  # Christmas


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
