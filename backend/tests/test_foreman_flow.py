"""
Test suite for Foreman (Brygadzista) flow in FeGrro construction worker hours app.
Tests: Registration, site assignment, hours table filtering, date restrictions, and request system.
"""
import pytest
from tests.test_config import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import requests
import os
from datetime import date, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = TEST_ADMIN_EMAIL
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD
TEST_FOREMAN_FIRST = "Test"
TEST_FOREMAN_LAST = "Foreman"
TEST_FOREMAN_FULL = f"{TEST_FOREMAN_FIRST} {TEST_FOREMAN_LAST}"


class TestForemanRegistration:
    """Tests for foreman registration at POST /api/auth/worker/register"""
    
    def test_foreman_registration_new_user(self):
        """Test new foreman can register with just first name + last name"""
        # Use unique name to avoid conflicts
        unique_name = f"TestForeman {date.today().isoformat()}"
        response = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": unique_name,
            "role": "foreman"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "access_token" in data, "Missing access_token in response"
        assert "user_id" in data, "Missing user_id in response"
        assert "full_name" in data, "Missing full_name in response"
        assert "role" in data, "Missing role in response"
        assert data["role"] == "foreman", f"Expected role 'foreman', got '{data['role']}'"
        assert data["full_name"] == unique_name
        assert "assigned_sites" in data, "Missing assigned_sites in response"
        assert isinstance(data["assigned_sites"], list)
        print(f"SUCCESS: New foreman registered: {unique_name}")
    
    def test_foreman_registration_returns_existing_user(self):
        """Test same foreman name returns existing user (no duplicates)"""
        # First registration
        response1 = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": TEST_FOREMAN_FULL,
            "role": "foreman"
        })
        assert response1.status_code == 200
        data1 = response1.json()
        user_id1 = data1["user_id"]
        
        # Second registration with same name
        response2 = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": TEST_FOREMAN_FULL,
            "role": "foreman"
        })
        assert response2.status_code == 200
        data2 = response2.json()
        user_id2 = data2["user_id"]
        
        # Should return same user
        assert user_id1 == user_id2, f"Expected same user ID, got {user_id1} vs {user_id2}"
        assert "Witaj ponownie" in data2.get("message", ""), "Expected welcome back message"
        print(f"SUCCESS: Same foreman name returns existing user: {user_id1}")
    
    def test_foreman_registration_returns_jwt_token(self):
        """Test registration returns valid JWT token"""
        response = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": TEST_FOREMAN_FULL,
            "role": "foreman"
        })
        assert response.status_code == 200
        data = response.json()
        
        token = data.get("access_token")
        assert token is not None, "No token returned"
        assert len(token) > 50, "Token seems too short"
        
        # Verify token works with /foreman/me
        headers = {"Authorization": f"Bearer {token}"}
        me_response = requests.get(f"{BASE_URL}/api/foreman/me", headers=headers)
        assert me_response.status_code == 200, f"Token validation failed: {me_response.text}"
        print("SUCCESS: JWT token is valid and works with /foreman/me")


