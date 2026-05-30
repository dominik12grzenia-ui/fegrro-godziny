"""
iter95t - Backend tests for budget schedule (foreman harmonogram)
- GET /api/budget/my-schedule (admin + foreman scopes, budowa_name lookup)
- PATCH /api/budget/tasks/{id} (foreman field whitelist, future-date validation, clear flag)
- cron_schedule_notify_foremen() invocation
- Auth: admin via /api/auth/admin/login, foreman via /api/auth/foreman/login
"""
import os
import asyncio
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASS = "Admin123!"
FOREMAN_LOGIN = "Roman Chufrida"
FOREMAN_PASS = "Test1234!"
FOREMAN_ID = "23376361-5290-497b-84fd-350d82fb8231"
FOREMAN_SITES = [
    "67c1465e-c4be-4d29-b08b-37094d04b193",
    "33fc3748-7bbf-4c7e-a193-cbf4b1d9e6f7",
]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"No token in admin login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def foreman_token():
    r = requests.post(f"{API}/auth/foreman/login",
                      json={"email": FOREMAN_LOGIN, "password": FOREMAN_PASS}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Foreman login failed: {r.status_code} {r.text}")
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"No token in foreman login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def foreman_headers(foreman_token):
    return {"Authorization": f"Bearer {foreman_token}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 10

    def test_foreman_login(self, foreman_token):
        assert isinstance(foreman_token, str) and len(foreman_token) > 10

    def test_admin_login_endpoint_is_correct(self):
        # Generic /api/auth/login should NOT be primary endpoint
        r = requests.post(f"{API}/auth/admin/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
        assert r.status_code == 200


# ---------- GET /api/budget/my-schedule ----------
class TestMySchedule:
    def test_admin_my_schedule_returns_rows(self, admin_headers):
        r = requests.get(f"{API}/budget/my-schedule?days_ahead=14", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rows" in data
        assert isinstance(data["rows"], list)

    def test_my_schedule_has_budowa_name_field(self, admin_headers):
        r = requests.get(f"{API}/budget/my-schedule?days_ahead=30", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        rows = r.json()["rows"]
        if rows:
            # Every row must contain the key (value may be None if site missing)
            assert all("budowa_name" in row for row in rows), "budowa_name key missing on some rows"

    def test_foreman_my_schedule_filters_by_assigned_sites(self, foreman_headers):
        r = requests.get(f"{API}/budget/my-schedule?days_ahead=14", headers=foreman_headers, timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()["rows"]
        # All returned rows must belong to foreman's assigned sites
        for row in rows:
            assert row["budowa_id"] in FOREMAN_SITES, (
                f"Foreman saw task from non-assigned site: {row.get('budowa_id')}"
            )

    def test_days_ahead_validation(self, admin_headers):
        r = requests.get(f"{API}/budget/my-schedule?days_ahead=100", headers=admin_headers, timeout=15)
        assert r.status_code == 422


# ---------- PATCH /api/budget/tasks/{id} ----------
class TestTaskUpdatePermissions:
    @pytest.fixture(scope="class")
    def task_on_foreman_site(self, admin_headers):
        """Create a temporary task on a foreman-assigned site if possible.
        If site is missing in finance_budowy, skip (pre-existing data issue noted by E1)."""
        site_id = FOREMAN_SITES[0]
        # Try create budowa entry if not exists - check first
        payload = {
            "budowa_id": site_id,
            "name": "TEST_iter95t_task",
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=10)).isoformat(),
            "progress_pct": 0.0,
        }
        r = requests.post(f"{API}/budget/tasks", headers=admin_headers, json=payload, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"Cannot create test task on foreman site (pre-existing data issue): {r.status_code} {r.text}")
        tid = r.json()["id"]
        yield tid
        # cleanup
        requests.delete(f"{API}/budget/tasks/{tid}", headers=admin_headers, timeout=10)

    def test_foreman_can_set_actual_end_date_today(self, foreman_headers, task_on_foreman_site):
        today = date.today().isoformat()
        r = requests.patch(f"{API}/budget/tasks/{task_on_foreman_site}",
                           headers=foreman_headers,
                           json={"actual_end_date": today}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("actual_end_date") == today

    def test_foreman_cannot_set_future_actual_end_date(self, foreman_headers, task_on_foreman_site):
        r = requests.patch(f"{API}/budget/tasks/{task_on_foreman_site}",
                           headers=foreman_headers,
                           json={"actual_end_date": "2099-12-31"}, timeout=15)
        assert r.status_code == 400, r.text
        assert "przyszlosci" in r.text.lower() or "przyszłości" in r.text.lower()

    def test_foreman_cannot_set_forbidden_fields(self, foreman_headers, task_on_foreman_site):
        r = requests.patch(f"{API}/budget/tasks/{task_on_foreman_site}",
                           headers=foreman_headers,
                           json={"name": "hack", "progress_pct": 50}, timeout=15)
        assert r.status_code == 403, r.text
        body = r.text.lower()
        assert "brygadzista" in body or "tylko" in body

    def test_foreman_can_set_end_date(self, foreman_headers, task_on_foreman_site):
        new_end = (date.today() + timedelta(days=20)).isoformat()
        r = requests.patch(f"{API}/budget/tasks/{task_on_foreman_site}",
                           headers=foreman_headers,
                           json={"end_date": new_end}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("end_date") == new_end

    def test_clear_actual_end_date_flag(self, foreman_headers, task_on_foreman_site):
        # Set first
        today = date.today().isoformat()
        requests.patch(f"{API}/budget/tasks/{task_on_foreman_site}",
                       headers=foreman_headers,
                       json={"actual_end_date": today}, timeout=15)
        # Now clear
        r = requests.patch(f"{API}/budget/tasks/{task_on_foreman_site}",
                           headers=foreman_headers,
                           json={"clear_actual_end_date": True}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("actual_end_date") in (None, "")


class TestForeignTaskAccess:
    def test_foreman_cannot_edit_task_outside_assigned_sites(self, admin_headers, foreman_headers):
        # Find an existing task NOT in foreman assigned sites
        r = requests.get(f"{API}/budget/my-schedule?days_ahead=60", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        rows = r.json()["rows"]
        external_task = next((t for t in rows if t.get("budowa_id") not in FOREMAN_SITES), None)
        if not external_task:
            pytest.skip("No task outside foreman's sites to verify cross-site denial")
        tid = external_task["id"]
        r2 = requests.patch(f"{API}/budget/tasks/{tid}",
                            headers=foreman_headers,
                            json={"end_date": (date.today() + timedelta(days=5)).isoformat()},
                            timeout=15)
        assert r2.status_code == 403, r2.text
        assert "spoza" in r2.text.lower() or "przypisanych" in r2.text.lower()


# ---------- Admin-only PATCH validation ----------
class TestAdminTaskUpdate:
    @pytest.fixture(scope="class")
    def admin_task_id(self, admin_headers):
        # Pick any existing budowa from finance_budowy
        r = requests.get(f"{API}/budget/budowy", headers=admin_headers, timeout=15)
        if r.status_code != 200 or not r.json().get("rows"):
            pytest.skip("No budowy available")
        bid = r.json()["rows"][0]["budowa_id"]
        payload = {
            "budowa_id": bid,
            "name": "TEST_iter95t_admin_task",
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=5)).isoformat(),
        }
        r2 = requests.post(f"{API}/budget/tasks", headers=admin_headers, json=payload, timeout=15)
        assert r2.status_code == 200, r2.text
        tid = r2.json()["id"]
        yield tid
        requests.delete(f"{API}/budget/tasks/{tid}", headers=admin_headers, timeout=10)

    def test_admin_future_actual_end_date_rejected(self, admin_headers, admin_task_id):
        r = requests.patch(f"{API}/budget/tasks/{admin_task_id}",
                           headers=admin_headers,
                           json={"actual_end_date": "2099-12-31"}, timeout=15)
        assert r.status_code == 400
        assert "przyszlosci" in r.text.lower() or "przyszłości" in r.text.lower()

    def test_admin_today_actual_end_date_ok(self, admin_headers, admin_task_id):
        today = date.today().isoformat()
        r = requests.patch(f"{API}/budget/tasks/{admin_task_id}",
                           headers=admin_headers,
                           json={"actual_end_date": today}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("actual_end_date") == today


# ---------- Cron function direct invocation ----------
class TestCronFn:
    def test_cron_schedule_notify_foremen_runs(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from routes.budget import cron_schedule_notify_foremen
        result = asyncio.run(cron_schedule_notify_foremen())
        assert isinstance(result, dict), f"Expected dict, got {type(result)}"
        assert "pushed" in result, f"Missing 'pushed' key: {result}"
        assert "skipped_no_tasks" in result, f"Missing 'skipped_no_tasks' key: {result}"
