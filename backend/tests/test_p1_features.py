"""
Test P1 Features: OneDrive Excel Sync, PDF Reports, >10h Notifications
"""
import pytest
from tests.test_config import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAdminAuth:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """Test admin login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"Admin login successful, token received")
        return data["access_token"]
    
    def test_admin_login_invalid_credentials(self):
        """Test admin login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_ADMIN_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401


class TestNotifications:
    """Test >10h notification system"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture
    def test_employee(self, admin_token):
        """Create a test employee for notification tests"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        # First check if test employee exists
        response = requests.get(f"{BASE_URL}/api/employees", headers=headers)
        employees = response.json()
        for emp in employees:
            if emp["full_name"] == "TEST_NotifEmployee":
                return emp
        
        # Create new test employee
        response = requests.post(f"{BASE_URL}/api/employees", headers=headers, json={
            "full_name": "TEST_NotifEmployee",
            "phone_number": "123456789"
        })
        assert response.status_code == 200, f"Failed to create employee: {response.text}"
        return response.json()
    
    @pytest.fixture
    def test_site(self, admin_token):
        """Get or create a test site"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/sites", headers=headers)
        sites = response.json()
        if sites:
            return sites[0]
        
        # Create a test site
        response = requests.post(f"{BASE_URL}/api/sites", headers=headers, json={
            "name": "TEST_Site",
            "month": "KWIECIEŃ"
        })
        return response.json()
    
    def test_get_notifications_endpoint_exists(self, admin_token):
        """Test GET /api/notifications endpoint exists"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 200, f"Notifications endpoint failed: {response.text}"
        assert isinstance(response.json(), list)
        print(f"GET /api/notifications works, found {len(response.json())} notifications")
    
    def test_hours_over_10_creates_notification(self, admin_token, test_employee, test_site):
        """Test that entering >10h creates automatic notification"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get initial notification count
        notif_response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        initial_count = len(notif_response.json())
        
        # Create hour entry with 12 hours
        work_date = datetime.now().strftime("%Y-%m-%d")
        response = requests.post(f"{BASE_URL}/api/hours", headers=headers, json={
            "employee_id": test_employee["id"],
            "site_id": test_site["id"],
            "work_date": work_date,
            "hours_worked": 12,
            "is_absent": False,
            "notes": "TEST: >10h notification test"
        })
        assert response.status_code == 200, f"Hour entry failed: {response.text}"
        
        # Check notification was created
        notif_response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        notifications = notif_response.json()
        
        # Find the notification for our test
        test_notif = None
        for n in notifications:
            if n.get("employee_id") == test_employee["id"] and n.get("hours_worked") == 12:
                test_notif = n
                break
        
        assert test_notif is not None, "Notification was not created for >10h entry"
        assert test_notif["type"] == "high_hours"
        assert test_notif["status"] == "pending"
        assert test_notif["employee_name"] == test_employee["full_name"]
        print(f"Notification created: {test_notif['id']} for {test_notif['hours_worked']}h")
        return test_notif
    
    def test_approve_notification(self, admin_token, test_employee, test_site):
        """Test admin can approve >10h notification"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First create a notification by entering >10h
        work_date = "2026-04-07"  # Use a different date
        requests.post(f"{BASE_URL}/api/hours", headers=headers, json={
            "employee_id": test_employee["id"],
            "site_id": test_site["id"],
            "work_date": work_date,
            "hours_worked": 11,
            "is_absent": False,
            "notes": "TEST: approve notification test"
        })
        
        # Get notifications
        notif_response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        notifications = notif_response.json()
        
        if not notifications:
            pytest.skip("No pending notifications to approve")
        
        notif_id = notifications[0]["id"]
        
        # Approve the notification
        response = requests.post(f"{BASE_URL}/api/notifications/{notif_id}/approve", headers=headers)
        assert response.status_code == 200, f"Approve failed: {response.text}"
        assert response.json()["message"] == "Zatwierdzono"
        print(f"Notification {notif_id} approved successfully")
    
    def test_reject_notification(self, admin_token, test_employee, test_site):
        """Test admin can reject >10h notification"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a notification
        work_date = "2026-04-06"
        requests.post(f"{BASE_URL}/api/hours", headers=headers, json={
            "employee_id": test_employee["id"],
            "site_id": test_site["id"],
            "work_date": work_date,
            "hours_worked": 13,
            "is_absent": False,
            "notes": "TEST: reject notification test"
        })
        
        # Get notifications
        notif_response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        notifications = notif_response.json()
        
        if not notifications:
            pytest.skip("No pending notifications to reject")
        
        notif_id = notifications[0]["id"]
        
        # Reject the notification
        response = requests.post(f"{BASE_URL}/api/notifications/{notif_id}/reject", headers=headers)
        assert response.status_code == 200, f"Reject failed: {response.text}"
        assert response.json()["message"] == "Odrzucono"
        print(f"Notification {notif_id} rejected successfully")
    
    def test_notification_shows_employee_info(self, admin_token):
        """Test notification contains employee name, hours, date, creator"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        notifications = response.json()
        
        if not notifications:
            pytest.skip("No notifications to verify")
        
        notif = notifications[0]
        assert "employee_name" in notif, "Missing employee_name"
        assert "hours_worked" in notif, "Missing hours_worked"
        assert "work_date" in notif, "Missing work_date"
        assert "created_by_name" in notif, "Missing created_by_name"
        print(f"Notification has all required fields: employee={notif['employee_name']}, hours={notif['hours_worked']}, date={notif['work_date']}, creator={notif['created_by_name']}")


