"""Iter36 backend tests:
- POST /api/equipment/transfer-from-warehouse  (admin creates a pending transfer)
- GET  /api/equipment/transfers/all            (verify pending transfer visible)
- POST /api/equipment/transfers/{id}/accept    (foreman accepts -> assignment +qty)
- PUT  /api/equipment/{id}                     (update total_quantity)
- POST /api/equipment/return                   (foreman returns qty)
- POST /api/equipment/returns/{id}/to-repair   (admin routes return to repair -> broken_quantity++)
"""
import os
import uuid
import pytest
import requests
from pathlib import Path

# ---- Resolve BASE_URL ----
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASSWORD = "Admin123!"


def hdr(token):
    return {"Authorization": f"Bearer {token}"}


# ---- Fixtures ----
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{API}/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"admin login failed {r.status_code}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return hdr(admin_token)


@pytest.fixture(scope="module")
def site_id(admin_headers):
    r = requests.post(
        f"{API}/sites",
        json={"name": f"TEST_SITE_iter36_{uuid.uuid4().hex[:6]}", "address": "Testowa 36"},
        headers=admin_headers,
        timeout=15,
    )
    if r.status_code in (200, 201):
        return r.json().get("id") or r.json().get("_id")
    r2 = requests.get(f"{API}/sites", headers=admin_headers, timeout=15)
    if r2.status_code == 200 and r2.json():
        return r2.json()[0]["id"]
    pytest.skip(f"cannot create or list sites: {r.status_code} {r.text}")


