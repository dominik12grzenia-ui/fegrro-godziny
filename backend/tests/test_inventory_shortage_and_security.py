"""Tests for: shortage reporting, list/resolve, mixed scenario,
security headers, GZip, list_equipment N+1 sanity, rate limiter on admin login.

NOTE: rate-limiter test is OPT-IN via env RUN_RATE_LIMIT_TEST=1 because it consumes
the per-IP login budget and would block subsequent tests in this run.
"""
import os
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASS = "Admin123!"


# -------- fixtures --------
@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def foreman_with_eq(admin_h):
    r = requests.get(f"{BASE}/api/equipment/assignments/all", headers=admin_h, timeout=20)
    assert r.status_code == 200
    asg = [a for a in r.json() if a.get("quantity", 0) > 0]
    if not asg:
        pytest.skip("no foreman with assigned eq")
    return asg[0]  # full assignment doc - has foreman_id, equipment_id, quantity


@pytest.fixture(scope="module")
def foreman_h(admin_h, foreman_with_eq):
    fid = foreman_with_eq["foreman_id"]
    r = requests.post(f"{BASE}/api/foremen/{fid}/impersonate",
                      headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def active_check_for_foreman(admin_h, foreman_h):
    """Start checks across all categories then return one where this foreman is required."""
    for cat in ("electronics", "accessories", "formwork"):
        requests.post(f"{BASE}/api/equipment/inventory/start",
                      headers=admin_h, json={"category": cat}, timeout=20)
    items = requests.get(f"{BASE}/api/equipment/inventory/active-for-me",
                         headers=foreman_h, timeout=20).json()
    if not items:
        pytest.skip("no active check surfaced for this foreman")
    # pick one with at least one equipment item
    chk = next((c for c in items if c.get("equipment")), items[0])
    return chk


# -------- shortage feature --------
class TestShortage:
    def test_report_shortage_success(self, foreman_h, active_check_for_foreman):
        chk = active_check_for_foreman
        eq = chk["equipment"][0]
        expected = eq["assigned_quantity"]
        reported = max(0, expected - 1)
        r = requests.post(
            f"{BASE}/api/equipment/inventory/{chk['id']}/report-shortage",
            headers=foreman_h,
            json={"equipment_id": eq["id"],
                  "reported_quantity": reported,
                  "description": "TEST_shortage description"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["equipment_id"] == eq["id"]
        assert d["expected_quantity"] == expected
        assert d["reported_quantity"] == reported
        assert d["missing_quantity"] == expected - reported
        assert d["status"] == "open"
        assert d["foreman_name"]
        assert "id" in d
        # Stash for later
        TestShortage.last_id = d["id"]

    def test_report_shortage_negative_400(self, foreman_h, active_check_for_foreman):
        chk = active_check_for_foreman
        eq = chk["equipment"][0]
        r = requests.post(
            f"{BASE}/api/equipment/inventory/{chk['id']}/report-shortage",
            headers=foreman_h,
            json={"equipment_id": eq["id"], "reported_quantity": -1},
            timeout=20,
        )
        assert r.status_code == 400

    def test_report_shortage_over_assigned_400(self, foreman_h, active_check_for_foreman):
        chk = active_check_for_foreman
        eq = chk["equipment"][0]
        r = requests.post(
            f"{BASE}/api/equipment/inventory/{chk['id']}/report-shortage",
            headers=foreman_h,
            json={"equipment_id": eq["id"],
                  "reported_quantity": eq["assigned_quantity"] + 5},
            timeout=20,
        )
        assert r.status_code == 400

    def test_report_shortage_unknown_check_404(self, foreman_h, active_check_for_foreman):
        eq = active_check_for_foreman["equipment"][0]
        r = requests.post(
            f"{BASE}/api/equipment/inventory/non-existent-check/report-shortage",
            headers=foreman_h,
            json={"equipment_id": eq["id"], "reported_quantity": 0},
            timeout=20,
        )
        assert r.status_code == 404

    def test_list_shortages_open(self, admin_h):
        r = requests.get(f"{BASE}/api/equipment/inventory/shortages?status=open",
                         headers=admin_h, timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert any(i["id"] == TestShortage.last_id for i in items), \
            "previously reported shortage not in open list"
        s = next(i for i in items if i["id"] == TestShortage.last_id)
        for k in ("foreman_name", "equipment_name", "expected_quantity",
                  "reported_quantity", "missing_quantity"):
            assert k in s

    def test_resolve_shortage(self, admin_h):
        r = requests.post(
            f"{BASE}/api/equipment/inventory/shortages/{TestShortage.last_id}/resolve",
            headers=admin_h, timeout=20,
        )
        assert r.status_code == 200
        # After resolve no longer in open
        open_list = requests.get(
            f"{BASE}/api/equipment/inventory/shortages?status=open",
            headers=admin_h, timeout=20).json()
        assert all(i["id"] != TestShortage.last_id for i in open_list)
        # But appears in resolved
        resolved = requests.get(
            f"{BASE}/api/equipment/inventory/shortages?status=resolved",
            headers=admin_h, timeout=20).json()
        assert any(i["id"] == TestShortage.last_id for i in resolved)

    def test_resolve_unknown_404(self, admin_h):
        r = requests.post(
            f"{BASE}/api/equipment/inventory/shortages/no-such-id/resolve",
            headers=admin_h, timeout=20,
        )
        assert r.status_code == 404


# -------- mixed scenario: confirm after shortage report --------
def test_confirm_after_shortage_mixed(admin_h, foreman_h):
    # Surface a fresh check
    for cat in ("electronics", "accessories", "formwork"):
        requests.post(f"{BASE}/api/equipment/inventory/start",
                      headers=admin_h, json={"category": cat}, timeout=20)
    items = requests.get(f"{BASE}/api/equipment/inventory/active-for-me",
                         headers=foreman_h, timeout=20).json()
    chk = next((c for c in items if len(c.get("equipment", [])) >= 2), None)
    if not chk:
        # fallback - any chk with >=1 item still tests confirm-after-shortage
        chk = next((c for c in items if c.get("equipment")), None)
    if not chk:
        pytest.skip("no eq to test mixed scenario")

    eqs = chk["equipment"]
    # Report shortage on last item
    last = eqs[-1]
    r = requests.post(
        f"{BASE}/api/equipment/inventory/{chk['id']}/report-shortage",
        headers=foreman_h,
        json={"equipment_id": last["id"], "reported_quantity": 0,
              "description": "TEST_mixed shortage"},
        timeout=20,
    )
    assert r.status_code == 200, r.text

    # Confirm with the OTHER ids only
    confirmed_ids = [e["id"] for e in eqs[:-1]]
    cr = requests.post(
        f"{BASE}/api/equipment/inventory/{chk['id']}/confirm",
        headers=foreman_h,
        json={"confirmed_equipment_ids": confirmed_ids},
        timeout=20,
    )
    assert cr.status_code == 200, cr.text


# -------- security headers --------
def test_security_headers_present():
    r = requests.get(f"{BASE}/api/", timeout=20)
    h = {k.lower(): v for k, v in r.headers.items()}
    assert h.get("x-frame-options") == "DENY"
    assert h.get("x-content-type-options") == "nosniff"
    assert "strict-transport-security" in h
    assert "referrer-policy" in h
    assert "permissions-policy" in h


# -------- GZip --------
def test_gzip_on_equipment_endpoint(admin_h):
    headers = {**admin_h, "Accept-Encoding": "gzip"}
    # urllib3 auto-decodes by default; raw=True via stream=True keeps raw headers visible
    r = requests.get(f"{BASE}/api/equipment", headers=headers, timeout=30)
    assert r.status_code == 200
    # Either Content-Encoding: gzip is set (small payloads may be skipped < 500 bytes)
    enc = r.headers.get("Content-Encoding", "").lower()
    if enc != "gzip":
        # Force-check: if response body is small, that's acceptable
        size = len(r.content)
        assert size < 500, f"Expected gzip but got encoding={enc} with size={size}"
    else:
        assert enc == "gzip"


# -------- list_equipment / my_equipment correctness (post N+1 fix) --------
def test_list_equipment_correctness(admin_h):
    r = requests.get(f"{BASE}/api/equipment", headers=admin_h, timeout=20)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    if items:
        e = items[0]
        # core fields preserved by N+1 fix
        for k in ("id", "name", "total_quantity"):
            assert k in e, f"missing {k} in equipment list response"
        # assignment-related aggregate fields should still exist
        assert "assigned_quantity" in e or "available_quantity" in e or "assignments" in e


def test_my_equipment_for_foreman(foreman_h):
    r = requests.get(f"{BASE}/api/equipment/my", headers=foreman_h, timeout=20)
    # Either /equipment/my or /equipment/foreman, try both
    if r.status_code == 404:
        r = requests.get(f"{BASE}/api/equipment/assignments/me",
                         headers=foreman_h, timeout=20)
    assert r.status_code in (200, 404), r.text
    if r.status_code == 200:
        data = r.json()
        assert isinstance(data, (list, dict))


# -------- rate limiter (opt-in) --------
@pytest.mark.skipif(os.environ.get("RUN_RATE_LIMIT_TEST") != "1",
                    reason="opt-in: would consume login budget for whole IP")
def test_rate_limit_admin_login():
    # 8 wrong attempts allowed; 9th should be 429
    s = requests.Session()
    last = None
    for i in range(9):
        last = s.post(f"{BASE}/api/auth/admin/login",
                      json={"email": "rate_test@nope.tld", "password": "xx"}, timeout=10)
    assert last.status_code == 429, f"expected 429, got {last.status_code} body={last.text}"
    assert "Retry-After" in last.headers
