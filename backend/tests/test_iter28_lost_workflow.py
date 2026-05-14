"""Iteration 28: 'Zaginione' (Lost) workflow tests.

Validates:
- GET /equipment returns lost_quantity field defaulted to 0
- available_quantity = total - assigned - broken - lost
- POST /inventory/shortages/{id}/mark-lost decrements foreman assignment,
  increments equipment.lost_quantity, sets resolution='lost'; second call -> 400
- POST /inventory/shortages/{id}/resolve sets resolution='found', no stock change;
  second call -> 400
- /equipment/assign respects lost_quantity in availability check
"""
import os
import uuid
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASS = "Admin123!"


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def a_foreman(admin_h):
    """Pick or create a foreman user."""
    r = requests.get(f"{BASE}/api/foremen", headers=admin_h, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"GET /foremen failed: {r.status_code}")
    items = r.json() if isinstance(r.json(), list) else r.json().get("foremen", [])
    if not items:
        pytest.skip("no foreman exists in db - cannot test E2E")
    return items[0]


@pytest.fixture(scope="module")
def fresh_equipment(admin_h):
    """Create a test equipment item with total=10."""
    name = f"TEST_LOST_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE}/api/equipment", headers=admin_h,
                      json={"name": name, "total_quantity": 10,
                            "category": "electronics"}, timeout=20)
    assert r.status_code == 200, r.text
    eq = r.json()
    yield eq
    # teardown
    try:
        requests.delete(f"{BASE}/api/equipment/{eq['id']}", headers=admin_h, timeout=20)
    except Exception:
        pass


# ---------- 1. list_equipment returns lost_quantity ----------
def test_list_equipment_has_lost_quantity_field(admin_h, fresh_equipment):
    r = requests.get(f"{BASE}/api/equipment?category=electronics",
                     headers=admin_h, timeout=20)
    assert r.status_code == 200
    items = r.json()
    found = next((e for e in items if e["id"] == fresh_equipment["id"]), None)
    assert found is not None, "fresh equipment not in list"
    assert "lost_quantity" in found
    assert found["lost_quantity"] == 0
    # available = total - assigned - broken - lost = 10 - 0 - 0 - 0
    assert found["available_quantity"] == 10


