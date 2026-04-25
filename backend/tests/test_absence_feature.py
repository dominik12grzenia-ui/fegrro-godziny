"""
Test suite for Absence Reporting Feature (Iteration 13)
Tests:
1. POST /api/public/absences/{token} - creates absence with future dates
2. GET /api/public/absences/{token} - returns absences for employee
3. DELETE /api/public/absences/{token}/{absence_id} - cancels pending absence
4. GET /api/absences?status=pending - returns pending absences for admin
5. PUT /api/absences/{absence_id}/review - approves/rejects absence
"""

import pytest
from tests.test_config import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://builder-clockin.preview.emergentagent.com')

# Test employee token from context
TEST_TOKEN = "evzB6oKirEwBLPoSHWTqJA"  # Jan Kowalski

# Admin credentials
ADMIN_EMAIL = TEST_ADMIN_EMAIL
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin login failed - skipping admin tests")


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestPublicAbsenceEndpoints:
    """Test public absence endpoints (no auth required)"""
    
    def test_get_absences_by_token(self, api_client):
        """GET /api/public/absences/{token} - returns absences for employee"""
        response = api_client.get(f"{BASE_URL}/api/public/absences/{TEST_TOKEN}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} existing absences for test employee")
    
    def test_get_absences_invalid_token(self, api_client):
        """GET /api/public/absences/{invalid_token} - returns 404"""
        response = api_client.get(f"{BASE_URL}/api/public/absences/invalid_token_12345")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_create_absence_future_dates(self, api_client):
        """POST /api/public/absences/{token} - creates absence with future dates"""
        # Calculate dates: tomorrow and day after
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        day_after = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        
        response = api_client.post(
            f"{BASE_URL}/api/public/absences/{TEST_TOKEN}",
            json={"dates": [tomorrow, day_after]}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain absence id"
        assert data["status"] == "pending", "New absence should be pending"
        assert tomorrow in data["dates"], "Tomorrow should be in dates"
        assert day_after in data["dates"], "Day after should be in dates"
        print(f"Created absence with id: {data['id']}")
        
        # Store for cleanup
        pytest.created_absence_id = data["id"]
    
    def test_create_absence_today_rejected(self, api_client):
        """POST /api/public/absences/{token} - rejects today's date"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        response = api_client.post(
            f"{BASE_URL}/api/public/absences/{TEST_TOKEN}",
            json={"dates": [today]}
        )
        
        assert response.status_code == 400, f"Expected 400 for today's date, got {response.status_code}"
        assert "jutra" in response.text.lower() or "tomorrow" in response.text.lower(), \
            "Error should mention tomorrow"
    
    def test_create_absence_past_date_rejected(self, api_client):
        """POST /api/public/absences/{token} - rejects past dates"""
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = api_client.post(
            f"{BASE_URL}/api/public/absences/{TEST_TOKEN}",
            json={"dates": [yesterday]}
        )
        
        assert response.status_code == 400, f"Expected 400 for past date, got {response.status_code}"
    
    def test_cancel_pending_absence(self, api_client):
        """DELETE /api/public/absences/{token}/{absence_id} - cancels pending absence"""
        # First create an absence to cancel
        future_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        
        create_response = api_client.post(
            f"{BASE_URL}/api/public/absences/{TEST_TOKEN}",
            json={"dates": [future_date]}
        )
        assert create_response.status_code == 200
        absence_id = create_response.json()["id"]
        
        # Now cancel it
        delete_response = api_client.delete(
            f"{BASE_URL}/api/public/absences/{TEST_TOKEN}/{absence_id}"
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        assert "anulowana" in delete_response.text.lower(), "Response should confirm cancellation"
    
    def test_cancel_nonexistent_absence(self, api_client):
        """DELETE /api/public/absences/{token}/{invalid_id} - returns 404"""
        response = api_client.delete(
            f"{BASE_URL}/api/public/absences/{TEST_TOKEN}/nonexistent-id-12345"
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestAdminAbsenceEndpoints:
    """Test admin absence endpoints (auth required)"""
    
    def test_get_pending_absences(self, api_client, admin_token):
        """GET /api/absences?status=pending - returns pending absences"""
        response = api_client.get(
            f"{BASE_URL}/api/absences?status=pending",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} pending absences")
        
        # Verify structure of absence objects
        if len(data) > 0:
            absence = data[0]
            assert "id" in absence
            assert "employee_id" in absence
            assert "dates" in absence
            assert "status" in absence
    
    def test_get_all_absences(self, api_client, admin_token):
        """GET /api/absences - returns all absences"""
        response = api_client.get(
            f"{BASE_URL}/api/absences",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_approve_absence(self, api_client, admin_token):
        """PUT /api/absences/{absence_id}/review with status=approved"""
        # First create an absence to approve
        future_date = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        
        create_response = api_client.post(
            f"{BASE_URL}/api/public/absences/{TEST_TOKEN}",
            json={"dates": [future_date]}
        )
        assert create_response.status_code == 200
        absence_id = create_response.json()["id"]
        
        # Approve it
        approve_response = api_client.put(
            f"{BASE_URL}/api/absences/{absence_id}/review",
            json={"status": "approved"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert approve_response.status_code == 200, f"Expected 200, got {approve_response.status_code}"
        
        # Verify it's approved
        get_response = api_client.get(
            f"{BASE_URL}/api/public/absences/{TEST_TOKEN}"
        )
        absences = get_response.json()
        approved_absence = next((a for a in absences if a["id"] == absence_id), None)
        assert approved_absence is not None
        assert approved_absence["status"] == "approved"
    
    def test_reject_absence(self, api_client, admin_token):
        """PUT /api/absences/{absence_id}/review with status=rejected"""
        # First create an absence to reject
        future_date = (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d")
        
        create_response = api_client.post(
            f"{BASE_URL}/api/public/absences/{TEST_TOKEN}",
            json={"dates": [future_date]}
        )
        assert create_response.status_code == 200
        absence_id = create_response.json()["id"]
        
        # Reject it
        reject_response = api_client.put(
            f"{BASE_URL}/api/absences/{absence_id}/review",
            json={"status": "rejected"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert reject_response.status_code == 200, f"Expected 200, got {reject_response.status_code}"
        
        # Verify it's rejected
        get_response = api_client.get(
            f"{BASE_URL}/api/public/absences/{TEST_TOKEN}"
        )
        absences = get_response.json()
        rejected_absence = next((a for a in absences if a["id"] == absence_id), None)
        assert rejected_absence is not None
        assert rejected_absence["status"] == "rejected"
    
    def test_review_nonexistent_absence(self, api_client, admin_token):
        """PUT /api/absences/{invalid_id}/review - returns 404"""
        response = api_client.put(
            f"{BASE_URL}/api/absences/nonexistent-id-12345/review",
            json={"status": "approved"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestPublicHoursWithAbsences:
    """Test public hours endpoint includes absence data"""
    
    def test_public_hours_returns_data(self, api_client):
        """GET /api/public/hours/{token} - returns employee data"""
        response = api_client.get(f"{BASE_URL}/api/public/hours/{TEST_TOKEN}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "employee_name" in data, "Should have employee_name"
        assert "entries" in data, "Should have entries"
        assert "assignments" in data, "Should have assignments"
        assert "site_names" in data, "Should have site_names"
        
        print(f"Employee: {data['employee_name']}")
        print(f"Entries count: {len(data['entries'])}")


class TestHolidaysEndpoint:
    """Test holidays endpoint for calendar display"""
    
    def test_get_holidays_2026(self, api_client):
        """GET /api/holidays?year=2026 - returns Polish holidays"""
        response = api_client.get(f"{BASE_URL}/api/holidays?year=2026")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "year" in data
        assert data["year"] == 2026
        assert "holidays" in data
        assert isinstance(data["holidays"], list)
        assert len(data["holidays"]) > 0
        
        # Check some known Polish holidays
        holidays = data["holidays"]
        assert "2026-01-01" in holidays, "New Year should be a holiday"
        assert "2026-12-25" in holidays, "Christmas should be a holiday"
        
        print(f"Found {len(holidays)} holidays for 2026")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
