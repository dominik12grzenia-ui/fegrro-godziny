"""
Backend Refactor Tests - Iteration 16
Tests all API endpoints after backend was refactored from monolithic server.py to modular routes/
"""
import pytest
from tests.test_config import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://builder-clockin.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_EMAIL = TEST_ADMIN_EMAIL
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD


class TestHealthAndAuth:
    """Health check and authentication endpoints"""
    
    def test_health_check(self):
        """GET /api/health - Basic health check"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        print(f"✓ Health check passed: {data}")
    
    def test_admin_login_success(self):
        """POST /api/auth/admin/login - Admin login with valid credentials"""
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
        """POST /api/auth/admin/login - Admin login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": "wrong@email.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected")
    
    def test_get_me_authenticated(self):
        """GET /api/auth/me - Get current user info"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json()["access_token"]
        
        # Get me
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"
        print(f"✓ Get me successful: {data['full_name']}")
    
    def test_get_me_unauthenticated(self):
        """GET /api/auth/me - Should fail without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code in [401, 403]  # Both are valid for unauthenticated
        print(f"✓ Unauthenticated request correctly rejected with {response.status_code}")


class TestEmployees:
    """Employee CRUD endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_employees(self, auth_token):
        """GET /api/employees - List all employees"""
        response = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get employees: {len(data)} employees found")
        return data
    
    def test_create_employee(self, auth_token):
        """POST /api/employees - Create new employee"""
        response = requests.post(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "full_name": "TEST_Employee_Refactor",
                "phone_number": "+48123456789"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["full_name"] == "TEST_Employee_Refactor"
        assert "id" in data
        print(f"✓ Created employee: {data['full_name']} (id: {data['id']})")
        return data
    
    def test_get_employee_by_id(self, auth_token):
        """GET /api/employees/{id} - Get specific employee"""
        # First get list to find an employee
        list_resp = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        employees = list_resp.json()
        if employees:
            emp_id = employees[0]["id"]
            response = requests.get(
                f"{BASE_URL}/api/employees/{emp_id}",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == emp_id
            print(f"✓ Get employee by ID: {data['full_name']}")
        else:
            pytest.skip("No employees to test")
    
    def test_generate_employee_link(self, auth_token):
        """POST /api/employees/{id}/generate-link - Generate public link"""
        # Get first employee
        list_resp = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        employees = list_resp.json()
        if employees:
            emp_id = employees[0]["id"]
            response = requests.post(
                f"{BASE_URL}/api/employees/{emp_id}/generate-link",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            assert response.status_code == 200
            data = response.json()
            assert "token" in data
            print(f"✓ Generated link for employee: token={data['token'][:10]}...")
            return data["token"]
        else:
            pytest.skip("No employees to test")
    
    def test_generate_all_links(self, auth_token):
        """POST /api/employees/generate-all-links - Generate links for all employees"""
        response = requests.post(
            f"{BASE_URL}/api/employees/generate-all-links",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Generated links for {len(data)} employees")


class TestSites:
    """Construction site CRUD endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_sites(self, auth_token):
        """GET /api/sites - List all sites"""
        response = requests.get(
            f"{BASE_URL}/api/sites",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get sites: {len(data)} sites found")
        return data
    
    def test_create_site(self, auth_token):
        """POST /api/sites - Create new site"""
        response = requests.post(
            f"{BASE_URL}/api/sites",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_Site_Refactor",
                "location_lat": 52.2297,
                "location_lng": 21.0122,
                "google_maps_url": "https://maps.google.com/?q=52.2297,21.0122",
                "month": "KWIETNIA"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "TEST_Site_Refactor"
        assert "id" in data
        print(f"✓ Created site: {data['name']} (id: {data['id']})")
        return data
    
    def test_update_site(self, auth_token):
        """PUT /api/sites/{id} - Update site"""
        # First create a site
        create_resp = requests.post(
            f"{BASE_URL}/api/sites",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_Site_Update",
                "location_lat": 52.0,
                "location_lng": 21.0
            }
        )
        site_id = create_resp.json()["id"]
        
        # Update it
        response = requests.put(
            f"{BASE_URL}/api/sites/{site_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_Site_Updated"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "TEST_Site_Updated"
        print(f"✓ Updated site: {data['name']}")
    
    def test_delete_site(self, auth_token):
        """DELETE /api/sites/{id} - Deactivate site"""
        # First create a site
        create_resp = requests.post(
            f"{BASE_URL}/api/sites",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_Site_Delete",
                "location_lat": 52.0,
                "location_lng": 21.0
            }
        )
        site_id = create_resp.json()["id"]
        
        # Delete it
        response = requests.delete(
            f"{BASE_URL}/api/sites/{site_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        print(f"✓ Deleted (deactivated) site: {site_id}")
    
    def test_geocode(self, auth_token):
        """GET /api/geocode - Geocode address"""
        response = requests.get(
            f"{BASE_URL}/api/geocode",
            headers={"Authorization": f"Bearer {auth_token}"},
            params={"address": "Warsaw, Poland"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "lat" in data
        assert "lng" in data
        print(f"✓ Geocode: Warsaw at ({data['lat']}, {data['lng']})")


class TestForemen:
    """Foreman management endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_foremen(self, auth_token):
        """GET /api/foremen - List all foremen"""
        response = requests.get(
            f"{BASE_URL}/api/foremen",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get foremen: {len(data)} foremen found")
        return data
    
    def test_worker_register(self):
        """POST /api/auth/worker/register - Register new foreman"""
        response = requests.post(f"{BASE_URL}/api/auth/worker/register", json={
            "full_name": "TEST_Foreman_Refactor"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "foreman"
        print(f"✓ Registered foreman: {data['full_name']}")
        return data
    
    def test_assign_sites_to_foreman(self, auth_token):
        """POST /api/foremen/{id}/sites - Assign sites to foreman"""
        # First get foremen
        foremen_resp = requests.get(
            f"{BASE_URL}/api/foremen",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        foremen = foremen_resp.json()
        
        # Get sites
        sites_resp = requests.get(
            f"{BASE_URL}/api/sites",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        sites = sites_resp.json()
        
        if foremen and sites:
            foreman_id = foremen[0]["id"]
            site_ids = [sites[0]["id"]] if sites else []
            
            response = requests.post(
                f"{BASE_URL}/api/foremen/{foreman_id}/sites",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={"site_ids": site_ids}
            )
            assert response.status_code == 200
            print(f"✓ Assigned {len(site_ids)} sites to foreman")
        else:
            pytest.skip("No foremen or sites to test")


class TestHours:
    """Hour entry endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_hours(self, auth_token):
        """GET /api/hours - Get hour entries"""
        today = datetime.now()
        start_date = f"{today.year}-{today.month:02d}-01"
        end_date = f"{today.year}-{today.month:02d}-30"
        
        response = requests.get(
            f"{BASE_URL}/api/hours",
            headers={"Authorization": f"Bearer {auth_token}"},
            params={"start_date": start_date, "end_date": end_date}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get hours: {len(data)} entries found for {start_date} to {end_date}")
    
    def test_create_hour_entry(self, auth_token):
        """POST /api/hours - Create hour entry"""
        # Get employee and site
        emp_resp = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        employees = emp_resp.json()
        
        sites_resp = requests.get(
            f"{BASE_URL}/api/sites",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        sites = sites_resp.json()
        
        if employees and sites:
            today = datetime.now().strftime("%Y-%m-%d")
            response = requests.post(
                f"{BASE_URL}/api/hours",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={
                    "employee_id": employees[0]["id"],
                    "site_id": sites[0]["id"],
                    "work_date": today,
                    "hours_worked": 8,
                    "is_absent": False,
                    "notes": "TEST entry from refactor test"
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["hours_worked"] == 8
            print(f"✓ Created hour entry: {data['hours_worked']}h on {data['work_date']}")
        else:
            pytest.skip("No employees or sites to test")
    
    def test_check_existing_hours(self, auth_token):
        """GET /api/hours/check-existing - Check for existing hours"""
        emp_resp = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        employees = emp_resp.json()
        
        sites_resp = requests.get(
            f"{BASE_URL}/api/sites",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        sites = sites_resp.json()
        
        if employees and sites:
            today = datetime.now().strftime("%Y-%m-%d")
            response = requests.get(
                f"{BASE_URL}/api/hours/check-existing",
                headers={"Authorization": f"Bearer {auth_token}"},
                params={
                    "employee_id": employees[0]["id"],
                    "work_date": today,
                    "site_id": sites[0]["id"]
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert "has_hours" in data
            print(f"✓ Check existing hours: has_hours={data['has_hours']}")
        else:
            pytest.skip("No employees or sites to test")


class TestRequests:
    """Hour request endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_requests(self, auth_token):
        """GET /api/requests - Get hour requests"""
        response = requests.get(
            f"{BASE_URL}/api/requests",
            headers={"Authorization": f"Bearer {auth_token}"},
            params={"status": "pending"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get requests: {len(data)} pending requests")
    
    def test_get_notifications(self, auth_token):
        """GET /api/notifications - Get notifications"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get notifications: {len(data)} notifications")


class TestAbsences:
    """Absence management endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_absences(self, auth_token):
        """GET /api/absences - Get all absences"""
        response = requests.get(
            f"{BASE_URL}/api/absences",
            headers={"Authorization": f"Bearer {auth_token}"},
            params={"status": "pending"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get absences: {len(data)} pending absences")
    
    def test_public_absence_flow(self, auth_token):
        """Test public absence endpoints with employee token"""
        # Get employee with token
        emp_resp = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        employees = emp_resp.json()
        
        # Find employee with public_token or generate one
        for emp in employees:
            if emp.get("id"):
                link_resp = requests.post(
                    f"{BASE_URL}/api/employees/{emp['id']}/generate-link",
                    headers={"Authorization": f"Bearer {auth_token}"}
                )
                if link_resp.status_code == 200:
                    token = link_resp.json()["token"]
                    
                    # Get absences for this employee
                    abs_resp = requests.get(f"{BASE_URL}/api/public/absences/{token}")
                    assert abs_resp.status_code == 200
                    print(f"✓ Public absences endpoint working for token {token[:10]}...")
                    return
        
        pytest.skip("No employees with tokens to test")


class TestAdvances:
    """Advance payment endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_advances(self, auth_token):
        """GET /api/advances - Get advances"""
        response = requests.get(
            f"{BASE_URL}/api/advances",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get advances: {len(data)} advances found")
    
    def test_get_advances_summary(self, auth_token):
        """GET /api/advances/summary - Get advances summary"""
        now = datetime.now()
        response = requests.get(
            f"{BASE_URL}/api/advances/summary",
            headers={"Authorization": f"Bearer {auth_token}"},
            params={"month": now.month, "year": now.year}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ Get advances summary: {len(data)} employees with advances")
    
    def test_create_advance(self, auth_token):
        """POST /api/advances - Create advance"""
        emp_resp = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        employees = emp_resp.json()
        
        if employees:
            now = datetime.now()
            response = requests.post(
                f"{BASE_URL}/api/advances",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={
                    "employee_id": employees[0]["id"],
                    "amount": 100,
                    "month": now.month,
                    "year": now.year,
                    "note": "TEST advance from refactor test"
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["amount"] == 100
            print(f"✓ Created advance: {data['amount']} PLN")
            return data
        else:
            pytest.skip("No employees to test")


class TestPenalties:
    """Penalty endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_penalties(self, auth_token):
        """GET /api/penalties - Get penalties"""
        response = requests.get(
            f"{BASE_URL}/api/penalties",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get penalties: {len(data)} penalties found")
    
    def test_get_penalties_summary(self, auth_token):
        """GET /api/penalties/summary - Get penalties summary"""
        now = datetime.now()
        response = requests.get(
            f"{BASE_URL}/api/penalties/summary",
            headers={"Authorization": f"Bearer {auth_token}"},
            params={"month": now.month, "year": now.year}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ Get penalties summary: {len(data)} employees with penalties")
    
    def test_create_penalty(self, auth_token):
        """POST /api/penalties - Create penalty"""
        emp_resp = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        employees = emp_resp.json()
        
        if employees:
            now = datetime.now()
            response = requests.post(
                f"{BASE_URL}/api/penalties",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={
                    "employee_id": employees[0]["id"],
                    "amount": 50,
                    "month": now.month,
                    "year": now.year,
                    "description": "TEST penalty from refactor test"
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["amount"] == 50
            print(f"✓ Created penalty: {data['amount']} PLN")
        else:
            pytest.skip("No employees to test")


class TestSyncAndCron:
    """Sync and cron job endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_sync_logs(self, auth_token):
        """GET /api/sync/logs - Get sync logs"""
        response = requests.get(
            f"{BASE_URL}/api/sync/logs",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get sync logs: {len(data)} logs found")
    
    def test_get_cron_status(self, auth_token):
        """GET /api/cron/status - Get cron job status"""
        response = requests.get(
            f"{BASE_URL}/api/cron/status",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "active" in data
        assert "jobs" in data
        print(f"✓ Cron status: active={data['active']}, {len(data['jobs'])} jobs")


class TestReports:
    """Report endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_monthly_report(self, auth_token):
        """GET /api/reports/monthly - Get monthly report"""
        response = requests.get(
            f"{BASE_URL}/api/reports/monthly",
            headers={"Authorization": f"Bearer {auth_token}"},
            params={"month": "KWIETNIA", "year": 2026}
        )
        assert response.status_code == 200
        data = response.json()
        assert "month" in data
        assert "year" in data
        assert "site_reports" in data
        print(f"✓ Monthly report: {data['total_hours']} total hours")


class TestPublicEndpoints:
    """Public endpoints (no auth required)"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_holidays(self):
        """GET /api/holidays - Get Polish holidays"""
        response = requests.get(f"{BASE_URL}/api/holidays", params={"year": 2026})
        assert response.status_code == 200
        data = response.json()
        assert data["year"] == 2026
        assert "holidays" in data
        assert len(data["holidays"]) >= 10  # At least 10 Polish holidays
        print(f"✓ Get holidays: {len(data['holidays'])} holidays for 2026")
    
    def test_public_hours_with_token(self, auth_token):
        """GET /api/public/hours/{token} - Get public hours"""
        # Get employee with token
        emp_resp = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        employees = emp_resp.json()
        
        if employees:
            # Generate link for first employee
            link_resp = requests.post(
                f"{BASE_URL}/api/employees/{employees[0]['id']}/generate-link",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            if link_resp.status_code == 200:
                token = link_resp.json()["token"]
                
                # Get public hours
                response = requests.get(f"{BASE_URL}/api/public/hours/{token}")
                assert response.status_code == 200
                data = response.json()
                assert "employee_name" in data
                assert "entries" in data
                print(f"✓ Public hours: {len(data['entries'])} entries for {data['employee_name']}")
                return
        
        pytest.skip("No employees to test")
    
    def test_public_advances_with_token(self, auth_token):
        """GET /api/public/advances/{token} - Get public advances"""
        emp_resp = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        employees = emp_resp.json()
        
        if employees:
            link_resp = requests.post(
                f"{BASE_URL}/api/employees/{employees[0]['id']}/generate-link",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            if link_resp.status_code == 200:
                token = link_resp.json()["token"]
                
                response = requests.get(f"{BASE_URL}/api/public/advances/{token}")
                assert response.status_code == 200
                data = response.json()
                assert "advances" in data
                assert "total" in data
                print(f"✓ Public advances: total={data['total']} PLN")
                return
        
        pytest.skip("No employees to test")
    
    def test_public_penalties_with_token(self, auth_token):
        """GET /api/public/penalties/{token} - Get public penalties"""
        emp_resp = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        employees = emp_resp.json()
        
        if employees:
            link_resp = requests.post(
                f"{BASE_URL}/api/employees/{employees[0]['id']}/generate-link",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            if link_resp.status_code == 200:
                token = link_resp.json()["token"]
                
                response = requests.get(f"{BASE_URL}/api/public/penalties/{token}")
                assert response.status_code == 200
                data = response.json()
                assert "penalties" in data
                assert "total" in data
                print(f"✓ Public penalties: total={data['total']} PLN")
                return
        
        pytest.skip("No employees to test")


class TestAssignments:
    """Assignment endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_assignments(self, auth_token):
        """GET /api/assignments - Get assignments"""
        response = requests.get(
            f"{BASE_URL}/api/assignments",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get assignments: {len(data)} assignments found")
    
    def test_get_assignments_by_month(self, auth_token):
        """GET /api/assignments - Get assignments by month"""
        response = requests.get(
            f"{BASE_URL}/api/assignments",
            headers={"Authorization": f"Bearer {auth_token}"},
            params={"month": "KWIETNIA", "year": 2026}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get assignments for KWIETNIA 2026: {len(data)} assignments")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