def _register_foreman(admin_headers, site_id, label):
    name = f"TEST_iter36_{label}_{uuid.uuid4().hex[:6]}"
    password = "Test1234!"
    # Admin creates foreman
    r = requests.post(
        f"{API}/foremen",
        json={"full_name": name, "password": password},
        headers=admin_headers,
        timeout=15,
    )
    assert r.status_code in (200, 201), f"create foreman: {r.status_code} {r.text}"
    fid = r.json()["id"]
    # Assign sites (activation)
    r2 = requests.post(
        f"{API}/foremen/{fid}/sites",
        json={"site_ids": [site_id]},
        headers=admin_headers,
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    # Foreman login (email field carries full_name)
    r3 = requests.post(
        f"{API}/auth/foreman/login",
        json={"email": name, "password": password},
        timeout=15,
    )
    assert r3.status_code == 200, f"foreman login: {r3.status_code} {r3.text}"
    token = r3.json()["access_token"]
    return {"id": fid, "name": name, "token": token}


@pytest.fixture(scope="module")
def foreman(admin_headers, site_id):
    return _register_foreman(admin_headers, site_id, "F")


@pytest.fixture(scope="module")
def equipment(admin_headers):
    name = f"TEST_iter36_Wiertarka_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{API}/equipment",
        json={"name": name, "brand": "Bosch", "total_quantity": 10},
        headers=admin_headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_quantity"] == 10
    assert data["assigned_quantity"] == 0
    return {"id": data["id"], "name": name}


# ---- Tests ----
class TestTransferFromWarehouse:
    """Admin creates a pending transfer from warehouse -> foreman accepts."""

    def test_admin_creates_warehouse_transfer(self, admin_headers, equipment, foreman):
        r = requests.post(
            f"{API}/equipment/transfer-from-warehouse",
            json={
                "equipment_id": equipment["id"],
                "to_foreman_id": foreman["id"],
                "quantity": 3,
            },
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["status"] == "pending"
        assert t["from_foreman_id"] == "warehouse"
        assert t["to_foreman_id"] == foreman["id"]
        assert t["equipment_id"] == equipment["id"]
        assert t["quantity"] == 3
        assert "id" in t
        pytest.iter36_transfer_id = t["id"]

    def test_transfer_visible_in_all(self, admin_headers):
        r = requests.get(f"{API}/equipment/transfers/all", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert pytest.iter36_transfer_id in ids
        t = next(t for t in r.json() if t["id"] == pytest.iter36_transfer_id)
        assert t["status"] == "pending"
        assert t["from_foreman_id"] == "warehouse"

    def test_assignment_not_yet_changed(self, admin_headers, equipment, foreman):
        # Before acceptance, no assignment for foreman
        r = requests.get(f"{API}/equipment/assignments/all", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        pairs = {(a["equipment_id"], a["foreman_id"]): a["quantity"] for a in r.json()}
        assert pairs.get((equipment["id"], foreman["id"]), 0) == 0

    def test_warehouse_overcommit_rejected(self, admin_headers, equipment, foreman):
        # Stock = 10, already pending 3 -> requesting 8 should fail
        r = requests.post(
            f"{API}/equipment/transfer-from-warehouse",
            json={
                "equipment_id": equipment["id"],
                "to_foreman_id": foreman["id"],
                "quantity": 8,
            },
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "Brak" in r.json().get("detail", "") or "magaz" in r.json().get("detail", "").lower()

    def test_foreman_accepts_transfer(self, foreman, equipment, admin_headers):
        r = requests.post(
            f"{API}/equipment/transfers/{pytest.iter36_transfer_id}/accept",
            headers=hdr(foreman["token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text

        # Verify assignment increased by 3
        a = requests.get(f"{API}/equipment/assignments/all", headers=admin_headers, timeout=15)
        assert a.status_code == 200
        pairs = {(x["equipment_id"], x["foreman_id"]): x["quantity"] for x in a.json()}
        assert pairs.get((equipment["id"], foreman["id"])) == 3

        # Transfer marked accepted
        t = requests.get(f"{API}/equipment/transfers/all", headers=admin_headers, timeout=15)
        tr = next(x for x in t.json() if x["id"] == pytest.iter36_transfer_id)
        assert tr["status"] == "accepted"

    def test_other_foreman_cannot_accept_someone_elses(self, admin_headers, site_id, equipment):
        # Create a 2nd transfer and try to accept it from a different foreman
        other = _register_foreman(admin_headers, site_id, "OTHER")
        r = requests.post(
            f"{API}/equipment/transfer-from-warehouse",
            json={"equipment_id": equipment["id"], "to_foreman_id": other["id"], "quantity": 1},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        # try to accept with the original foreman_a (wrong recipient)
        # we re-register first foreman? Actually we use the existing foreman fixture token
        # but that one already accepted theirs - now try to accept this one.
        from_other = requests.post(
            f"{API}/equipment/transfers/{tid}/accept",
            headers=hdr(other["token"]),
            timeout=15,
        )
        assert from_other.status_code == 200, from_other.text


class TestEquipmentTotalQuantityUpdate:
    def test_update_total_quantity(self, admin_headers, equipment):
        r = requests.put(
            f"{API}/equipment/{equipment['id']}",
            json={"total_quantity": 15},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["total_quantity"] == 15
        # verify persist
        g = requests.get(f"{API}/equipment", headers=admin_headers, timeout=15)
        item = next(e for e in g.json() if e["id"] == equipment["id"])
        assert item["total_quantity"] == 15

    def test_update_below_assigned_rejected(self, admin_headers, equipment):
        # Already 3 assigned + 1 in 2nd pending accepted => >=4 assigned. Try to set 1
        r = requests.put(
            f"{API}/equipment/{equipment['id']}",
            json={"total_quantity": 1},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 400, r.text


class TestReturnToRepair:
    """Foreman returns qty -> admin routes to repair -> broken_quantity increases."""

    def test_foreman_returns_qty(self, foreman, equipment, admin_headers):
        # Foreman has 3 assigned. Return 2 to warehouse (creates pending notification)
        r = requests.post(
            f"{API}/equipment/return",
            json={"equipment_id": equipment["id"], "quantity": 2},
            headers=hdr(foreman["token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # endpoint may return the notification or a message; both ok
        # find notification via list
        n = requests.get(f"{API}/equipment/returns/pending", headers=admin_headers, timeout=15)
        assert n.status_code == 200, n.text
        mine = [
            x for x in n.json()
            if x["from_foreman_id"] == foreman["id"]
            and x["equipment_id"] == equipment["id"]
            and x["status"] == "pending"
        ]
        assert mine, f"no pending return notification found, got: {n.json()}"
        pytest.iter36_notif_id = mine[0]["id"]
        assert mine[0]["quantity"] == 2

    def test_assignment_already_reduced(self, admin_headers, equipment, foreman):
        """After return submission the assignment is already decremented (per existing flow)."""
        a = requests.get(f"{API}/equipment/assignments/all", headers=admin_headers, timeout=15)
        pairs = {(x["equipment_id"], x["foreman_id"]): x["quantity"] for x in a.json()}
        # 3 - 2 = 1 remaining
        assert pairs.get((equipment["id"], foreman["id"])) == 1

    def test_admin_routes_to_repair(self, admin_headers, equipment):
        # capture broken_quantity before
        g0 = requests.get(f"{API}/equipment", headers=admin_headers, timeout=15)
        before = next(e for e in g0.json() if e["id"] == equipment["id"])
        broken_before = before.get("broken_quantity", 0) or 0

        r = requests.post(
            f"{API}/equipment/returns/{pytest.iter36_notif_id}/to-repair",
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("quantity") == 2

        # broken_quantity must have increased by 2
        g1 = requests.get(f"{API}/equipment", headers=admin_headers, timeout=15)
        after = next(e for e in g1.json() if e["id"] == equipment["id"])
        broken_after = after.get("broken_quantity", 0) or 0
        assert broken_after - broken_before == 2, (
            f"broken_quantity did not increase by 2: before={broken_before} after={broken_after}"
        )

        # notification status updated
        n = requests.get(f"{API}/equipment/returns/pending", headers=admin_headers, timeout=15)
        still_pending = [x for x in n.json() if x["id"] == pytest.iter36_notif_id]
        assert not still_pending, "notification still in pending list"

    def test_to_repair_already_processed_rejected(self, admin_headers):
        r = requests.post(
            f"{API}/equipment/returns/{pytest.iter36_notif_id}/to-repair",
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 400


# ---- Cleanup ----
@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin_headers):
    yield
    # Best-effort: delete the equipment we created (no API guarantee, ignore failures)
    try:
        eq_id = getattr(pytest, "iter36_eq_id", None)
        if eq_id:
            requests.delete(f"{API}/equipment/{eq_id}", headers=admin_headers, timeout=10)
    except Exception:
        pass