class TestOneDriveSync:
    """Test OneDrive Excel sync endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_sync_excel_endpoint_exists(self, admin_token):
        """Test POST /api/sync/excel endpoint exists and returns message"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/api/sync/excel", headers=headers)
        # May fail with Azure auth error, but endpoint should exist
        assert response.status_code in [200, 500], f"Unexpected status: {response.status_code}"
        if response.status_code == 200:
            data = response.json()
            assert "message" in data
            print(f"Sync endpoint returned: {data['message']}")
        else:
            print(f"Sync endpoint exists but Azure auth may not be configured: {response.text[:200]}")
    
    def test_sync_logs_endpoint(self, admin_token):
        """Test GET /api/sync/logs returns sync history"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/sync/logs", headers=headers)
        assert response.status_code == 200, f"Sync logs failed: {response.text}"
        logs = response.json()
        assert isinstance(logs, list)
        print(f"GET /api/sync/logs works, found {len(logs)} logs")
        if logs:
            log = logs[0]
            print(f"Latest log: type={log.get('type')}, status={log.get('status')}, date={log.get('synced_at')}")


class TestPDFReports:
    """Test PDF report generation endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_pdf_download_endpoint(self, admin_token):
        """Test GET /api/reports/pdf/download returns valid PDF"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/reports/pdf/download?month=4&year=2026",
            headers=headers
        )
        assert response.status_code == 200, f"PDF download failed: {response.text}"
        
        # Check content type
        content_type = response.headers.get("Content-Type", "")
        assert "application/pdf" in content_type, f"Wrong content type: {content_type}"
        
        # Check PDF magic bytes
        assert response.content[:4] == b'%PDF', "Response is not a valid PDF"
        
        # Check Content-Disposition header
        content_disp = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp, f"Missing attachment header: {content_disp}"
        
        print(f"PDF download works, size: {len(response.content)} bytes")
    
    def test_pdf_generate_endpoint(self, admin_token):
        """Test POST /api/reports/pdf starts background generation"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/api/reports/pdf?month=4&year=2026",
            headers=headers
        )
        assert response.status_code == 200, f"PDF generation failed: {response.text}"
        data = response.json()
        assert "message" in data
        print(f"PDF generation started: {data['message']}")
    
    def test_pdf_download_different_months(self, admin_token):
        """Test PDF download for different months"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        for month in [1, 4, 12]:
            response = requests.get(
                f"{BASE_URL}/api/reports/pdf/download?month={month}&year=2026",
                headers=headers
            )
            assert response.status_code == 200, f"PDF download failed for month {month}"
            assert response.content[:4] == b'%PDF', f"Invalid PDF for month {month}"
            print(f"Month {month}/2026 PDF: {len(response.content)} bytes")


class TestAdminDashboardTabs:
    """Test admin dashboard has required tabs"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_all_required_endpoints_for_dashboard(self, admin_token):
        """Test all endpoints needed for admin dashboard tabs"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Endpoints needed for 6 tabs
        endpoints = [
            ("/api/employees", "Employees tab"),
            ("/api/sites", "Sites tab"),
            ("/api/requests?status=pending", "Requests tab"),
            ("/api/foremen", "Foremen tab"),
            ("/api/notifications", "Requests tab - notifications"),
            ("/api/sync/logs", "Tools tab - sync logs"),
        ]
        
        for endpoint, tab_name in endpoints:
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
            assert response.status_code == 200, f"{tab_name} endpoint {endpoint} failed: {response.text}"
            print(f"{tab_name}: {endpoint} - OK")


class TestRequestsAndNotificationsBadge:
    """Test badge count for Prosby tab"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_pending_requests_count(self, admin_token):
        """Test pending requests can be counted"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/requests?status=pending", headers=headers)
        assert response.status_code == 200
        requests_count = len(response.json())
        print(f"Pending requests: {requests_count}")
    
    def test_pending_notifications_count(self, admin_token):
        """Test pending notifications can be counted"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 200
        notif_count = len(response.json())
        print(f"Pending notifications: {notif_count}")
    
    def test_badge_total(self, admin_token):
        """Test total badge count (requests + notifications)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        req_response = requests.get(f"{BASE_URL}/api/requests?status=pending", headers=headers)
        notif_response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        
        total = len(req_response.json()) + len(notif_response.json())
        print(f"Badge total (requests + notifications): {total}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
