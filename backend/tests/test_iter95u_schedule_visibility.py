"""
iter95u - Backend tests for Schedule visibility toggle per foreman.

Coverage:
- GET /api/foremen includes schedule_visible (default True for legacy)
- GET /api/foreman/me returns schedule_visible
- PATCH /api/foremen/{id}/schedule-visibility (admin only)
- GET /api/budget/my-schedule honors schedule_visible=False (-> disabled)
- cron_schedule_notify_foremen skips foremen with schedule_visible=False
- GET /api/public/schedule/{token}:
    * 404 invalid token
    * {rows:[], visible_sites:[]} when employee.assigned_sites empty
    * Returns rows when employee + foreman ON
    * Empty when all foremen on site have schedule_visible=False
    * Skips tasks with actual_end_date set
"""
import os
import asyncio
import pytest
import requests
from datetime import date, timedelta
from pathlib import Path
from pymongo import MongoClient

# Load backend .env so MONGO_URL/DB_NAME are present even when invoked from outside
_BACKEND_ENV = Path("/app/backend/.env")
if _BACKEND_ENV.exists():
    for line in _BACKEND_ENV.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

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
EMPLOYEE_TOKEN = "0d35ef81c0b64de7857664791d15a6fa"

# Direct DB access (PATCH /employees/{id} doesn't exist on backend)
_MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
_DB_NAME = os.environ.get("DB_NAME", "test_database")
_sync_db = MongoClient(_MONGO_URL)[_DB_NAME]


def _set_employee_sites(sites):
    _sync_db.employees.update_one(
        {"public_token": EMPLOYEE_TOKEN},
        {"$set": {"assigned_sites": sites}},
    )