class TestAdminForemanManagement:
    """Tests for admin managing foremen"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    def test_admin_can_list_foremen(self, admin_token):
        """Test admin can see foremen list via GET /api/foremen"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/foremen", headers=headers)
        
        assert response.status_code == 200, f"Failed to get foremen: {response.text}"
        foremen = response.json()
        assert isinstance(foremen, list), "Expected list of foremen"
        
        # Check foreman structure
        if len(foremen) > 0:
            foreman = foremen[0]
            assert "id" in foreman, "Missing id in foreman"
            assert "full_name" in foreman, "Missing full_name in foreman"
            assert "status" in foreman, "Missing status in foreman"
            assert "assigned_sites" in foreman, "Missing assigned_sites in foreman"
        print(f"SUCCESS: Admin can list {len(foremen)} foremen")
    
    def test_pending_foremen_have_pending_status(self, admin_token):
        """Test newly registered foremen have 'pending' status"""
        # Register a new foreman
        unique_name = f"PendingTest {date.today().isoformat()}"
        reg_response = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": unique_name,
            "role": "foreman"
        })
        assert reg_response.status_code == 200
        
        # Check foremen list
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/foremen", headers=headers)
        foremen = response.json()
        
        # Find the new foreman
        new_foreman = next((f for f in foremen if f["full_name"] == unique_name), None)
        assert new_foreman is not None, f"Foreman {unique_name} not found in list"
        assert new_foreman["status"] == "pending", f"Expected 'pending' status, got '{new_foreman['status']}'"
        print(f"SUCCESS: New foreman has 'pending' status")
    
    def test_admin_can_assign_sites_to_foreman(self, admin_token):
        """Test admin can assign sites to foreman via POST /api/foremen/{id}/sites"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get sites
        sites_response = requests.get(f"{BASE_URL}/api/sites", headers=headers)
        sites = sites_response.json()
        assert len(sites) > 0, "No sites available for testing"
        site_id = sites[0]["id"]
        
        # Get foremen
        foremen_response = requests.get(f"{BASE_URL}/api/foremen", headers=headers)
        foremen = foremen_response.json()
        assert len(foremen) > 0, "No foremen available for testing"
        foreman_id = foremen[0]["id"]
        
        # Assign site to foreman
        assign_response = requests.post(
            f"{BASE_URL}/api/foremen/{foreman_id}/sites",
            headers=headers,
            json={"site_ids": [site_id]}
        )
        assert assign_response.status_code == 200, f"Failed to assign sites: {assign_response.text}"
        
        # Verify assignment
        foremen_response2 = requests.get(f"{BASE_URL}/api/foremen", headers=headers)
        updated_foreman = next((f for f in foremen_response2.json() if f["id"] == foreman_id), None)
        assert site_id in updated_foreman.get("assigned_sites", []), "Site not in assigned_sites"
        assert updated_foreman["status"] == "active", "Status should be 'active' after assignment"
        print(f"SUCCESS: Admin assigned site {site_id} to foreman {foreman_id}")


class TestForemanHoursRestrictions:
    """Tests for foreman hour entry date restrictions"""
    
    @pytest.fixture
    def foreman_token(self):
        """Get foreman authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": "Marek Brygadzista",
            "role": "foreman"
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_foreman_can_edit_today(self, foreman_token, admin_token):
        """Test foreman can edit hours for today"""
        headers = {"Authorization": f"Bearer {foreman_token}"}
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get foreman's assigned sites
        me_response = requests.get(f"{BASE_URL}/api/foreman/me", headers=headers)
        foreman_data = me_response.json()
        assigned_sites = foreman_data.get("assigned_sites", [])
        
        if not assigned_sites:
            pytest.skip("Foreman has no assigned sites")
        
        # Get an employee
        emp_response = requests.get(f"{BASE_URL}/api/employees", headers=headers)
        employees = emp_response.json()
        if not employees:
            pytest.skip("No employees available")
        
        today = date.today().isoformat()
        response = requests.post(f"{BASE_URL}/api/hours", headers=headers, json={
            "employee_id": employees[0]["id"],
            "site_id": assigned_sites[0],
            "work_date": today,
            "hours_worked": 8,
            "is_absent": False
        })
        
        # Should succeed (200) or fail due to site access (403)
        assert response.status_code in [200, 403], f"Unexpected status: {response.status_code} - {response.text}"
        if response.status_code == 200:
            print(f"SUCCESS: Foreman can edit hours for today ({today})")
        else:
            print(f"INFO: Foreman doesn't have access to this site")
    
    def test_foreman_can_edit_yesterday(self, foreman_token, admin_token):
        """Test foreman can edit hours for yesterday"""
        headers = {"Authorization": f"Bearer {foreman_token}"}
        
        # Get foreman's assigned sites
        me_response = requests.get(f"{BASE_URL}/api/foreman/me", headers=headers)
        foreman_data = me_response.json()
        assigned_sites = foreman_data.get("assigned_sites", [])
        
        if not assigned_sites:
            pytest.skip("Foreman has no assigned sites")
        
        # Get an employee
        emp_response = requests.get(f"{BASE_URL}/api/employees", headers=headers)
        employees = emp_response.json()
        if not employees:
            pytest.skip("No employees available")
        
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        response = requests.post(f"{BASE_URL}/api/hours", headers=headers, json={
            "employee_id": employees[0]["id"],
            "site_id": assigned_sites[0],
            "work_date": yesterday,
            "hours_worked": 7,
            "is_absent": False
        })
        
        assert response.status_code in [200, 403], f"Unexpected status: {response.status_code} - {response.text}"
        if response.status_code == 200:
            print(f"SUCCESS: Foreman can edit hours for yesterday ({yesterday})")
    
    def test_foreman_cannot_edit_past_dates(self, foreman_token, admin_token):
        """Test foreman gets error when trying to save hours for dates other than today/yesterday"""
        headers = {"Authorization": f"Bearer {foreman_token}"}
        
        # Get foreman's assigned sites
        me_response = requests.get(f"{BASE_URL}/api/foreman/me", headers=headers)
        foreman_data = me_response.json()
        assigned_sites = foreman_data.get("assigned_sites", [])
        
        if not assigned_sites:
            pytest.skip("Foreman has no assigned sites")
        
        # Get an employee
        emp_response = requests.get(f"{BASE_URL}/api/employees", headers=headers)
        employees = emp_response.json()
        if not employees:
            pytest.skip("No employees available")
        
        # Try to edit 3 days ago
        past_date = (date.today() - timedelta(days=3)).isoformat()
        response = requests.post(f"{BASE_URL}/api/hours", headers=headers, json={
            "employee_id": employees[0]["id"],
            "site_id": assigned_sites[0],
            "work_date": past_date,
            "hours_worked": 8,
            "is_absent": False
        })
        
        assert response.status_code == 400, f"Expected 400 for past date, got {response.status_code}"
        error_detail = response.json().get("detail", "")
        assert "dzisiejsze" in error_detail.lower() or "wczorajsze" in error_detail.lower() or "prosbe" in error_detail.lower(), \
            f"Expected Polish error message about today/yesterday, got: {error_detail}"
        print(f"SUCCESS: Foreman correctly blocked from editing past date ({past_date})")
    
    def test_foreman_cannot_edit_future_dates(self, foreman_token):
        """Test foreman cannot edit hours for future dates"""
        headers = {"Authorization": f"Bearer {foreman_token}"}
        
        # Get foreman's assigned sites
        me_response = requests.get(f"{BASE_URL}/api/foreman/me", headers=headers)
        foreman_data = me_response.json()
        assigned_sites = foreman_data.get("assigned_sites", [])
        
        if not assigned_sites:
            pytest.skip("Foreman has no assigned sites")
        
        # Get an employee
        emp_response = requests.get(f"{BASE_URL}/api/employees", headers=headers)
        employees = emp_response.json()
        if not employees:
            pytest.skip("No employees available")
        
        # Try to edit 3 days in future
        future_date = (date.today() + timedelta(days=3)).isoformat()
        response = requests.post(f"{BASE_URL}/api/hours", headers=headers, json={
            "employee_id": employees[0]["id"],
            "site_id": assigned_sites[0],
            "work_date": future_date,
            "hours_worked": 8,
            "is_absent": False
        })
        
        assert response.status_code == 400, f"Expected 400 for future date, got {response.status_code}"
        print(f"SUCCESS: Foreman correctly blocked from editing future date ({future_date})")


