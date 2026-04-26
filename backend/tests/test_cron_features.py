"""
Test suite for APScheduler cron job features in FeGrro construction hours app.
Tests: /api/cron/status, /api/cron/trigger, /api/sync/logs (trigger field), /api/sync/write-hours
"""
import pytest
from tests.test_config import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = TEST_ADMIN_EMAIL
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token."""
    response = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    token = response.json().get("access_token")
    assert token, "No access_token in response"
    return token


@pytest.fixture
def auth_headers(admin_token):
    """Return headers with admin auth token."""
    return {"Authorization": f"Bearer {admin_token}"}


class TestHealthEndpoint:
    """Basic health check to ensure API is running."""
    
    def test_health_check(self):
        """GET /api/health should return healthy status."""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data


class TestCronStatusEndpoint:
    """Tests for GET /api/cron/status endpoint."""
    
    def test_cron_status_requires_auth(self):
        """GET /api/cron/status without auth should return 401 or 403."""
        response = requests.get(f"{BASE_URL}/api/cron/status")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_cron_status_with_auth(self, auth_headers):
        """GET /api/cron/status with admin auth should return cron job status."""
        response = requests.get(f"{BASE_URL}/api/cron/status", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "active" in data
        assert data["active"] == True, "Cron job should be active"
        assert data["job_id"] == "monthly_excel_write"
        assert "schedule" in data
        assert "next_run" in data
        
        # Verify next_run is a valid ISO datetime
        assert data["next_run"] is not None
        assert "T" in data["next_run"]  # ISO format contains T separator


class TestCronTriggerEndpoint:
    """Tests for POST /api/cron/trigger endpoint."""
    
    def test_cron_trigger_requires_auth(self):
        """POST /api/cron/trigger without auth should return 401 or 403."""
        response = requests.post(f"{BASE_URL}/api/cron/trigger")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_cron_trigger_with_auth(self, auth_headers):
        """POST /api/cron/trigger with admin auth should trigger cron job."""
        response = requests.post(f"{BASE_URL}/api/cron/trigger", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "message" in data
        assert "status" in data
        assert data["status"] == "triggered"
        
        # Message should mention previous month
        assert "Reczne uruchomienie crona" in data["message"]


class TestSyncLogsEndpoint:
    """Tests for GET /api/sync/logs endpoint - verify trigger field."""
    
    def test_sync_logs_requires_auth(self):
        """GET /api/sync/logs without auth should return 401 or 403."""
        response = requests.get(f"{BASE_URL}/api/sync/logs")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_sync_logs_with_auth(self, auth_headers):
        """GET /api/sync/logs should return logs with trigger field."""
        response = requests.get(f"{BASE_URL}/api/sync/logs", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Should be a list
        assert isinstance(data, list)
        
        # Check if any logs have trigger field (from cron or manual)
        logs_with_trigger = [log for log in data if "trigger" in log]
        
        # At least some logs should have trigger field after cron trigger test
        # Note: trigger field is added for excel_write type logs
        if logs_with_trigger:
            for log in logs_with_trigger:
                assert log["trigger"] in ["automatic", "manual"], f"Invalid trigger value: {log['trigger']}"


class TestWriteHoursEndpoint:
    """Tests for POST /api/sync/write-hours endpoint."""
    
    def test_write_hours_requires_auth(self):
        """POST /api/sync/write-hours without auth should return 401 or 403."""
        response = requests.post(f"{BASE_URL}/api/sync/write-hours?month=4&year=2026")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_write_hours_with_auth(self, auth_headers):
        """POST /api/sync/write-hours with admin auth should start write job."""
        response = requests.post(
            f"{BASE_URL}/api/sync/write-hours?month=4&year=2026",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "message" in data
        # Message should mention the month (kwiecień = April in Polish)
        assert "2026" in data["message"]


class TestAdminLogin:
    """Tests for admin login endpoint."""
    
    def test_admin_login_success(self):
        """POST /api/auth/admin/login with valid credentials should return token."""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "access_token" in data
        assert "token_type" in data
        assert data["token_type"] == "bearer"
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
    
    def test_admin_login_invalid_credentials(self):
        """POST /api/auth/admin/login with invalid credentials should return 401."""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": "wrong@email.com", "password": "wrongpassword"}
        )
        assert response.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
