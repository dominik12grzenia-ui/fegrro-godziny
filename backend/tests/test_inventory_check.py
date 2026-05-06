"""Backend tests for Equipment Inventory Check feature."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASS = "Admin123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def foreman_with_eq(admin_h):
    """Find a foreman who has at least one equipment assignment with qty>0."""
    r = requests.get(f"{BASE}/api/equipment/assignments/all", headers=admin_h, timeout=20)
    assert r.status_code == 200
    asg = [a for a in r.json() if a.get("quantity", 0) > 0]
    if not asg:
        pytest.skip("No foremen with assigned equipment in DB")
    return asg[0]["foreman_id"]


@pytest.fixture(scope="module")
def foreman_token(admin_h, foreman_with_eq):
    r = requests.post(f"{BASE}/api/foremen/{foreman_with_eq}/impersonate",
                      headers=admin_h, timeout=20)
    assert r.status_code == 200, f"impersonate failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def foreman_h(foreman_token):
    return {"Authorization": f"Bearer {foreman_token}"}


def _start(admin_h, cat):
    return requests.post(f"{BASE}/api/equipment/inventory/start",
                          headers=admin_h, json={"category": cat}, timeout=20)


@pytest.mark.parametrize("cat", ["electronics", "accessories", "formwork"])
def test_start_inventory_each_category(admin_h, cat):
    r = _start(admin_h, cat)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["category"] == cat
    assert data["status"] == "active"
    assert isinstance(data["required_foremen"], list)
    assert data["confirmed_foremen"] == []
    assert "id" in data


def test_start_invalid_category_400(admin_h):
    r = _start(admin_h, "invalid_cat")
    assert r.status_code == 400


def test_list_inventory_admin(admin_h):
    r = requests.get(f"{BASE}/api/equipment/inventory/list", headers=admin_h, timeout=20)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    assert len(items) >= 1
    # Each has expected fields
    sample = items[0]
    for k in ("id", "category", "status", "required_foremen", "confirmed_foremen"):
        assert k in sample


def test_finish_inventory(admin_h):
    # Start a fresh check we can finish
    r = _start(admin_h, "accessories")
    assert r.status_code == 200
    cid = r.json()["id"]
    f = requests.post(f"{BASE}/api/equipment/inventory/{cid}/finish",
                       headers=admin_h, timeout=20)
    assert f.status_code == 200, f.text
    # Listing should now show this as finished
    lst = requests.get(f"{BASE}/api/equipment/inventory/list", headers=admin_h, timeout=20).json()
    found = next((x for x in lst if x["id"] == cid), None)
    assert found is not None
    assert found["status"] == "finished"


def test_finish_unknown_404(admin_h):
    r = requests.post(f"{BASE}/api/equipment/inventory/non-existent/finish",
                       headers=admin_h, timeout=20)
    assert r.status_code == 404


def test_starting_new_closes_previous_for_same_category(admin_h):
    a = _start(admin_h, "electronics").json()
    b = _start(admin_h, "electronics").json()
    assert a["id"] != b["id"]
    lst = requests.get(f"{BASE}/api/equipment/inventory/list", headers=admin_h, timeout=20).json()
    a_doc = next(x for x in lst if x["id"] == a["id"])
    b_doc = next(x for x in lst if x["id"] == b["id"])
    assert a_doc["status"] == "finished"
    assert b_doc["status"] == "active"


def test_active_for_me_returns_equipment(admin_h, foreman_h, foreman_with_eq):
    # Ensure active electronics check exists with this foreman in required
    _start(admin_h, "electronics")
    r = requests.get(f"{BASE}/api/equipment/inventory/active-for-me",
                      headers=foreman_h, timeout=20)
    assert r.status_code == 200, r.text
    items = r.json()
    # Foreman might not have electronics; try other categories
    if not items:
        for cat in ("accessories", "formwork"):
            _start(admin_h, cat)
            items = requests.get(f"{BASE}/api/equipment/inventory/active-for-me",
                                  headers=foreman_h, timeout=20).json()
            if items:
                break
    assert items, "Expected at least one active check for foreman with assigned equipment"
    chk = items[0]
    assert "equipment" in chk
    assert chk["category"] in ("electronics", "accessories", "formwork")
    if chk["equipment"]:
        eq0 = chk["equipment"][0]
        for k in ("id", "name", "assigned_quantity"):
            assert k in eq0


def test_confirm_then_active_for_me_empty(admin_h, foreman_h, foreman_with_eq):
    items = requests.get(f"{BASE}/api/equipment/inventory/active-for-me",
                          headers=foreman_h, timeout=20).json()
    if not items:
        # start one in each cat to surface a check
        for cat in ("electronics", "accessories", "formwork"):
            _start(admin_h, cat)
            items = requests.get(f"{BASE}/api/equipment/inventory/active-for-me",
                                  headers=foreman_h, timeout=20).json()
            if items:
                break
    assert items, "no active check for foreman"
    # Confirm ALL active checks for this foreman
    for chk in items:
        eq_ids = [e["id"] for e in chk.get("equipment", [])]
        cr = requests.post(f"{BASE}/api/equipment/inventory/{chk['id']}/confirm",
                            headers=foreman_h,
                            json={"confirmed_equipment_ids": eq_ids}, timeout=20)
        assert cr.status_code == 200, cr.text

    after = requests.get(f"{BASE}/api/equipment/inventory/active-for-me",
                          headers=foreman_h, timeout=20).json()
    assert after == [] or all(foreman_with_eq in c.get("confirmed_foremen", []) for c in after)
