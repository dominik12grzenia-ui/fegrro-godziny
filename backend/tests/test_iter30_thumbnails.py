"""Iter30: thumbnail optimization tests for equipment/warehouse/clothing list payloads."""
import base64
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASSWORD = "Admin123!"


def _big_photo_b64():
    img = Image.new('RGB', (1500, 1500), (200, 100, 50))
    # gradient pattern for realistic compression
    px = img.load()
    for y in range(0, 1500, 4):
        for x in range(0, 1500, 4):
            px[x, y] = ((x + y) % 256, (x * 2) % 256, (y * 3) % 256)
    bio = io.BytesIO()
    img.save(bio, format='JPEG', quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(bio.getvalue()).decode('ascii')


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                       json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def big_photo():
    p = _big_photo_b64()
    print(f"Big photo size: {len(p)} chars")
    return p


# ---------- image_utils.make_thumbnail ----------
def test_make_thumbnail_reduces_size(big_photo):
    from image_utils import make_thumbnail
    thumb = make_thumbnail(big_photo)
    assert thumb and thumb.startswith("data:image/jpeg;base64,")
    assert len(thumb) < len(big_photo) * 0.05, f"thumb too large: {len(thumb)} vs {len(big_photo)}"
    # decode
    raw = base64.b64decode(thumb.split(",", 1)[1])
    img = Image.open(io.BytesIO(raw))
    assert max(img.size) <= 96


# ---------- Equipment ----------
def test_equipment_create_returns_thumb_in_photo(headers, big_photo):
    payload = {"name": "TEST_thumb_eq", "total_quantity": 5, "photo": big_photo, "category": "electronics"}
    r = requests.post(f"{BASE_URL}/api/equipment", json=payload, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "photo" in data and data["photo"]
    assert len(data["photo"]) < 5000, f"photo not thumb-sized: {len(data['photo'])}"
    assert "photo_thumb" not in data
    eq_id = data["id"]
    yield_test = {"eq_id": eq_id}
    # Cleanup deferred
    test_equipment_create_returns_thumb_in_photo._created_id = eq_id


def test_equipment_list_returns_thumb(headers):
    r = requests.get(f"{BASE_URL}/api/equipment?category=electronics", headers=headers, timeout=30)
    assert r.status_code == 200
    items = r.json()
    # find our test item
    test_items = [it for it in items if it["name"].startswith("TEST_thumb_eq")]
    assert test_items, "TEST_thumb_eq not found in list"
    it = test_items[0]
    assert it.get("photo") and len(it["photo"]) < 5000, f"list returned full photo (len={len(it.get('photo') or '')})"
    assert "photo_thumb" not in it


def test_equipment_single_returns_full_photo(headers):
    eq_id = test_equipment_create_returns_thumb_in_photo._created_id
    r = requests.get(f"{BASE_URL}/api/equipment/single/{eq_id}", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "photo" in data and data["photo"]
    assert len(data["photo"]) > 5000, f"single endpoint not returning full photo (len={len(data['photo'])})"
    assert "photo_thumb" in data and data["photo_thumb"]


def test_equipment_update_regenerates_thumb(headers, big_photo):
    eq_id = test_equipment_create_returns_thumb_in_photo._created_id
    # Use a new distinct color photo
    img = Image.new('RGB', (1200, 1200), (50, 200, 100))
    bio = io.BytesIO()
    img.save(bio, format='JPEG', quality=85)
    new_photo = "data:image/jpeg;base64," + base64.b64encode(bio.getvalue()).decode('ascii')
    r = requests.put(f"{BASE_URL}/api/equipment/{eq_id}",
                      json={"photo": new_photo}, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["photo"]) < 5000, "update did not return thumb"
    # GET single -> full updated photo
    r2 = requests.get(f"{BASE_URL}/api/equipment/single/{eq_id}", headers=headers, timeout=30)
    assert r2.status_code == 200
    assert len(r2.json()["photo"]) > 5000


def test_equipment_cleanup(headers):
    eq_id = test_equipment_create_returns_thumb_in_photo._created_id
    r = requests.delete(f"{BASE_URL}/api/equipment/{eq_id}", headers=headers, timeout=30)
    assert r.status_code == 200


# ---------- Warehouse Materials ----------
def test_material_create_and_list_thumb(headers, big_photo):
    payload = {"name": "TEST_thumb_mat", "photo": big_photo, "unit": "szt.", "current_stock": 10}
    r = requests.post(f"{BASE_URL}/api/warehouse/materials", json=payload, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    mat_id = data["id"]
    assert data.get("photo") and len(data["photo"]) < 5000
    assert "photo_thumb" not in data
    # List
    rl = requests.get(f"{BASE_URL}/api/warehouse/materials", headers=headers, timeout=30)
    assert rl.status_code == 200
    found = [m for m in rl.json() if m["id"] == mat_id]
    assert found and len(found[0]["photo"]) < 5000
    assert "photo_thumb" not in found[0]
    # Single
    rs = requests.get(f"{BASE_URL}/api/warehouse/materials/single/{mat_id}", headers=headers, timeout=30)
    assert rs.status_code == 200
    assert len(rs.json()["photo"]) > 5000
    # cleanup
    rd = requests.delete(f"{BASE_URL}/api/warehouse/materials/{mat_id}", headers=headers, timeout=30)
    assert rd.status_code == 200


# ---------- Clothing Types ----------
def test_clothing_type_create_and_list_thumb(headers, big_photo):
    payload = {
        "name": "TEST_thumb_clothing", "yearly_limit": 2, "start_month": 1, "end_month": 12,
        "usage_period_months": 0, "requires_shoe_size": False, "requires_height": False,
        "requires_body_type": False, "photo": big_photo, "tier_level": 1,
    }
    r = requests.post(f"{BASE_URL}/api/clothing/types", json=payload, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    tid = data["id"]
    assert len(data["photo"]) < 5000
    assert "photo_thumb" not in data
    # List
    rl = requests.get(f"{BASE_URL}/api/clothing/types", headers=headers, timeout=30)
    found = [t for t in rl.json() if t["id"] == tid]
    assert found and len(found[0]["photo"]) < 5000
    assert "photo_thumb" not in found[0]
    # Single -> full
    rs = requests.get(f"{BASE_URL}/api/clothing/types/single/{tid}", headers=headers, timeout=30)
    assert rs.status_code == 200
    assert len(rs.json()["photo"]) > 5000
    # cleanup
    rd = requests.delete(f"{BASE_URL}/api/clothing/types/{tid}", headers=headers, timeout=30)
    assert rd.status_code == 200


# ---------- Regression: lost workflow still works (smoke) ----------
def test_equipment_list_smoke_no_regression(headers):
    r = requests.get(f"{BASE_URL}/api/equipment", headers=headers, timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
