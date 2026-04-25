import requests
import sys
import json
from datetime import datetime, date, timedelta

class FeGrroAPITester:
    def __init__(self, base_url="https://builder-clockin.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.worker_user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_employee_id = None
        self.test_site_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if headers:
            test_headers.update(headers)
        
        if self.admin_token:
            test_headers['Authorization'] = f'Bearer {self.admin_token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "health",
            200
        )
        return success

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/admin/login",
            200,
            data={"email": "admin@fegrro.pl", "password": "Admin123!"}
        )
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
            return True
        return False

    def test_admin_login_invalid(self):
        """Test admin login with invalid credentials"""
        success, response = self.run_test(
            "Admin Login (Invalid)",
            "POST",
            "auth/admin/login",
            401,
            data={"email": "admin@fegrro.pl", "password": "wrongpassword"}
        )
        return success

    def test_worker_registration(self):
        """Test worker registration"""
        success, response = self.run_test(
            "Worker Registration",
            "POST",
            "auth/worker/register",
            200,
            data={"full_name": "Jan Testowy"}
        )
        if success and 'user_id' in response:
            self.worker_user_id = response['user_id']
            print(f"   Worker user_id: {self.worker_user_id}")
            return True
        return False

    def test_get_employees(self):
        """Test getting employees list"""
        success, response = self.run_test(
            "Get Employees",
            "GET",
            "employees",
            200
        )
        if success and isinstance(response, list):
            print(f"   Found {len(response)} employees")
            if len(response) > 0:
                self.test_employee_id = response[0]['id']
                print(f"   Using employee ID: {self.test_employee_id}")
        return success

    def test_create_employee(self):
        """Test creating an employee"""
        success, response = self.run_test(
            "Create Employee",
            "POST",
            "employees",
            200,
            data={"full_name": "Test Employee", "phone_number": "+48123456789"}
        )
        if success and 'id' in response:
            print(f"   Created employee ID: {response['id']}")
        return success

    def test_get_sites(self):
        """Test getting construction sites"""
        success, response = self.run_test(
            "Get Construction Sites",
            "GET",
            "sites",
            200
        )
        if success and isinstance(response, list):
            print(f"   Found {len(response)} sites")
            if len(response) > 0:
                self.test_site_id = response[0]['id']
                print(f"   Using site ID: {self.test_site_id}")
        return success

    def test_create_site(self):
        """Test creating a construction site"""
        success, response = self.run_test(
            "Create Construction Site",
            "POST",
            "sites",
            200,
            data={
                "name": "Test Budowa",
                "location_lat": 54.5189,
                "location_lng": 18.5305,
                "google_maps_url": "https://maps.google.com/test",
                "month": "STYCZEŃ"
            }
        )
        if success and 'id' in response:
            print(f"   Created site ID: {response['id']}")
            if not self.test_site_id:
                self.test_site_id = response['id']
        return success

    def test_create_assignment(self):
        """Test creating employee assignment"""
        if not self.test_employee_id or not self.test_site_id:
            print("❌ Skipping assignment test - missing employee or site ID")
            return False
            
        success, response = self.run_test(
            "Create Assignment",
            "POST",
            "assignments",
            200,
            data={
                "employee_id": self.test_employee_id,
                "site_id": self.test_site_id,
                "month": "STYCZEŃ",
                "year": 2025,
                "assign_full_month": True
            }
        )
        return success

    def test_get_assignments(self):
        """Test getting assignments"""
        success, response = self.run_test(
            "Get Assignments",
            "GET",
            "assignments",
            200
        )
        if success and isinstance(response, list):
            print(f"   Found {len(response)} assignments")
        return success

    def test_create_hour_entry(self):
        """Test creating hour entry"""
        if not self.test_employee_id or not self.test_site_id:
            print("❌ Skipping hour entry test - missing employee or site ID")
            return False
            
        today = date.today().strftime('%Y-%m-%d')
        success, response = self.run_test(
            "Create Hour Entry",
            "POST",
            "hours",
            200,
            data={
                "employee_id": self.test_employee_id,
                "site_id": self.test_site_id,
                "work_date": today,
                "hours_worked": 8,
                "is_absent": False,
                "notes": "Test entry"
            }
        )
        return success

    def test_create_hour_entry_invalid_date(self):
        """Test creating hour entry with invalid date (not today/yesterday)"""
        if not self.test_employee_id or not self.test_site_id:
            print("❌ Skipping invalid date test - missing employee or site ID")
            return False
            
        future_date = (date.today() + timedelta(days=2)).strftime('%Y-%m-%d')
        success, response = self.run_test(
            "Create Hour Entry (Invalid Date)",
            "POST",
            "hours",
            400,
            data={
                "employee_id": self.test_employee_id,
                "site_id": self.test_site_id,
                "work_date": future_date,
                "hours_worked": 8,
                "is_absent": False
            }
        )
        return success

    def test_create_hour_entry_invalid_hours(self):
        """Test creating hour entry with invalid hours (>14)"""
        if not self.test_employee_id or not self.test_site_id:
            print("❌ Skipping invalid hours test - missing employee or site ID")
            return False
            
        today = date.today().strftime('%Y-%m-%d')
        success, response = self.run_test(
            "Create Hour Entry (Invalid Hours)",
            "POST",
            "hours",
            400,
            data={
                "employee_id": self.test_employee_id,
                "site_id": self.test_site_id,
                "work_date": today,
                "hours_worked": 15,
                "is_absent": False
            }
        )
        return success

    def test_get_hour_entries(self):
        """Test getting hour entries"""
        success, response = self.run_test(
            "Get Hour Entries",
            "GET",
            "hours",
            200
        )
        if success and isinstance(response, list):
            print(f"   Found {len(response)} hour entries")
        return success

    def test_create_hour_request(self):
        """Test creating hour request"""
        if not self.test_site_id:
            print("❌ Skipping hour request test - missing site ID")
            return False
            
        past_date = (date.today() - timedelta(days=3)).strftime('%Y-%m-%d')
        success, response = self.run_test(
            "Create Hour Request",
            "POST",
            "requests",
            200,
            data={
                "site_id": self.test_site_id,
                "work_date": past_date,
                "hours_worked": 8,
                "reason": "Zapomniałem wpisać godziny"
            }
        )
        return success

    def test_get_hour_requests(self):
        """Test getting hour requests"""
        success, response = self.run_test(
            "Get Hour Requests",
            "GET",
            "requests",
            200
        )
        if success and isinstance(response, list):
            print(f"   Found {len(response)} hour requests")
        return success

    def test_monthly_report(self):
        """Test monthly report generation"""
        success, response = self.run_test(
            "Monthly Report",
            "GET",
            "reports/monthly?month=STYCZEŃ&year=2025",
            200
        )
        if success:
            print(f"   Report generated for STYCZEŃ 2025")
            if 'total_hours' in response:
                print(f"   Total hours: {response['total_hours']}")
        return success

    def test_sync_endpoints(self):
        """Test sync endpoints"""
        success1, _ = self.run_test(
            "Trigger Sync",
            "POST",
            "sync/trigger",
            200
        )
        
        success2, _ = self.run_test(
            "Get Sync Logs",
            "GET",
            "sync/logs",
            200
        )
        
        return success1 and success2

def main():
    print("🚀 Starting FeGrro API Testing...")
    print("=" * 50)
    
    tester = FeGrroAPITester()
    
    # Test sequence
    tests = [
        tester.test_health_check,
        tester.test_admin_login_invalid,
        tester.test_admin_login,
        tester.test_worker_registration,
        tester.test_get_employees,
        tester.test_create_employee,
        tester.test_get_sites,
        tester.test_create_site,
        tester.test_create_assignment,
        tester.test_get_assignments,
        tester.test_create_hour_entry,
        tester.test_create_hour_entry_invalid_date,
        tester.test_create_hour_entry_invalid_hours,
        tester.test_get_hour_entries,
        tester.test_create_hour_request,
        tester.test_get_hour_requests,
        tester.test_monthly_report,
        tester.test_sync_endpoints
    ]
    
    # Run all tests
    for test in tests:
        try:
            test()
        except Exception as e:
            print(f"❌ Test failed with exception: {str(e)}")
    
    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"📈 Success Rate: {success_rate:.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())