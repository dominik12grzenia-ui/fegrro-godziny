"""
Test new features for FeGrro construction hours app:
1. Polish holidays endpoint
2. Public employee hours link
3. Generate-all-links endpoint
4. Hour entry metadata (created_by_name, updated_by_name)
"""
import pytest
from tests.test_config import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPolishHolidays:
    """Test Polish public holidays endpoint"""
    
    def test_holidays_2026_returns_correct_fixed_holidays(self):
        """Test that fixed Polish holidays are returned for 2026"""
        response = requests.get(f"{BASE_URL}/api/holidays?year=2026")
        assert response.status_code == 200
        
        data = response.json()
        assert data["year"] == 2026
        holidays = data["holidays"]
        
        # Fixed holidays
        assert "2026-01-01" in holidays  # Nowy Rok
        assert "2026-01-06" in holidays  # Trzech Króli
        assert "2026-05-01" in holidays  # Święto Pracy
        assert "2026-05-03" in holidays  # Święto Konstytucji
        assert "2026-08-15" in holidays  # Wniebowzięcie NMP
        assert "2026-11-01" in holidays  # Wszystkich Świętych
        assert "2026-11-11" in holidays  # Święto Niepodległości
        assert "2026-12-25" in holidays  # Boże Narodzenie
        assert "2026-12-26" in holidays  # Drugi dzień BN
        
    def test_holidays_2026_easter_monday(self):
        """Test Easter Monday calculation for 2026 (April 6)"""
        response = requests.get(f"{BASE_URL}/api/holidays?year=2026")
        assert response.status_code == 200
        
        holidays = response.json()["holidays"]
        # Easter 2026 is April 5, so Easter Monday is April 6
        assert "2026-04-06" in holidays  # Poniedziałek Wielkanocny
        
    def test_holidays_2026_corpus_christi(self):
        """Test Corpus Christi calculation for 2026 (60 days after Easter)"""
        response = requests.get(f"{BASE_URL}/api/holidays?year=2026")
        assert response.status_code == 200
        
        holidays = response.json()["holidays"]
        # Easter 2026 is April 5, Corpus Christi is 60 days later = June 4
        assert "2026-06-04" in holidays  # Boże Ciało
        
    def test_holidays_2026_pentecost(self):
        """Test Pentecost calculation for 2026 (49 days after Easter)"""
        response = requests.get(f"{BASE_URL}/api/holidays?year=2026")
        assert response.status_code == 200
        
        holidays = response.json()["holidays"]
        # Easter 2026 is April 5, Pentecost is 49 days later = May 24
        assert "2026-05-24" in holidays  # Zesłanie Ducha Świętego
        
    def test_holidays_returns_sorted_list(self):
        """Test that holidays are returned in sorted order"""
        response = requests.get(f"{BASE_URL}/api/holidays?year=2026")
        assert response.status_code == 200
        
        holidays = response.json()["holidays"]
        assert holidays == sorted(holidays)
        
    def test_holidays_different_year(self):
        """Test holidays for a different year (2025)"""
        response = requests.get(f"{BASE_URL}/api/holidays?year=2025")
        assert response.status_code == 200
        
        data = response.json()
        assert data["year"] == 2025
        # Easter 2025 is April 20, so Easter Monday is April 21
        assert "2025-04-21" in data["holidays"]


class TestPublicHoursEndpoint:
    """Test public employee hours endpoint (no auth required)"""
    
    def test_public_hours_valid_token(self):
        """Test public hours endpoint with valid token"""
        # Jan Kowalski's token
        token = "evzB6oKirEwBLPoSHWTqJA"
        response = requests.get(f"{BASE_URL}/api/public/hours/{token}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["employee_name"] == "Jan Kowalski"
        assert "entries" in data
        assert "assignments" in data
        assert "site_names" in data
        
    def test_public_hours_returns_entries_with_site_names(self):
        """Test that entries include site_name field"""
        token = "evzB6oKirEwBLPoSHWTqJA"
        response = requests.get(f"{BASE_URL}/api/public/hours/{token}")
        assert response.status_code == 200
        
        data = response.json()
        if data["entries"]:
            entry = data["entries"][0]
            assert "site_name" in entry
            assert "work_date" in entry
            assert "hours_worked" in entry
            assert "site_id" in entry
            
    def test_public_hours_invalid_token(self):
        """Test public hours endpoint with invalid token returns 404"""
        response = requests.get(f"{BASE_URL}/api/public/hours/invalid_token_xyz")
        assert response.status_code == 404
        
    def test_public_hours_no_auth_required(self):
        """Test that public hours endpoint works without authentication"""
        token = "evzB6oKirEwBLPoSHWTqJA"
        # No Authorization header
        response = requests.get(f"{BASE_URL}/api/public/hours/{token}")
        assert response.status_code == 200


class TestGenerateLinksEndpoint:
    """Test generate-all-links endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
        
    def test_generate_all_links_requires_auth(self):
        """Test that generate-all-links requires authentication"""
        response = requests.post(f"{BASE_URL}/api/employees/generate-all-links")
        assert response.status_code == 401 or response.status_code == 403
        
    def test_generate_all_links_returns_employee_data(self, admin_token):
        """Test that generate-all-links returns employee data with tokens"""
        response = requests.post(
            f"{BASE_URL}/api/employees/generate-all-links",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        # Check first employee has required fields
        emp = data[0]
        assert "employee_id" in emp
        assert "full_name" in emp
        assert "phone_number" in emp
        assert "token" in emp
        
    def test_generate_all_links_tokens_are_valid(self, admin_token):
        """Test that generated tokens work with public hours endpoint"""
        response = requests.post(
            f"{BASE_URL}/api/employees/generate-all-links",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # Test first employee's token
        token = data[0]["token"]
        public_response = requests.get(f"{BASE_URL}/api/public/hours/{token}")
        assert public_response.status_code == 200
        
    def test_generate_all_links_idempotent(self, admin_token):
        """Test that calling generate-all-links twice returns same tokens"""
        response1 = requests.post(
            f"{BASE_URL}/api/employees/generate-all-links",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        response2 = requests.post(
            f"{BASE_URL}/api/employees/generate-all-links",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response1.status_code == 200
        assert response2.status_code == 200
        
        # Tokens should be the same (not regenerated)
        tokens1 = {e["employee_id"]: e["token"] for e in response1.json()}
        tokens2 = {e["employee_id"]: e["token"] for e in response2.json()}
        
        for emp_id in tokens1:
            if emp_id in tokens2:
                assert tokens1[emp_id] == tokens2[emp_id], "Tokens should be idempotent"


class TestHourEntryMetadata:
    """Test hour entry metadata (created_by_name, updated_by_name)"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
        
    def test_hours_endpoint_returns_metadata(self, admin_token):
        """Test that hours endpoint returns created_by_name and updated_by_name"""
        response = requests.get(
            f"{BASE_URL}/api/hours?start_date=2026-04-01&end_date=2026-04-30",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        if data:
            # Check that metadata fields are present
            entry = data[0]
            # These fields should be in the response
            assert "created_by_name" in entry or "updated_by_name" in entry


class TestAdminLogin:
    """Test admin login functionality"""
    
    def test_admin_login_success(self):
        """Test admin login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == TEST_ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        
    def test_admin_login_wrong_password(self):
        """Test admin login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_ADMIN_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        
    def test_admin_login_wrong_email(self):
        """Test admin login with wrong email"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": "wrong@fegrro.pl",
            "password": TEST_ADMIN_PASSWORD
        })
        assert response.status_code == 401
