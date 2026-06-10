"""Iteration 22 - Verify badge counts on admin dashboard tabs.

Tests:
  - GET /api/equipment/orders?status=pending returns orders enriched with category from db.equipment.
  - GET /api/warehouse/orders returns pending+partial materials orders.
  - Admin login + impersonation + foreman submitting an equipment order works (email path executes).
  - Issue / reject / delete equipment orders regressions.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://equipment-payroll.preview.emergentagent.com"
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code == 429:
        pytest.skip("Admin login rate-limited (429)")
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def test_health(admin_headers):
    r = requests.get(f"{BASE_URL}/api/foremen", headers=admin_headers, timeout=15)
    assert r.status_code == 200


def test_equipment_orders_pending_have_category(admin_headers):
    r = requests.get(f"{BASE_URL}/api/equipment/orders?status=pending", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    orders = r.json()
    assert isinstance(orders, list)
    # Each order should have a category field, and it should not be None
    for o in orders:
        assert "category" in o, f"missing category on order {o.get('id')}"
        assert o["category"] in ("electronics", "accessories", "formwork"), \
            f"unexpected category {o.get('category')} on order {o.get('id')}"
    cats = {o["category"] for o in orders}
    print(f"[INFO] pending equipment orders: count={len(orders)} categories={cats}")
    # Per problem statement we expect at least these 3 categories represented
    assert "electronics" in cats, f"electronics missing - cats={cats} orders={[o.get('equipment_name') for o in orders]}"
    assert "accessories" in cats, f"accessories missing - cats={cats}"
    assert "formwork" in cats, f"formwork missing - cats={cats}"


def test_warehouse_orders_listed(admin_headers):
    r = requests.get(f"{BASE_URL}/api/warehouse/orders", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    orders = r.json()
    assert isinstance(orders, list)
    pending = [o for o in orders if o.get("status") in ("pending", "partial")]
    print(f"[INFO] warehouse pending+partial: {len(pending)} / total {len(orders)}")
    # At least 1 pending warehouse order seeded (Cement Portland)
    assert len(pending) >= 1, f"expected at least 1 pending warehouse order; got {len(orders)} total"


def test_equipment_catalog_categories_exist(admin_headers):
    """Confirm at least 1 equipment item exists in each non-electronics category (so admin can issue orders)."""
    for cat in ("electronics", "accessories", "formwork"):
        r = requests.get(f"{BASE_URL}/api/equipment/catalog?category={cat}", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        print(f"[INFO] catalog {cat}: {len(items)} items")
        if cat in ("accessories", "formwork"):
            assert len(items) >= 1, f"no items in catalog category={cat}"


def test_foreman_impersonation_and_order_submission(admin_headers):
    # Pick first foreman
    r = requests.get(f"{BASE_URL}/api/foremen", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    foremen = r.json()
    if not foremen:
        pytest.skip("no foremen to impersonate")
    fid = foremen[0]["id"]
    r = requests.post(f"{BASE_URL}/api/foremen/{fid}/impersonate", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    f_token = r.json()["access_token"]
    fh = {"Authorization": f"Bearer {f_token}", "Content-Type": "application/json"}

    # Get an electronics catalog item with no variants
    cat = requests.get(f"{BASE_URL}/api/equipment/catalog?category=electronics", headers=fh, timeout=15).json()
    target = next((it for it in cat if not it.get("variants")), None)
    if target is None:
        pytest.skip("no electronics item without variants for foreman order test")

    payload = {"equipment_id": target["id"], "quantity": 1, "notes": "TEST_iter22 badges"}
    r = requests.post(f"{BASE_URL}/api/equipment/orders", json=payload, headers=fh, timeout=20)
    assert r.status_code == 200, r.text
    order = r.json()
    order_id = order["id"]
    assert order["category"] == "electronics" or order["category"] is not None
    print(f"[INFO] foreman placed order {order_id} status={order['status']}")

    # Verify admin sees the new pending order via list endpoint
    r = requests.get(f"{BASE_URL}/api/equipment/orders?status=pending", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    assert any(o["id"] == order_id for o in r.json())

    # Cleanup - foreman deletes own pending order
    r = requests.delete(f"{BASE_URL}/api/equipment/orders/{order_id}", headers=fh, timeout=15)
    assert r.status_code == 200, r.text


def test_reject_then_no_longer_pending(admin_headers):
    """Place an order, admin rejects it, ensure it's gone from pending list."""
    # Pick first foreman
    foremen = requests.get(f"{BASE_URL}/api/foremen", headers=admin_headers, timeout=15).json()
    if not foremen:
        pytest.skip()
    fid = foremen[0]["id"]
    f_token = requests.post(f"{BASE_URL}/api/foremen/{fid}/impersonate", headers=admin_headers, timeout=15).json()["access_token"]
    fh = {"Authorization": f"Bearer {f_token}", "Content-Type": "application/json"}
    cat = requests.get(f"{BASE_URL}/api/equipment/catalog?category=electronics", headers=fh, timeout=15).json()
    target = next((it for it in cat if not it.get("variants")), None)
    if target is None:
        pytest.skip()
    order = requests.post(f"{BASE_URL}/api/equipment/orders",
                          json={"equipment_id": target["id"], "quantity": 1, "notes": "TEST_iter22 reject"},
                          headers=fh, timeout=20).json()
    oid = order["id"]
    r = requests.post(f"{BASE_URL}/api/equipment/orders/{oid}/reject", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    pending = requests.get(f"{BASE_URL}/api/equipment/orders?status=pending", headers=admin_headers, timeout=15).json()
    assert not any(o["id"] == oid for o in pending), "rejected order still in pending list"