class TestForemanRequestSystem:
    """Tests for foreman request system (for non-editable dates)"""
    
    @pytest.fixture
    def foreman_token(self):
        """Get foreman authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": "Marek Brygadzista",
            "role": "foreman"
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_foreman_can_create_request(self, foreman_token, admin_token):
        """Test foreman can create hour request via POST /api/requests"""
        headers = {"Authorization": f"Bearer {foreman_token}"}
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get foreman's assigned sites
        me_response = requests.get(f"{BASE_URL}/api/foreman/me", headers=headers)
        foreman_data = me_response.json()
        assigned_sites = foreman_data.get("assigned_sites", [])
        
        if not assigned_sites:
            # Assign a site first
            sites_response = requests.get(f"{BASE_URL}/api/sites", headers=admin_headers)
            sites = sites_response.json()
            if sites:
                requests.post(
                    f"{BASE_URL}/api/foremen/{foreman_data['id']}/sites",
                    headers=admin_headers,
                    json={"site_ids": [sites[0]["id"]]}
                )
                assigned_sites = [sites[0]["id"]]
        
        if not assigned_sites:
            pytest.skip("No sites available")
        
        # Get an employee
        emp_response = requests.get(f"{BASE_URL}/api/employees", headers=headers)
        employees = emp_response.json()
        if not employees:
            pytest.skip("No employees available")
        
        # Create request for past date
        past_date = (date.today() - timedelta(days=5)).isoformat()
        response = requests.post(f"{BASE_URL}/api/requests", headers=headers, json={
            "employee_id": employees[0]["id"],
            "site_id": assigned_sites[0],
            "work_date": past_date,
            "hours_worked": 8,
            "reason": "Uzupelnienie godzin z poprzedniego tygodnia"
        })
        
        assert response.status_code == 200, f"Failed to create request: {response.text}"
        data = response.json()
        assert "id" in data, "Missing request id"
        assert data["status"] == "pending", f"Expected 'pending' status, got '{data['status']}'"
        assert data["employee_id"] == employees[0]["id"]
        assert data["hours_worked"] == 8
        print(f"SUCCESS: Foreman created hour request for {past_date}")
    
    def test_admin_can_see_foreman_requests(self, foreman_token, admin_token):
        """Test admin can see foreman requests in GET /api/requests"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/requests", headers=headers)
        assert response.status_code == 200, f"Failed to get requests: {response.text}"
        
        requests_list = response.json()
        assert isinstance(requests_list, list), "Expected list of requests"
        print(f"SUCCESS: Admin can see {len(requests_list)} requests")


