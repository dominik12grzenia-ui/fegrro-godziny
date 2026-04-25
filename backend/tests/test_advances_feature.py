"""
Test suite for Advances (Zaliczki) feature
Tests: CRUD operations, carry-forward, public endpoint, auth requirements
"""
import pytest
from tests.test_config import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = TEST_ADMIN_EMAIL
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD


class TestAdvancesAuth:
    """Test that advances endpoints require admin authentication"""
    
    def test_get_advances_without_auth_returns_401_or_403(self):
        """GET /api/advances should require auth"""
        response = requests.get(f"{BASE_URL}/api/advances")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: GET /api/advances requires auth")
    
    def test_post_advances_without_auth_returns_401_or_403(self):
        """POST /api/advances should require auth"""
        response = requests.post(f"{BASE_URL}/api/advances", json={
            "employee_id": "test",
            "amount": 100,
            "month": 4,
            "year": 2026
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: POST /api/advances requires auth")
    
    def test_delete_advances_without_auth_returns_401_or_403(self):
        """DELETE /api/advances/{id} should require auth"""
        response = requests.delete(f"{BASE_URL}/api/advances/test-id")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: DELETE /api/advances requires auth")
    
    def test_carry_forward_without_auth_returns_401_or_403(self):
        """POST /api/advances/{id}/carry-forward should require auth"""
        response = requests.post(f"{BASE_URL}/api/advances/test-id/carry-forward", json={
            "amount": 50,
            "target_month": 5,
            "target_year": 2026
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: POST /api/advances/{id}/carry-forward requires auth")
    
    def test_advances_summary_without_auth_returns_401_or_403(self):
        """GET /api/advances/summary should require auth"""
        response = requests.get(f"{BASE_URL}/api/advances/summary?month=4&year=2026")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: GET /api/advances/summary requires auth")


class TestAdvancesCRUD:
    """Test CRUD operations for advances with admin auth"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token and create test employee"""
        # Login as admin
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get or create a test employee
        emp_resp = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        if emp_resp.status_code == 200 and len(emp_resp.json()) > 0:
            self.test_employee_id = emp_resp.json()[0]["id"]
            self.test_employee_name = emp_resp.json()[0]["full_name"]
        else:
            # Create a test employee
            create_emp = requests.post(f"{BASE_URL}/api/employees", headers=self.headers, json={
                "full_name": f"TEST_Advance_Worker_{uuid.uuid4().hex[:6]}"
            })
            if create_emp.status_code in [200, 201]:
                self.test_employee_id = create_emp.json()["id"]
                self.test_employee_name = create_emp.json()["full_name"]
            else:
                pytest.skip("Could not get or create test employee")
        
        yield
        
        # Cleanup: Delete test advances created during tests
        # (handled in individual tests)
    
    def test_create_advance_success(self):
        """POST /api/advances - create advance for employee"""
        payload = {
            "employee_id": self.test_employee_id,
            "amount": 500.0,
            "month": 4,
            "year": 2026,
            "note": "TEST_advance_note"
        }
        response = requests.post(f"{BASE_URL}/api/advances", headers=self.headers, json=payload)
        
        assert response.status_code in [200, 201], f"Create advance failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "id" in data, "Response should contain 'id'"
        assert data["employee_id"] == self.test_employee_id
        assert data["amount"] == 500.0
        assert data["month"] == 4
        assert data["year"] == 2026
        assert data["note"] == "TEST_advance_note"
        assert "created_at" in data
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/advances/{data['id']}", headers=self.headers)
        print("PASS: POST /api/advances creates advance successfully")
    
    def test_get_advances_filtered_by_employee_and_month(self):
        """GET /api/advances?employee_id=X&month=4&year=2026 - filter advances"""
        # First create an advance
        create_resp = requests.post(f"{BASE_URL}/api/advances", headers=self.headers, json={
            "employee_id": self.test_employee_id,
            "amount": 300.0,
            "month": 4,
            "year": 2026,
            "note": "TEST_filter_advance"
        })
        assert create_resp.status_code in [200, 201]
        advance_id = create_resp.json()["id"]
        
        # Get advances filtered
        response = requests.get(
            f"{BASE_URL}/api/advances?employee_id={self.test_employee_id}&month=4&year=2026",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Get advances failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        # Find our test advance
        test_advances = [a for a in data if a.get("note") == "TEST_filter_advance"]
        assert len(test_advances) >= 1, "Should find the created advance"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/advances/{advance_id}", headers=self.headers)
        print("PASS: GET /api/advances with filters works correctly")
    
    def test_get_advances_summary(self):
        """GET /api/advances/summary?month=4&year=2026 - get sums per employee"""
        # Create two advances for same employee
        adv1 = requests.post(f"{BASE_URL}/api/advances", headers=self.headers, json={
            "employee_id": self.test_employee_id,
            "amount": 200.0,
            "month": 4,
            "year": 2026,
            "note": "TEST_summary_1"
        })
        adv2 = requests.post(f"{BASE_URL}/api/advances", headers=self.headers, json={
            "employee_id": self.test_employee_id,
            "amount": 150.0,
            "month": 4,
            "year": 2026,
            "note": "TEST_summary_2"
        })
        
        adv1_id = adv1.json()["id"] if adv1.status_code in [200, 201] else None
        adv2_id = adv2.json()["id"] if adv2.status_code in [200, 201] else None
        
        # Get summary
        response = requests.get(
            f"{BASE_URL}/api/advances/summary?month=4&year=2026",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Get summary failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, dict), "Summary should be a dict"
        # Check that our employee has sum >= 350 (200 + 150)
        if self.test_employee_id in data:
            assert data[self.test_employee_id] >= 350, f"Sum should be at least 350, got {data[self.test_employee_id]}"
        
        # Cleanup
        if adv1_id:
            requests.delete(f"{BASE_URL}/api/advances/{adv1_id}", headers=self.headers)
        if adv2_id:
            requests.delete(f"{BASE_URL}/api/advances/{adv2_id}", headers=self.headers)
        print("PASS: GET /api/advances/summary returns correct sums")
    
    def test_delete_advance(self):
        """DELETE /api/advances/{id} - delete advance"""
        # Create advance first
        create_resp = requests.post(f"{BASE_URL}/api/advances", headers=self.headers, json={
            "employee_id": self.test_employee_id,
            "amount": 100.0,
            "month": 4,
            "year": 2026,
            "note": "TEST_to_delete"
        })
        assert create_resp.status_code in [200, 201]
        advance_id = create_resp.json()["id"]
        
        # Delete it
        delete_resp = requests.delete(f"{BASE_URL}/api/advances/{advance_id}", headers=self.headers)
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.text}"
        
        # Verify it's gone
        get_resp = requests.get(
            f"{BASE_URL}/api/advances?employee_id={self.test_employee_id}&month=4&year=2026",
            headers=self.headers
        )
        advances = get_resp.json()
        deleted_advance = [a for a in advances if a.get("id") == advance_id]
        assert len(deleted_advance) == 0, "Advance should be deleted"
        
        print("PASS: DELETE /api/advances/{id} deletes advance successfully")
    
    def test_delete_nonexistent_advance_returns_404(self):
        """DELETE /api/advances/{id} with invalid id returns 404"""
        response = requests.delete(
            f"{BASE_URL}/api/advances/nonexistent-id-12345",
            headers=self.headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: DELETE nonexistent advance returns 404")


class TestAdvancesCarryForward:
    """Test carry-forward functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token and test employee"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        emp_resp = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        if emp_resp.status_code == 200 and len(emp_resp.json()) > 0:
            self.test_employee_id = emp_resp.json()[0]["id"]
        else:
            pytest.skip("No employees available for testing")
        
        yield
    
    def test_carry_forward_partial_amount(self):
        """POST /api/advances/{id}/carry-forward - partial carry forward"""
        # Create advance with 500
        create_resp = requests.post(f"{BASE_URL}/api/advances", headers=self.headers, json={
            "employee_id": self.test_employee_id,
            "amount": 500.0,
            "month": 4,
            "year": 2026,
            "note": "TEST_carry_partial"
        })
        assert create_resp.status_code in [200, 201]
        advance_id = create_resp.json()["id"]
        
        # Carry forward 200 to next month
        carry_resp = requests.post(
            f"{BASE_URL}/api/advances/{advance_id}/carry-forward",
            headers=self.headers,
            json={
                "amount": 200.0,
                "target_month": 5,
                "target_year": 2026
            }
        )
        
        assert carry_resp.status_code == 200, f"Carry forward failed: {carry_resp.text}"
        data = carry_resp.json()
        
        assert "new_advance" in data, "Response should contain new_advance"
        assert data["new_advance"]["amount"] == 200.0
        assert data["new_advance"]["month"] == 5
        assert data["new_advance"]["year"] == 2026
        assert data["remaining"] == 300.0, "Original should have 300 remaining"
        
        # Verify original was reduced
        get_resp = requests.get(
            f"{BASE_URL}/api/advances?employee_id={self.test_employee_id}&month=4&year=2026",
            headers=self.headers
        )
        original = [a for a in get_resp.json() if a.get("id") == advance_id]
        if len(original) > 0:
            assert original[0]["amount"] == 300.0, "Original should be reduced to 300"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/advances/{advance_id}", headers=self.headers)
        requests.delete(f"{BASE_URL}/api/advances/{data['new_advance']['id']}", headers=self.headers)
        print("PASS: Partial carry-forward works correctly")
    
    def test_carry_forward_full_amount_deletes_original(self):
        """Carry forward full amount should delete original advance"""
        # Create advance with 300
        create_resp = requests.post(f"{BASE_URL}/api/advances", headers=self.headers, json={
            "employee_id": self.test_employee_id,
            "amount": 300.0,
            "month": 4,
            "year": 2026,
            "note": "TEST_carry_full"
        })
        assert create_resp.status_code in [200, 201]
        advance_id = create_resp.json()["id"]
        
        # Carry forward full amount
        carry_resp = requests.post(
            f"{BASE_URL}/api/advances/{advance_id}/carry-forward",
            headers=self.headers,
            json={
                "amount": 300.0,
                "target_month": 5,
                "target_year": 2026
            }
        )
        
        assert carry_resp.status_code == 200
        data = carry_resp.json()
        assert data["remaining"] == 0, "Remaining should be 0"
        
        # Verify original was deleted
        get_resp = requests.get(
            f"{BASE_URL}/api/advances?employee_id={self.test_employee_id}&month=4&year=2026",
            headers=self.headers
        )
        original = [a for a in get_resp.json() if a.get("id") == advance_id]
        assert len(original) == 0, "Original advance should be deleted"
        
        # Cleanup new advance
        requests.delete(f"{BASE_URL}/api/advances/{data['new_advance']['id']}", headers=self.headers)
        print("PASS: Full carry-forward deletes original advance")
    
    def test_carry_forward_amount_exceeds_original_returns_400(self):
        """Carry forward amount > original should return 400"""
        # Create advance with 100
        create_resp = requests.post(f"{BASE_URL}/api/advances", headers=self.headers, json={
            "employee_id": self.test_employee_id,
            "amount": 100.0,
            "month": 4,
            "year": 2026,
            "note": "TEST_carry_exceed"
        })
        assert create_resp.status_code in [200, 201]
        advance_id = create_resp.json()["id"]
        
        # Try to carry forward more than available
        carry_resp = requests.post(
            f"{BASE_URL}/api/advances/{advance_id}/carry-forward",
            headers=self.headers,
            json={
                "amount": 200.0,  # More than 100
                "target_month": 5,
                "target_year": 2026
            }
        )
        
        assert carry_resp.status_code == 400, f"Expected 400, got {carry_resp.status_code}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/advances/{advance_id}", headers=self.headers)
        print("PASS: Carry forward exceeding amount returns 400")
    
    def test_carry_forward_zero_amount_returns_400(self):
        """Carry forward with amount <= 0 should return 400"""
        # Create advance
        create_resp = requests.post(f"{BASE_URL}/api/advances", headers=self.headers, json={
            "employee_id": self.test_employee_id,
            "amount": 100.0,
            "month": 4,
            "year": 2026,
            "note": "TEST_carry_zero"
        })
        assert create_resp.status_code in [200, 201]
        advance_id = create_resp.json()["id"]
        
        # Try to carry forward 0
        carry_resp = requests.post(
            f"{BASE_URL}/api/advances/{advance_id}/carry-forward",
            headers=self.headers,
            json={
                "amount": 0,
                "target_month": 5,
                "target_year": 2026
            }
        )
        
        assert carry_resp.status_code == 400, f"Expected 400, got {carry_resp.status_code}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/advances/{advance_id}", headers=self.headers)
        print("PASS: Carry forward with zero amount returns 400")


class TestPublicAdvances:
    """Test public advances endpoint for workers"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token and find employee with public_token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Try to get an employee with public_token
        emp_resp = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        self.test_employee = None
        self.public_token = None
        
        if emp_resp.status_code == 200:
            for emp in emp_resp.json():
                if emp.get("public_token"):
                    self.test_employee = emp
                    self.public_token = emp["public_token"]
                    break
        
        yield
    
    def test_public_advances_with_valid_token(self):
        """GET /api/public/advances/{token} - get advances for worker"""
        if not self.public_token:
            pytest.skip("No employee with public_token found")
        
        # Create an advance for this employee
        create_resp = requests.post(f"{BASE_URL}/api/advances", headers=self.headers, json={
            "employee_id": self.test_employee["id"],
            "amount": 250.0,
            "month": 4,
            "year": 2026,
            "note": "TEST_public_advance"
        })
        advance_id = create_resp.json()["id"] if create_resp.status_code in [200, 201] else None
        
        # Access public endpoint (no auth required)
        response = requests.get(f"{BASE_URL}/api/public/advances/{self.public_token}?month=4&year=2026")
        
        assert response.status_code == 200, f"Public advances failed: {response.text}"
        data = response.json()
        
        assert "advances" in data, "Response should contain 'advances'"
        assert "total" in data, "Response should contain 'total'"
        assert "month" in data, "Response should contain 'month'"
        assert "year" in data, "Response should contain 'year'"
        assert isinstance(data["advances"], list)
        
        # Cleanup
        if advance_id:
            requests.delete(f"{BASE_URL}/api/advances/{advance_id}", headers=self.headers)
        print("PASS: GET /api/public/advances/{token} works correctly")
    
    def test_public_advances_with_invalid_token_returns_404(self):
        """GET /api/public/advances/{token} with invalid token returns 404"""
        response = requests.get(f"{BASE_URL}/api/public/advances/invalid-token-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Public advances with invalid token returns 404")


class TestHealthCheck:
    """Basic health check"""
    
    def test_health_endpoint(self):
        """GET /api/health should return healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("PASS: Health check returns healthy")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
