"""Backend tests for Equipment (Sprzet) feature."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend .env when REACT_APP_BACKEND_URL not in env
    from pathlib import Path
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


# -------- Fixtures --------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{API}/auth/admin/login",
        json={"email": "admin@fegrro.pl", "password": "admin123"},
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def site_id(admin_headers):
    """Create a site so we can activate foremen."""
    r = requests.post(
        f"{API}/sites",
        json={"name": f"TEST_SITE_{uuid.uuid4().hex[:6]}", "address": "Testowa 1"},
        headers=admin_headers,
    )
    if r.status_code in (200, 201):
        return r.json().get("id") or r.json().get("_id")
    # fallback: pick any existing site
    r2 = requests.get(f"{API}/sites", headers=admin_headers)
    if r2.status_code == 200 and r2.json():
        return r2.json()[0]["id"]
    pytest.skip(f"cannot create or list sites: {r.status_code} {r.text}")


@pytest.fixture(scope="module")
def foreman_a(admin_headers, site_id):
    name = f"TEST_Foreman_A_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/auth/worker/register", json={"full_name": name, "role": "foreman"})
    assert r.status_code == 200, r.text
    data = r.json()
    fid = data["user_id"]
    # activate by assigning a site
    r2 = requests.post(
        f"{API}/foremen/{fid}/sites",
        json={"site_ids": [site_id]},
        headers=admin_headers,
    )
    assert r2.status_code == 200, r2.text
    return {"id": fid, "name": name, "token": data["access_token"]}


@pytest.fixture(scope="module")
def foreman_b(admin_headers, site_id):
    name = f"TEST_Foreman_B_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/auth/worker/register", json={"full_name": name, "role": "foreman"})
    assert r.status_code == 200, r.text
    data = r.json()
    fid = data["user_id"]
    r2 = requests.post(
        f"{API}/foremen/{fid}/sites",
        json={"site_ids": [site_id]},
        headers=admin_headers,
    )
    assert r2.status_code == 200, r2.text
    return {"id": fid, "name": name, "token": data["access_token"]}


def hdr(token):
    return {"Authorization": f"Bearer {token}"}


# -------- Equipment CRUD --------
class TestEquipmentCRUD:
    def test_create_equipment(self, admin_headers):
        r = requests.post(
            f"{API}/equipment",
            json={"name": "TEST_Wiertarka", "brand": "Bosch", "total_quantity": 10},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_Wiertarka"
        assert data["brand"] == "Bosch"
        assert data["total_quantity"] == 10
        assert data["assigned_quantity"] == 0
        assert data["available_quantity"] == 10
        assert data["status"] == "working"
        assert "id" in data
        pytest.eq_id = data["id"]

    def test_list_equipment_contains_created(self, admin_headers):
        r = requests.get(f"{API}/equipment", headers=admin_headers)
        assert r.status_code == 200
        ids = [e["id"] for e in r.json()]
        assert pytest.eq_id in ids

    def test_create_negative_quantity_rejected(self, admin_headers):
        r = requests.post(
            f"{API}/equipment",
            json={"name": "TEST_Bad", "total_quantity": -1},
            headers=admin_headers,
        )
        assert r.status_code == 400

    def test_update_equipment(self, admin_headers):
        r = requests.put(
            f"{API}/equipment/{pytest.eq_id}",
            json={"name": "TEST_Wiertarka_v2", "total_quantity": 12, "status": "working"},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_Wiertarka_v2"
        assert data["total_quantity"] == 12

        # verify persisted
        g = requests.get(f"{API}/equipment", headers=admin_headers)
        item = next(e for e in g.json() if e["id"] == pytest.eq_id)
        assert item["name"] == "TEST_Wiertarka_v2"
        assert item["total_quantity"] == 12

    def test_non_admin_cannot_create(self, foreman_a):
        r = requests.post(
            f"{API}/equipment",
            json={"name": "TEST_X", "total_quantity": 1},
            headers=hdr(foreman_a["token"]),
        )
        assert r.status_code in (401, 403)


# -------- Assignments --------
class TestAssignments:
    def test_assign_to_foreman_a(self, admin_headers, foreman_a):
        r = requests.post(
            f"{API}/equipment/assign?equipment_id={pytest.eq_id}",
            json={"foreman_id": foreman_a["id"], "quantity": 5},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text

        g = requests.get(f"{API}/equipment", headers=admin_headers)
        item = next(e for e in g.json() if e["id"] == pytest.eq_id)
        assert item["assigned_quantity"] == 5
        assert item["available_quantity"] == 7

    def test_assign_to_foreman_b(self, admin_headers, foreman_b):
        r = requests.post(
            f"{API}/equipment/assign?equipment_id={pytest.eq_id}",
            json={"foreman_id": foreman_b["id"], "quantity": 3},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/equipment", headers=admin_headers)
        item = next(e for e in g.json() if e["id"] == pytest.eq_id)
        assert item["assigned_quantity"] == 8

    def test_assign_exceeding_total_rejected(self, admin_headers, foreman_a):
        # Already a=5, b=3 -> 8/12. Trying to set a=20 (others=3) -> 23 > 12
        r = requests.post(
            f"{API}/equipment/assign?equipment_id={pytest.eq_id}",
            json={"foreman_id": foreman_a["id"], "quantity": 20},
            headers=admin_headers,
        )
        assert r.status_code == 400
        assert "Dostepne" in r.json().get("detail", "") or "Brak" in r.json().get("detail", "")

    def test_update_total_below_assigned_rejected(self, admin_headers):
        r = requests.put(
            f"{API}/equipment/{pytest.eq_id}",
            json={"total_quantity": 3},  # 8 assigned
            headers=admin_headers,
        )
        assert r.status_code == 400

    def test_assignments_matrix(self, admin_headers, foreman_a, foreman_b):
        r = requests.get(f"{API}/equipment/assignments/all", headers=admin_headers)
        assert r.status_code == 200
        pairs = {(a["equipment_id"], a["foreman_id"]): a["quantity"] for a in r.json()}
        assert pairs.get((pytest.eq_id, foreman_a["id"])) == 5
        assert pairs.get((pytest.eq_id, foreman_b["id"])) == 3

    def test_my_equipment_foreman_a(self, foreman_a):
        r = requests.get(f"{API}/equipment/my", headers=hdr(foreman_a["token"]))
        assert r.status_code == 200
        items = r.json()
        mine = next((i for i in items if i["id"] == pytest.eq_id), None)
        assert mine is not None
        assert mine["quantity"] == 5

    def test_assign_zero_removes(self, admin_headers, foreman_b):
        # Will re-add later
        r = requests.post(
            f"{API}/equipment/assign?equipment_id={pytest.eq_id}",
            json={"foreman_id": foreman_b["id"], "quantity": 0},
            headers=admin_headers,
        )
        assert r.status_code == 200
        g = requests.get(f"{API}/equipment", headers=admin_headers)
        item = next(e for e in g.json() if e["id"] == pytest.eq_id)
        assert item["assigned_quantity"] == 5

        # restore for downstream tests
        requests.post(
            f"{API}/equipment/assign?equipment_id={pytest.eq_id}",
            json={"foreman_id": foreman_b["id"], "quantity": 3},
            headers=admin_headers,
        )


# -------- Transfers --------
class TestTransfers:
    def test_request_transfer(self, foreman_a, foreman_b):
        r = requests.post(
            f"{API}/equipment/transfer",
            json={
                "equipment_id": pytest.eq_id,
                "to_foreman_id": foreman_b["id"],
                "quantity": 2,
            },
            headers=hdr(foreman_a["token"]),
        )
        assert r.status_code == 200, r.text
        pytest.transfer_id = r.json()["id"]
        assert r.json()["status"] == "pending"

    def test_self_transfer_rejected(self, foreman_a):
        r = requests.post(
            f"{API}/equipment/transfer",
            json={
                "equipment_id": pytest.eq_id,
                "to_foreman_id": foreman_a["id"],
                "quantity": 1,
            },
            headers=hdr(foreman_a["token"]),
        )
        assert r.status_code == 400

    def test_transfer_exceeds_owned(self, foreman_a, foreman_b):
        r = requests.post(
            f"{API}/equipment/transfer",
            json={
                "equipment_id": pytest.eq_id,
                "to_foreman_id": foreman_b["id"],
                "quantity": 999,
            },
            headers=hdr(foreman_a["token"]),
        )
        assert r.status_code == 400

    def test_pending_transfers_visible_to_b(self, foreman_b):
        r = requests.get(f"{API}/equipment/transfers/pending", headers=hdr(foreman_b["token"]))
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert pytest.transfer_id in ids

    def test_other_foreman_cannot_accept(self, foreman_a):
        r = requests.post(
            f"{API}/equipment/transfers/{pytest.transfer_id}/accept",
            headers=hdr(foreman_a["token"]),
        )
        assert r.status_code == 403

    def test_accept_transfer_moves_quantity(self, foreman_b, admin_headers, foreman_a):
        r = requests.post(
            f"{API}/equipment/transfers/{pytest.transfer_id}/accept",
            headers=hdr(foreman_b["token"]),
        )
        assert r.status_code == 200, r.text

        # foreman A should now have 5-2=3, B should have 3+2=5
        ga = requests.get(f"{API}/equipment/my", headers=hdr(foreman_a["token"]))
        a_qty = next(i["quantity"] for i in ga.json() if i["id"] == pytest.eq_id)
        assert a_qty == 3
        gb = requests.get(f"{API}/equipment/my", headers=hdr(foreman_b["token"]))
        b_qty = next(i["quantity"] for i in gb.json() if i["id"] == pytest.eq_id)
        assert b_qty == 5

        # total assigned still 8
        g = requests.get(f"{API}/equipment", headers=admin_headers)
        item = next(e for e in g.json() if e["id"] == pytest.eq_id)
        assert item["assigned_quantity"] == 8

    def test_accept_already_processed_rejected(self, foreman_b):
        r = requests.post(
            f"{API}/equipment/transfers/{pytest.transfer_id}/accept",
            headers=hdr(foreman_b["token"]),
        )
        assert r.status_code == 400

    def test_reject_flow(self, foreman_a, foreman_b):
        # create a new transfer, then reject
        r = requests.post(
            f"{API}/equipment/transfer",
            json={
                "equipment_id": pytest.eq_id,
                "to_foreman_id": foreman_b["id"],
                "quantity": 1,
            },
            headers=hdr(foreman_a["token"]),
        )
        assert r.status_code == 200
        tid = r.json()["id"]
        r2 = requests.post(
            f"{API}/equipment/transfers/{tid}/reject",
            headers=hdr(foreman_b["token"]),
        )
        assert r2.status_code == 200
        # quantity unchanged: A still 3
        ga = requests.get(f"{API}/equipment/my", headers=hdr(foreman_a["token"]))
        a_qty = next(i["quantity"] for i in ga.json() if i["id"] == pytest.eq_id)
        assert a_qty == 3


# -------- Defects --------
class TestDefects:
    def test_report_defect(self, foreman_a):
        r = requests.post(
            f"{API}/equipment/defect",
            json={
                "equipment_id": pytest.eq_id,
                "quantity": 1,
                "description": "TEST_pekniety_uchwyt",
            },
            headers=hdr(foreman_a["token"]),
        )
        assert r.status_code == 200, r.text
        assert r.json()["description"] == "TEST_pekniety_uchwyt"

    def test_admin_sees_all_defects(self, admin_headers):
        r = requests.get(f"{API}/equipment/defects", headers=admin_headers)
        assert r.status_code == 200
        descs = [d.get("description") for d in r.json()]
        assert "TEST_pekniety_uchwyt" in descs

    def test_foreman_sees_only_own(self, foreman_b):
        r = requests.get(f"{API}/equipment/defects", headers=hdr(foreman_b["token"]))
        assert r.status_code == 200
        # foreman B did not report the defect
        descs = [d.get("description") for d in r.json()]
        assert "TEST_pekniety_uchwyt" not in descs

    def test_admin_cannot_report_defect(self, admin_headers):
        r = requests.post(
            f"{API}/equipment/defect",
            json={"equipment_id": pytest.eq_id, "quantity": 1},
            headers=admin_headers,
        )
        assert r.status_code == 403


# -------- History --------
class TestHistory:
    def test_admin_history_full(self, admin_headers):
        r = requests.get(f"{API}/equipment/history", headers=admin_headers)
        assert r.status_code == 200
        actions = {h["action"] for h in r.json() if h.get("equipment_id") == pytest.eq_id}
        # at least these should exist after the prior tests
        for expected in {"created", "assigned", "transfer_requested", "transfer_accepted",
                         "transfer_rejected", "defect_reported"}:
            assert expected in actions, f"missing {expected} in {actions}"

    def test_foreman_history_only_own(self, foreman_b):
        r = requests.get(f"{API}/equipment/history", headers=hdr(foreman_b["token"]))
        assert r.status_code == 200
        # should not contain "created" (admin action)
        for h in r.json():
            assert h["action"] != "created"


# -------- Cleanup --------
class TestZCleanup:
    def test_delete_equipment(self, admin_headers):
        r = requests.delete(f"{API}/equipment/{pytest.eq_id}", headers=admin_headers)
        assert r.status_code == 200

        g = requests.get(f"{API}/equipment", headers=admin_headers)
        ids = [e["id"] for e in g.json()]
        assert pytest.eq_id not in ids

        # assignments should be gone
        a = requests.get(f"{API}/equipment/assignments/all", headers=admin_headers)
        for assignment in a.json():
            assert assignment["equipment_id"] != pytest.eq_id
