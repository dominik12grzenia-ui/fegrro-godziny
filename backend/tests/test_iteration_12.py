"""
Test iteration 12: Testing new features
- /foreman route (ForemanEntry component)
- PWA manifest and service worker
- Penalty CRUD with image upload
- Public hours link
"""
import pytest
from tests.test_config import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestForemanRegistration:
    """Test foreman registration endpoint"""
    
    def test_foreman_register_new_user(self):
        """Test registering a new foreman"""
        import time
        test_name = f"TestForeman_{int(time.time())}"
        
        response = requests.post(
            f"{BASE_URL}/api/auth/worker/register",
            json={"full_name": test_name, "role": "foreman"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "access_token" in data
        assert "user_id" in data
        assert "full_name" in data
        assert data["full_name"] == test_name
        assert data["role"] == "foreman"
        assert "assigned_sites" in data
        assert "message" in data
        
        print(f"✓ Foreman registration successful: {test_name}")
        
        # Store for cleanup
        self.created_foreman_id = data["user_id"]
        self.admin_token = self._get_admin_token()
        
        # Cleanup - delete the test foreman
        if self.admin_token:
            requests.delete(
                f"{BASE_URL}/api/foremen/{self.created_foreman_id}",
                headers={"Authorization": f"Bearer {self.admin_token}"}
            )
    
    def test_foreman_register_existing_user(self):
        """Test registering an existing foreman returns existing user"""
        # First register
        test_name = "ExistingForeman_Test"
        
        response1 = requests.post(
            f"{BASE_URL}/api/auth/worker/register",
            json={"full_name": test_name, "role": "foreman"}
        )
        assert response1.status_code == 200
        user_id_1 = response1.json()["user_id"]
        
        # Register again with same name
        response2 = requests.post(
            f"{BASE_URL}/api/auth/worker/register",
            json={"full_name": test_name, "role": "foreman"}
        )
        assert response2.status_code == 200
        user_id_2 = response2.json()["user_id"]
        
        # Should return same user
        assert user_id_1 == user_id_2
        assert response2.json()["message"] == "Witaj ponownie!"
        
        print("✓ Existing foreman login returns same user")
        
        # Cleanup
        admin_token = self._get_admin_token()
        if admin_token:
            requests.delete(
                f"{BASE_URL}/api/foremen/{user_id_1}",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
    
    def _get_admin_token(self):
        """Helper to get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        return None


class TestPWAAssets:
    """Test PWA manifest and service worker accessibility"""
    
    def test_manifest_json_accessible(self):
        """Test manifest.json is accessible and has correct structure"""
        response = requests.get(f"{BASE_URL}/manifest.json")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify required PWA manifest fields
        assert "name" in data
        assert "short_name" in data
        assert "start_url" in data
        assert "display" in data
        assert "icons" in data
        assert len(data["icons"]) > 0
        
        # Verify specific values
        assert data["name"] == "FeGrro Godziny"
        assert data["display"] == "standalone"
        
        print(f"✓ manifest.json accessible with name: {data['name']}")
    
    def test_service_worker_accessible(self):
        """Test sw.js is accessible"""
        response = requests.get(f"{BASE_URL}/sw.js")
        
        assert response.status_code == 200
        content = response.text
        
        # Verify it's a service worker
        assert "self.addEventListener" in content or "addEventListener" in content
        
        print("✓ sw.js accessible and contains service worker code")


class TestPenaltyCRUD:
    """Test penalty (Kary) CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: get admin token and employee ID"""
        # Get admin token
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get first employee
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        assert response.status_code == 200
        employees = response.json()
        assert len(employees) > 0
        self.employee_id = employees[0]["id"]
    
    def test_create_penalty(self):
        """Test creating a penalty"""
        penalty_data = {
            "employee_id": self.employee_id,
            "amount": 100,
            "description": "Test penalty from pytest",
            "month": 4,
            "year": 2026
        }
        
        response = requests.post(
            f"{BASE_URL}/api/penalties",
            json=penalty_data,
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert data["amount"] == 100
        assert data["description"] == "Test penalty from pytest"
        
        print(f"✓ Penalty created with ID: {data['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/penalties/{data['id']}", headers=self.headers)
    
    def test_create_penalty_with_image(self):
        """Test creating a penalty with base64 image"""
        # Small test image (1x1 red pixel PNG)
        test_image_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
        
        penalty_data = {
            "employee_id": self.employee_id,
            "amount": 50,
            "description": "Test penalty with image",
            "month": 4,
            "year": 2026,
            "image_data": test_image_base64
        }
        
        response = requests.post(
            f"{BASE_URL}/api/penalties",
            json=penalty_data,
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert data["amount"] == 50
        assert "image_data" in data
        assert data["image_data"] == test_image_base64
        
        print(f"✓ Penalty with image created with ID: {data['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/penalties/{data['id']}", headers=self.headers)
    
    def test_get_penalties(self):
        """Test getting penalties list"""
        response = requests.get(
            f"{BASE_URL}/api/penalties",
            params={"month": 4, "year": 2026},
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        print(f"✓ Got {len(data)} penalties")
    
    def test_get_penalties_summary(self):
        """Test getting penalties summary"""
        response = requests.get(
            f"{BASE_URL}/api/penalties/summary",
            params={"month": 4, "year": 2026},
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        
        print(f"✓ Got penalties summary for {len(data)} employees")
    
    def test_delete_penalty(self):
        """Test deleting a penalty"""
        # First create a penalty
        penalty_data = {
            "employee_id": self.employee_id,
            "amount": 25,
            "description": "Penalty to delete",
            "month": 4,
            "year": 2026
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/penalties",
            json=penalty_data,
            headers=self.headers
        )
        assert create_response.status_code == 200
        penalty_id = create_response.json()["id"]
        
        # Delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/penalties/{penalty_id}",
            headers=self.headers
        )
        
        assert delete_response.status_code == 200
        
        print(f"✓ Penalty {penalty_id} deleted successfully")
    
    def test_delete_nonexistent_penalty(self):
        """Test deleting a non-existent penalty returns 404"""
        response = requests.delete(
            f"{BASE_URL}/api/penalties/nonexistent-id-12345",
            headers=self.headers
        )
        
        assert response.status_code == 404
        print("✓ Delete non-existent penalty returns 404")


class TestPublicHoursLink:
    """Test public hours link functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: get admin token and generate public link"""
        # Get admin token
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get first employee
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        assert response.status_code == 200
        employees = response.json()
        assert len(employees) > 0
        self.employee_id = employees[0]["id"]
        
        # Generate public link
        response = requests.post(
            f"{BASE_URL}/api/employees/{self.employee_id}/generate-link",
            headers=self.headers
        )
        assert response.status_code == 200
        self.public_token = response.json()["token"]
    
    def test_public_hours_endpoint(self):
        """Test public hours endpoint returns data"""
        response = requests.get(
            f"{BASE_URL}/api/public/hours/{self.public_token}",
            params={"month": 4, "year": 2026}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # API returns employee_name, entries, assignments, site_names
        assert "employee_name" in data
        assert "entries" in data
        assert "assignments" in data
        
        print(f"✓ Public hours endpoint works for token: {self.public_token[:8]}...")
    
    def test_public_advances_endpoint(self):
        """Test public advances endpoint returns data"""
        response = requests.get(
            f"{BASE_URL}/api/public/advances/{self.public_token}",
            params={"month": 4, "year": 2026}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "advances" in data
        assert "total" in data
        
        print(f"✓ Public advances endpoint works")
    
    def test_public_penalties_endpoint(self):
        """Test public penalties endpoint returns data"""
        response = requests.get(
            f"{BASE_URL}/api/public/penalties/{self.public_token}",
            params={"month": 4, "year": 2026}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "penalties" in data
        assert "total" in data
        
        print(f"✓ Public penalties endpoint works")
    
    def test_invalid_public_token(self):
        """Test invalid public token returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/public/hours/invalid-token-12345"
        )
        
        assert response.status_code == 404
        print("✓ Invalid public token returns 404")


class TestAdminLogin:
    """Test admin login functionality"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        
        print("✓ Admin login successful")
    
    def test_admin_login_invalid_credentials(self):
        """Test admin login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": TEST_ADMIN_EMAIL, "password": "wrongpassword"}
        )
        
        assert response.status_code == 401
        print("✓ Invalid credentials return 401")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
