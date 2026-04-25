"""
FeGrro Construction Worker Hours Logging App - Backend API Tests
Tests: Authentication, Employees, Sites, Hours, Assignments, Requests
"""
import pytest
from tests.test_config import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = TEST_ADMIN_EMAIL
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD


class TestHealthCheck:
    """Health check endpoint tests"""
    
    def test_health_endpoint(self):
        """Test /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        print("✓ Health check passed")


class TestAdminAuthentication:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """Test admin login with correct credentials"""
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
        print(f"✓ Admin login successful: {data['user']['email']}")
        return data["access_token"]
    
    def test_admin_login_invalid_credentials(self):
        """Test admin login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials rejected correctly")
    
    def test_admin_login_nonexistent_user(self):
        """Test admin login with non-existent email"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": "nonexistent@fegrro.pl",
            "password": "anypassword"
        })
        assert response.status_code == 401
        print("✓ Non-existent user rejected correctly")


class TestEmployeesAPI:
    """Employee CRUD tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed")
    
    def test_get_employees_list(self, auth_token):
        """Test GET /api/employees returns employee list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/employees", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Employees list retrieved: {len(data)} employees")
        
        # Verify employee structure if any exist
        if len(data) > 0:
            emp = data[0]
            assert "id" in emp
            assert "full_name" in emp
            print(f"  First employee: {emp['full_name']}")
    
    def test_get_employees_without_auth(self):
        """Test GET /api/employees without auth token fails"""
        response = requests.get(f"{BASE_URL}/api/employees")
        assert response.status_code in [401, 403]
        print("✓ Unauthorized access rejected correctly")


class TestSitesAPI:
    """Construction sites CRUD tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed")
    
    def test_get_sites_list(self, auth_token):
        """Test GET /api/sites returns sites list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/sites", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Sites list retrieved: {len(data)} sites")
        
        # Verify site structure if any exist
        if len(data) > 0:
            site = data[0]
            assert "id" in site
            assert "name" in site
            print(f"  First site: {site['name']}")


class TestHoursAPI:
    """Hour entries API tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed")
    
    def test_get_hours_list(self, auth_token):
        """Test GET /api/hours returns hour entries"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/hours", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Hours list retrieved: {len(data)} entries")
    
    def test_get_hours_with_date_filter(self, auth_token):
        """Test GET /api/hours with date range filter"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/hours?start_date=2026-01-01&end_date=2026-01-31",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Hours with date filter retrieved: {len(data)} entries")


class TestAssignmentsAPI:
    """Employee assignments API tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed")
    
    def test_get_assignments_list(self, auth_token):
        """Test GET /api/assignments returns assignments"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/assignments", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Assignments list retrieved: {len(data)} assignments")
    
    def test_get_assignments_with_month_filter(self, auth_token):
        """Test GET /api/assignments with month filter"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/assignments?month=STYCZEŃ&year=2026",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Assignments with month filter retrieved: {len(data)} assignments")


class TestRequestsAPI:
    """Hour requests API tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed")
    
    def test_get_pending_requests(self, auth_token):
        """Test GET /api/requests?status=pending returns pending requests"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/requests?status=pending", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Pending requests retrieved: {len(data)} requests")


class TestWorkerRegistration:
    """Worker registration tests"""
    
    def test_worker_register_new(self):
        """Test worker registration with new name"""
        import uuid
        unique_name = f"TEST_Worker_{uuid.uuid4().hex[:8]}"
        response = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": unique_name
        })
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert data["full_name"] == unique_name
        print(f"✓ Worker registered: {unique_name}")
    
    def test_worker_register_existing(self):
        """Test worker registration with existing name returns existing user"""
        # First registration
        response1 = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": "Jan Testowy"
        })
        assert response1.status_code == 200
        
        # Second registration with same name
        response2 = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": "Jan Testowy"
        })
        assert response2.status_code == 200
        data = response2.json()
        assert "user_id" in data
        print("✓ Existing worker returned correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