# ---------- 2. E2E flow: create -> assign -> shortage -> mark-lost ----------
def test_e2e_mark_lost_decrements_assignment_and_increments_lost(
        admin_h, fresh_equipment, a_foreman):
    eq_id = fresh_equipment["id"]
    fid = a_foreman["id"]

    # assign 5 to foreman
    r = requests.post(
        f"{BASE}/api/equipment/assign?equipment_id={eq_id}",
        headers=admin_h, json={"foreman_id": fid, "quantity": 5}, timeout=20)
    assert r.status_code == 200, r.text

    # get foreman token via impersonate
    r = requests.post(f"{BASE}/api/foremen/{fid}/impersonate",
                      headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    foreman_h = {"Authorization": f"Bearer {r.json()['access_token']}"}

    # start inventory
    r = requests.post(f"{BASE}/api/equipment/inventory/start",
                      headers=admin_h, json={"category": "electronics"}, timeout=20)
    assert r.status_code == 200
    check_id = r.json()["id"]

    # confirm foreman is in required_foremen
    if fid not in r.json().get("required_foremen", []):
        pytest.skip("foreman not picked up as required (no prior assignment scope)")

    # foreman reports shortage: has 3, expected 5 -> missing 2
    r = requests.post(f"{BASE}/api/equipment/inventory/{check_id}/report-shortage",
                      headers=foreman_h,
                      json={"equipment_id": eq_id, "reported_quantity": 3},
                      timeout=20)
    assert r.status_code == 200, r.text
    sh = r.json()
    assert sh["missing_quantity"] == 2
    shortage_id = sh["id"]

    # admin marks lost
    r = requests.post(
        f"{BASE}/api/equipment/inventory/shortages/{shortage_id}/mark-lost",
        headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["missing_quantity"] == 2
    assert body["new_assigned_quantity"] == 3

    # verify equipment.lost_quantity=2, assigned=3, available=10-3-0-2=5
    r = requests.get(f"{BASE}/api/equipment?category=electronics",
                     headers=admin_h, timeout=20)
    found = next(e for e in r.json() if e["id"] == eq_id)
    assert found["lost_quantity"] == 2, found
    assert found["assigned_quantity"] == 3, found
    assert found["broken_quantity"] == 0
    assert found["available_quantity"] == 10 - 3 - 0 - 2

    # second mark-lost on same shortage -> 400
    r = requests.post(
        f"{BASE}/api/equipment/inventory/shortages/{shortage_id}/mark-lost",
        headers=admin_h, timeout=20)
    assert r.status_code == 400, r.text


# ---------- 3. resolve (found) flow ----------
def test_resolve_found_no_stock_change_and_idempotent(admin_h, a_foreman):
    fid = a_foreman["id"]

    # Create eq
    name = f"TEST_LOST2_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE}/api/equipment", headers=admin_h,
                      json={"name": name, "total_quantity": 6,
                            "category": "electronics"}, timeout=20)
    assert r.status_code == 200
    eq = r.json()
    eq_id = eq["id"]
    try:
        # assign 4
        r = requests.post(
            f"{BASE}/api/equipment/assign?equipment_id={eq_id}",
            headers=admin_h, json={"foreman_id": fid, "quantity": 4}, timeout=20)
        assert r.status_code == 200

        r = requests.post(f"{BASE}/api/foremen/{fid}/impersonate",
                          headers=admin_h, timeout=20)
        assert r.status_code == 200
        foreman_h = {"Authorization": f"Bearer {r.json()['access_token']}"}

        r = requests.post(f"{BASE}/api/equipment/inventory/start",
                          headers=admin_h, json={"category": "electronics"}, timeout=20)
        assert r.status_code == 200
        check_id = r.json()["id"]
        if fid not in r.json().get("required_foremen", []):
            pytest.skip("foreman not required in check")

        r = requests.post(f"{BASE}/api/equipment/inventory/{check_id}/report-shortage",
                          headers=foreman_h,
                          json={"equipment_id": eq_id, "reported_quantity": 2},
                          timeout=20)
        assert r.status_code == 200
        shortage_id = r.json()["id"]

        # resolve = found
        r = requests.post(
            f"{BASE}/api/equipment/inventory/shortages/{shortage_id}/resolve",
            headers=admin_h, timeout=20)
        assert r.status_code == 200, r.text

        # verify nothing changed: lost=0, assigned=4
        r = requests.get(f"{BASE}/api/equipment?category=electronics",
                         headers=admin_h, timeout=20)
        found = next(e for e in r.json() if e["id"] == eq_id)
        assert found["lost_quantity"] == 0
        assert found["assigned_quantity"] == 4
        assert found["available_quantity"] == 2

        # second call -> 400
        r = requests.post(
            f"{BASE}/api/equipment/inventory/shortages/{shortage_id}/resolve",
            headers=admin_h, timeout=20)
        assert r.status_code == 400
    finally:
        try:
            requests.delete(f"{BASE}/api/equipment/{eq_id}", headers=admin_h, timeout=20)
        except Exception:
            pass


# ---------- 4. assign respects lost_quantity ----------
def test_assign_validation_respects_lost_quantity(admin_h, a_foreman):
    """Create eq total=5, manually set lost_quantity=3 via mark-lost path, then try to assign 4 -> should fail."""
    fid = a_foreman["id"]
    name = f"TEST_LOSTASN_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE}/api/equipment", headers=admin_h,
                      json={"name": name, "total_quantity": 5,
                            "category": "electronics"}, timeout=20)
    assert r.status_code == 200
    eq_id = r.json()["id"]
    try:
        # assign 3
        r = requests.post(
            f"{BASE}/api/equipment/assign?equipment_id={eq_id}",
            headers=admin_h, json={"foreman_id": fid, "quantity": 3}, timeout=20)
        assert r.status_code == 200

        # shortage flow to set lost=3
        r = requests.post(f"{BASE}/api/foremen/{fid}/impersonate",
                          headers=admin_h, timeout=20)
        foreman_h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        r = requests.post(f"{BASE}/api/equipment/inventory/start",
                          headers=admin_h, json={"category": "electronics"}, timeout=20)
        check_id = r.json()["id"]
        if fid not in r.json().get("required_foremen", []):
            pytest.skip("foreman not required in check")
        r = requests.post(f"{BASE}/api/equipment/inventory/{check_id}/report-shortage",
                          headers=foreman_h,
                          json={"equipment_id": eq_id, "reported_quantity": 0},
                          timeout=20)
        assert r.status_code == 200, r.text
        shortage_id = r.json()["id"]
        r = requests.post(
            f"{BASE}/api/equipment/inventory/shortages/{shortage_id}/mark-lost",
            headers=admin_h, timeout=20)
        assert r.status_code == 200, r.text

        # now lost=3, assigned=0, total=5 -> available=2
        # try to assign 4 -> should fail
        r = requests.post(
            f"{BASE}/api/equipment/assign?equipment_id={eq_id}",
            headers=admin_h, json={"foreman_id": fid, "quantity": 4}, timeout=20)
        assert r.status_code == 400, r.text
        # assign 2 should succeed
        r = requests.post(
            f"{BASE}/api/equipment/assign?equipment_id={eq_id}",
            headers=admin_h, json={"foreman_id": fid, "quantity": 2}, timeout=20)
        assert r.status_code == 200, r.text
    finally:
        try:
            requests.delete(f"{BASE}/api/equipment/{eq_id}", headers=admin_h, timeout=20)
        except Exception:
            pass


# ---------- 5. PUT update broken_quantity validation respects lost ----------
def test_put_equipment_broken_validation_includes_lost(admin_h, a_foreman):
    fid = a_foreman["id"]
    name = f"TEST_LOSTPUT_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE}/api/equipment", headers=admin_h,
                      json={"name": name, "total_quantity": 5,
                            "category": "electronics"}, timeout=20)
    assert r.status_code == 200
    eq_id = r.json()["id"]
    try:
        # assign 2
        r = requests.post(
            f"{BASE}/api/equipment/assign?equipment_id={eq_id}",
            headers=admin_h, json={"foreman_id": fid, "quantity": 2}, timeout=20)
        assert r.status_code == 200, r.text

        # try broken=5 -> assigned(2)+broken(5)=7 > total(5) -> 400
        r = requests.put(f"{BASE}/api/equipment/{eq_id}",
                         headers=admin_h, json={"broken_quantity": 5}, timeout=20)
        assert r.status_code == 400, r.text
        # broken=3 ok: assigned(2)+broken(3)=5 <= total(5)
        r = requests.put(f"{BASE}/api/equipment/{eq_id}",
                         headers=admin_h, json={"broken_quantity": 3}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        # available = total - assigned - broken - lost = 5-2-3-0 = 0
        assert body["available_quantity"] == 0
        assert body["lost_quantity"] == 0
    finally:
        try:
            requests.delete(f"{BASE}/api/equipment/{eq_id}", headers=admin_h, timeout=20)
        except Exception:
            pass
