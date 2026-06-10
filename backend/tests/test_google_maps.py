"""
Test Google Maps Integration for FeGrro Construction Hours App
Tests: Sites API with location data, Geocoding API
"""
import pytest
from tests.test_config import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://equipment-payroll.preview.emergentagent.com')

class TestGoogleMapsIntegration:
    """Tests for Google Maps integration features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get admin token for authenticated requests"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD}
        )
        assert login_response.status_code == 200, f"Admin login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    # ============= SITES API TESTS =============
    
    def test_get_sites_returns_location_data(self):
        """GET /api/sites should return sites with location_lat and location_lng"""
        response = requests.get(f"{BASE_URL}/api/sites", headers=self.headers)
        
        assert response.status_code == 200
        sites = response.json()
        assert len(sites) >= 4, f"Expected at least 4 sites, got {len(sites)}"
        
        # Check that sites have location data
        for site in sites:
            assert "location_lat" in site, f"Site {site.get('name')} missing location_lat"
            assert "location_lng" in site, f"Site {site.get('name')} missing location_lng"
            assert "name" in site
            assert "id" in site
        
        print(f"✅ Found {len(sites)} sites with location data")
    
    def test_all_four_sites_have_coordinates(self):
        """All 4 sites (SASINO, ŁEBA ERBUD, BAUHAUS, Test Budowa) should have coordinates"""
        response = requests.get(f"{BASE_URL}/api/sites", headers=self.headers)
        
        assert response.status_code == 200
        sites = response.json()
        
        expected_sites = ["SASINO", "ŁEBA ERBUD", "BAUHAUS", "Test Budowa"]
        site_names = [s["name"] for s in sites]
        
        for expected in expected_sites:
            assert expected in site_names, f"Site '{expected}' not found in sites list"
            
            # Find the site and verify it has coordinates
            site = next((s for s in sites if s["name"] == expected), None)
            assert site is not None
            assert site.get("location_lat") is not None, f"Site '{expected}' has no location_lat"
            assert site.get("location_lng") is not None, f"Site '{expected}' has no location_lng"
            
            # Verify coordinates are valid numbers
            assert isinstance(site["location_lat"], (int, float))
            assert isinstance(site["location_lng"], (int, float))
            
            print(f"✅ {expected}: lat={site['location_lat']}, lng={site['location_lng']}")
    
    def test_sites_have_google_maps_url(self):
        """Sites should have google_maps_url field"""
        response = requests.get(f"{BASE_URL}/api/sites", headers=self.headers)
        
        assert response.status_code == 200
        sites = response.json()
        
        for site in sites:
            if site.get("location_lat") and site.get("location_lng"):
                assert "google_maps_url" in site, f"Site {site['name']} missing google_maps_url"
                print(f"✅ {site['name']}: {site.get('google_maps_url', 'N/A')}")
    
    # ============= GEOCODING API TESTS =============
    
    def test_geocode_endpoint_exists(self):
        """GET /api/geocode should exist and require address parameter"""
        response = requests.get(f"{BASE_URL}/api/geocode", headers=self.headers)
        
        # Should return 422 (validation error) without address parameter
        assert response.status_code == 422, f"Expected 422 without address, got {response.status_code}"
        print("✅ Geocode endpoint exists and validates input")
    
    def test_geocode_gdansk_returns_coordinates(self):
        """GET /api/geocode?address=Gdansk should return lat/lng"""
        response = requests.get(
            f"{BASE_URL}/api/geocode",
            params={"address": "Gdansk"},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Geocode failed: {response.text}"
        data = response.json()
        
        assert "lat" in data, "Response missing 'lat'"
        assert "lng" in data, "Response missing 'lng'"
        assert "formatted_address" in data, "Response missing 'formatted_address'"
        
        # Gdansk should be around lat 54.35, lng 18.65
        assert 54.0 < data["lat"] < 55.0, f"Unexpected latitude: {data['lat']}"
        assert 18.0 < data["lng"] < 19.0, f"Unexpected longitude: {data['lng']}"
        
        print(f"✅ Gdansk geocoded: lat={data['lat']}, lng={data['lng']}, address={data['formatted_address']}")
    
    def test_geocode_sasino_returns_coordinates(self):
        """GET /api/geocode?address=Sasino, Polska should return coordinates"""
        response = requests.get(
            f"{BASE_URL}/api/geocode",
            params={"address": "Sasino, Polska"},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Geocode failed: {response.text}"
        data = response.json()
        
        assert "lat" in data
        assert "lng" in data
        
        # Sasino is near Łeba, should be around lat 54.78, lng 17.53
        assert 54.5 < data["lat"] < 55.0, f"Unexpected latitude: {data['lat']}"
        assert 17.0 < data["lng"] < 18.0, f"Unexpected longitude: {data['lng']}"
        
        print(f"✅ Sasino geocoded: lat={data['lat']}, lng={data['lng']}")
    
    def test_geocode_invalid_address_returns_error(self):
        """GET /api/geocode with invalid address should return error"""
        response = requests.get(
            f"{BASE_URL}/api/geocode",
            params={"address": "xyznonexistentplace12345"},
            headers=self.headers
        )
        
        # Should return 400 for invalid/not found address
        assert response.status_code == 400, f"Expected 400 for invalid address, got {response.status_code}"
        print("✅ Invalid address returns 400 error")
    
    # ============= SITE UPDATE WITH LOCATION TESTS =============
    
    def test_update_site_location(self):
        """PUT /api/sites/{id} should update location coordinates"""
        # First get a site
        sites_response = requests.get(f"{BASE_URL}/api/sites", headers=self.headers)
        assert sites_response.status_code == 200
        sites = sites_response.json()
        
        if len(sites) == 0:
            pytest.skip("No sites available for testing")
        
        test_site = sites[0]
        site_id = test_site["id"]
        
        # Update with new coordinates
        new_lat = 54.5000
        new_lng = 18.5000
        
        update_response = requests.put(
            f"{BASE_URL}/api/sites/{site_id}",
            json={
                "location_lat": new_lat,
                "location_lng": new_lng,
                "google_maps_url": f"https://maps.google.com/?q={new_lat},{new_lng}"
            },
            headers=self.headers
        )
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated_site = update_response.json()
        
        assert updated_site["location_lat"] == new_lat
        assert updated_site["location_lng"] == new_lng
        
        print(f"✅ Site {test_site['name']} location updated to {new_lat}, {new_lng}")
        
        # Restore original coordinates
        requests.put(
            f"{BASE_URL}/api/sites/{site_id}",
            json={
                "location_lat": test_site.get("location_lat"),
                "location_lng": test_site.get("location_lng"),
                "google_maps_url": test_site.get("google_maps_url")
            },
            headers=self.headers
        )
    
    # ============= ASSIGNMENTS FOR INFO WINDOW TESTS =============
    
    def test_assignments_endpoint_returns_data(self):
        """GET /api/assignments should return assignment data for info windows"""
        response = requests.get(f"{BASE_URL}/api/assignments", headers=self.headers)
        
        assert response.status_code == 200
        assignments = response.json()
        
        # Assignments should have employee_id and site_id
        for assignment in assignments:
            assert "employee_id" in assignment
            assert "site_id" in assignment
            assert "assigned_dates" in assignment
        
        print(f"✅ Found {len(assignments)} assignments")
    
    def test_employees_endpoint_returns_data(self):
        """GET /api/employees should return employee data for info windows"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        
        assert response.status_code == 200
        employees = response.json()
        
        for employee in employees:
            assert "id" in employee
            assert "full_name" in employee
        
        print(f"✅ Found {len(employees)} employees")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