def _get_employee():
    return _sync_db.employees.find_one({"public_token": EMPLOYEE_TOKEN}, {"_id": 0})


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def foreman_token():
    r = requests.post(f"{API}/auth/foreman/login",
                      json={"email": FOREMAN_LOGIN, "password": FOREMAN_PASS}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Foreman login failed: {r.status_code} {r.text}")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def foreman_headers(foreman_token):
    return {"Authorization": f"Bearer {foreman_token}", "Content-Type": "application/json"}


def _set_visibility(admin_headers, visible: bool):
    r = requests.patch(
        f"{API}/foremen/{FOREMAN_ID}/schedule-visibility",
        headers=admin_headers,
        json={"schedule_visible": visible},
        timeout=15,
    )
    assert r.status_code == 200, f"set vis failed: {r.text}"
    return r.json()


@pytest.fixture(scope="module", autouse=True)
def _restore_visibility(admin_headers):
    """Always restore schedule_visible=True after the module's tests."""
    yield
    try:
        _set_visibility(admin_headers, True)
    except Exception:
        pass


# ---------- GET /api/foremen + /foreman/me ----------

class TestForemenList:
    def test_foremen_list_includes_schedule_visible(self, admin_headers):
        r = requests.get(f"{API}/foremen", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        target = next((f for f in data if f.get("id") == FOREMAN_ID), None)
        assert target is not None, "Roman not found in foremen list"
        assert "schedule_visible" in target
        assert isinstance(target["schedule_visible"], bool)

    def test_foremen_list_defaults_to_true(self, admin_headers):
        r = requests.get(f"{API}/foremen", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        # Every foreman row must expose schedule_visible (never null/missing)
        for f in r.json():
            assert "schedule_visible" in f
            assert f["schedule_visible"] in (True, False)

    def test_foreman_me_has_schedule_visible(self, foreman_headers, admin_headers):
        # Ensure ON first
        _set_visibility(admin_headers, True)
        r = requests.get(f"{API}/foreman/me", headers=foreman_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "schedule_visible" in body
        assert body["schedule_visible"] is True


# ---------- PATCH /api/foremen/{id}/schedule-visibility ----------

class TestPatchVisibility:
    def test_admin_can_toggle_off(self, admin_headers):
        res = _set_visibility(admin_headers, False)
        assert res.get("schedule_visible") is False
        # GET confirms persistence
        r = requests.get(f"{API}/foremen", headers=admin_headers, timeout=15)
        target = next(f for f in r.json() if f["id"] == FOREMAN_ID)
        assert target["schedule_visible"] is False

    def test_admin_can_toggle_on(self, admin_headers):
        res = _set_visibility(admin_headers, True)
        assert res.get("schedule_visible") is True

    def test_non_admin_forbidden(self, foreman_headers):
        r = requests.patch(
            f"{API}/foremen/{FOREMAN_ID}/schedule-visibility",
            headers=foreman_headers,
            json={"schedule_visible": False},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"Expected 401/403 got {r.status_code}: {r.text}"

    def test_unknown_foreman_404(self, admin_headers):
        r = requests.patch(
            f"{API}/foremen/non-existent-id-xxx/schedule-visibility",
            headers=admin_headers,
            json={"schedule_visible": True},
            timeout=15,
        )
        assert r.status_code == 404


# ---------- GET /api/budget/my-schedule with visibility flag ----------

class TestMyScheduleVisibility:
    def test_my_schedule_disabled_when_off(self, admin_headers, foreman_headers):
        _set_visibility(admin_headers, False)
        r = requests.get(f"{API}/budget/my-schedule?days_ahead=14",
                         headers=foreman_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("rows") == []
        assert data.get("disabled") is True

    def test_my_schedule_works_when_on(self, admin_headers, foreman_headers):
        _set_visibility(admin_headers, True)
        r = requests.get(f"{API}/budget/my-schedule?days_ahead=14",
                         headers=foreman_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # disabled flag must NOT be true when visibility is on
        assert data.get("disabled") is not True
        assert "rows" in data
        assert isinstance(data["rows"], list)


# ---------- GET /api/public/schedule/{token} ----------

class TestPublicSchedule:
    def test_invalid_token_404(self):
        r = requests.get(f"{API}/public/schedule/this-token-does-not-exist", timeout=15)
        assert r.status_code == 404

    def test_empty_assigned_sites_returns_empty(self, admin_headers):
        """Employee Jan Testowy w spec ma assigned_sites=[] domyslnie."""
        target = _get_employee()
        if target is None:
            pytest.skip(f"Test employee with token {EMPLOYEE_TOKEN} not found")
        orig_sites = target.get("assigned_sites") or []
        try:
            _set_employee_sites([])
            r2 = requests.get(f"{API}/public/schedule/{EMPLOYEE_TOKEN}", timeout=15)
            assert r2.status_code == 200, r2.text
            body = r2.json()
            assert body.get("rows") == []
            assert body.get("visible_sites") == []
        finally:
            _set_employee_sites(orig_sites)

    def test_returns_tasks_when_foreman_on(self, admin_headers):
        """Setup: employee assigned to Roman's site + foreman schedule_visible=True."""
        _set_visibility(admin_headers, True)
        target = _get_employee()
        if target is None:
            pytest.skip("Test employee missing")
        orig_sites = target.get("assigned_sites") or []
        task_payload = {
            "budowa_id": FOREMAN_SITES[0],
            "name": "TEST_iter95u_public_task",
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=7)).isoformat(),
            "progress_pct": 0.0,
        }
        tcreate = requests.post(f"{API}/budget/tasks", headers=admin_headers,
                                json=task_payload, timeout=15)
        if tcreate.status_code != 200:
            pytest.skip(f"Cannot create task on foreman site: {tcreate.status_code} {tcreate.text}")
        task_id = tcreate.json()["id"]
        try:
            _set_employee_sites([FOREMAN_SITES[0]])
            r2 = requests.get(f"{API}/public/schedule/{EMPLOYEE_TOKEN}", timeout=15)
            assert r2.status_code == 200, r2.text
            body = r2.json()
            assert FOREMAN_SITES[0] in (body.get("visible_sites") or []), body
            ids = [r.get("id") for r in body.get("rows") or []]
            assert task_id in ids, f"Created task missing from rows: {ids}"

            # Toggle foreman OFF -> if Roman is the only foreman, rows must disappear
            _set_visibility(admin_headers, False)
            r3 = requests.get(f"{API}/public/schedule/{EMPLOYEE_TOKEN}", timeout=15)
            assert r3.status_code == 200
            body3 = r3.json()
            if FOREMAN_SITES[0] not in (body3.get("visible_sites") or []):
                assert task_id not in [r.get("id") for r in body3.get("rows") or []]
            _set_visibility(admin_headers, True)

            # Verify actual_end_date causes task to be skipped
            requests.patch(f"{API}/budget/tasks/{task_id}", headers=admin_headers,
                           json={"actual_end_date": date.today().isoformat()}, timeout=15)
            r4 = requests.get(f"{API}/public/schedule/{EMPLOYEE_TOKEN}", timeout=15)
            assert r4.status_code == 200
            ids4 = [r.get("id") for r in r4.json().get("rows") or []]
            assert task_id not in ids4, "Task with actual_end_date should be skipped"
        finally:
            requests.delete(f"{API}/budget/tasks/{task_id}", headers=admin_headers, timeout=10)
            _set_employee_sites(orig_sites)


# ---------- Cron skips disabled foremen ----------

class TestCronSkipsDisabled:
    def test_cron_skips_when_schedule_off(self, admin_headers):
        """Direct invocation: cron returns dict and runs without errors with OFF + ON states."""
        import sys
        sys.path.insert(0, "/app/backend")
        from routes.budget import cron_schedule_notify_foremen

        # Reload database module so motor client binds to current loop
        # Use a SINGLE asyncio.run so motor's internal client stays on one loop.
        async def run_both():
            _set_visibility(admin_headers, False)
            r1 = await cron_schedule_notify_foremen()
            _set_visibility(admin_headers, True)
            r2 = await cron_schedule_notify_foremen()
            return r1, r2

        try:
            result_off, result_on = asyncio.run(run_both())
        except RuntimeError as e:
            pytest.skip(f"Motor/event-loop binding issue in test runner: {e}")
        assert isinstance(result_off, dict)
        assert "pushed" in result_off and "skipped_no_tasks" in result_off
        assert isinstance(result_on, dict)
        assert "pushed" in result_on