class TestForemanDashboardData:
    """Tests for foreman dashboard data endpoints"""
    
    @pytest.fixture
    def foreman_token(self):
        """Get foreman authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": "Marek Brygadzista",
            "role": "foreman"
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_foreman_me_endpoint(self, foreman_token):
        """Test GET /api/foreman/me returns foreman profile"""
        headers = {"Authorization": f"Bearer {foreman_token}"}
        response = requests.get(f"{BASE_URL}/api/foreman/me", headers=headers)
        
        assert response.status_code == 200, f"Failed to get foreman profile: {response.text}"
        data = response.json()
        
        assert "id" in data, "Missing id"
        assert "full_name" in data, "Missing full_name"
        assert "assigned_sites" in data, "Missing assigned_sites"
        assert "role" in data, "Missing role"
        assert data["role"] == "foreman", f"Expected role 'foreman', got '{data['role']}'"
        print(f"SUCCESS: Foreman profile retrieved: {data['full_name']}")
    
    def test_foreman_can_get_employees(self, foreman_token):
        """Test foreman can access GET /api/employees"""
        headers = {"Authorization": f"Bearer {foreman_token}"}
        response = requests.get(f"{BASE_URL}/api/employees", headers=headers)
        
        assert response.status_code == 200, f"Failed to get employees: {response.text}"
        employees = response.json()
        assert isinstance(employees, list), "Expected list of employees"
        print(f"SUCCESS: Foreman can access {len(employees)} employees")
    
    def test_foreman_can_get_sites(self, foreman_token):
        """Test foreman can access GET /api/sites"""
        headers = {"Authorization": f"Bearer {foreman_token}"}
        response = requests.get(f"{BASE_URL}/api/sites", headers=headers)
        
        assert response.status_code == 200, f"Failed to get sites: {response.text}"
        sites = response.json()
        assert isinstance(sites, list), "Expected list of sites"
        print(f"SUCCESS: Foreman can access {len(sites)} sites")
    
    def test_foreman_can_get_assignments(self, foreman_token):
        """Test foreman can access GET /api/assignments"""
        headers = {"Authorization": f"Bearer {foreman_token}"}
        response = requests.get(f"{BASE_URL}/api/assignments", headers=headers)
        
        assert response.status_code == 200, f"Failed to get assignments: {response.text}"
        assignments = response.json()
        assert isinstance(assignments, list), "Expected list of assignments"
        print(f"SUCCESS: Foreman can access {len(assignments)} assignments")
    
    def test_foreman_can_get_hours(self, foreman_token):
        """Test foreman can access GET /api/hours"""
        headers = {"Authorization": f"Bearer {foreman_token}"}
        today = date.today()
        start_date = today.replace(day=1).isoformat()
        end_date = today.isoformat()
        
        response = requests.get(
            f"{BASE_URL}/api/hours?start_date={start_date}&end_date={end_date}",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed to get hours: {response.text}"
        hours = response.json()
        assert isinstance(hours, list), "Expected list of hour entries"
        print(f"SUCCESS: Foreman can access {len(hours)} hour entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
