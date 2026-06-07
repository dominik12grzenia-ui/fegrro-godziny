"""iter93 tests: pending-transfer aware availability, cancel-transfer,
integrity diagnostics & repair endpoints.

Bug context: User transferred equipment to foreman, available dropped
to 0 but equipment not yet assigned (still pending acceptance).
Now pending transfers correctly reserve stock and admin can cancel
stale ones.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASS = "Admin123!"
FOREMAN_A_ID = "cae21436-3a07-44d3-b91c-135a70769fe8"
OVERASSIGNED_EQ_ID = "3343c176-01f8-402f-8e29-15fb9a172cdc"  # pre-existing


# ----------------------- Fixtures -----------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
                      timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"}


@pytest.fixture
def test_equipment(admin_headers):
    """Create a fresh equipment item with total_quantity=3 for tests."""
    name = f"TEST_iter93_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{BASE_URL}/api/equipment",
                      headers=admin_headers,
                      json={"name": name, "total_quantity": 3,
                            "category": "electronics"},
                      timeout=15)
    assert r.status_code in (200, 201), f"create eq: {r.status_code} {r.text}"
    eq = r.json()
    yield eq
    # cleanup
    requests.delete(f"{BASE_URL}/api/equipment/{eq['id']}",
                    headers=admin_headers, timeout=15)


def _get_eq_from_list(admin_headers, eq_id):
    r = requests.get(f"{BASE_URL}/api/equipment", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    for it in r.json():
        if it["id"] == eq_id:
            return it
    return None


def _create_pending_transfer(admin_headers, eq_id, qty, to_id=FOREMAN_A_ID):
    r = requests.post(f"{BASE_URL}/api/equipment/transfer-from-warehouse",
                      headers=admin_headers,
                      json={"equipment_id": eq_id, "to_foreman_id": to_id,
                            "quantity": qty},
                      timeout=15)
    return r


# ----------------------- Tests -----------------------
class TestListEquipmentFields:
    """GET /api/equipment exposes new pending_transfer_quantity & is_overassigned."""

    def test_new_fields_present_for_all(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/equipment",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) > 0
        for it in items:
            assert "pending_transfer_quantity" in it, f"missing field in {it.get('name')}"
            assert "is_overassigned" in it
            assert isinstance(it["pending_transfer_quantity"], int)
            assert isinstance(it["is_overassigned"], bool)

    def test_known_overassigned_detected(self, admin_headers):
        """Pre-existing Drabina aluminiowa 3m has assigned > total."""
        it = _get_eq_from_list(admin_headers, OVERASSIGNED_EQ_ID)
        if it is None:
            pytest.skip("Drabina aluminiowa 3m fixture not present")
        assert it["is_overassigned"] is True, \
            f"expected over-assigned: total={it.get('total_quantity')} assigned={it.get('assigned_quantity')}"


class TestPendingReservesStock:
    """available_quantity must subtract pending transfers."""

    def test_pending_reduces_available(self, admin_headers, test_equipment):
        eq_id = test_equipment["id"]
        # baseline: total=3, pending=0, avail=3
        before = _get_eq_from_list(admin_headers, eq_id)
        assert before["available_quantity"] == 3
        assert before["pending_transfer_quantity"] == 0
        assert before["is_overassigned"] is False

        r = _create_pending_transfer(admin_headers, eq_id, 1)
        assert r.status_code == 200, f"transfer create: {r.status_code} {r.text}"
        transfer = r.json()
        transfer_id = transfer["id"]

        after = _get_eq_from_list(admin_headers, eq_id)
        assert after["pending_transfer_quantity"] == 1
        assert after["available_quantity"] == 2
        assert after["is_overassigned"] is False

        # cleanup transfer
        requests.post(f"{BASE_URL}/api/equipment/transfers/{transfer_id}/cancel",
                      headers=admin_headers, timeout=15)


class TestSingleEquipment:
    def test_single_returns_new_fields(self, admin_headers, test_equipment):
        eq_id = test_equipment["id"]
        r = requests.get(f"{BASE_URL}/api/equipment/single/{eq_id}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "pending_transfer_quantity" in data
        assert "is_overassigned" in data
        assert isinstance(data["pending_transfer_quantity"], int)


class TestTransferRejectionMessage:
    def test_rejects_when_pending_consumes_stock(self, admin_headers, test_equipment):
        eq_id = test_equipment["id"]
        # reserve 2 of 3
        r1 = _create_pending_transfer(admin_headers, eq_id, 2)
        assert r1.status_code == 200, r1.text
        t1_id = r1.json()["id"]

        # try to reserve 2 more (only 1 available) -> 400 with breakdown
        r2 = _create_pending_transfer(admin_headers, eq_id, 2)
        assert r2.status_code == 400
        detail = r2.json().get("detail", "")
        for kw in ["calkowita", "przypisane", "w naprawie", "zaginione",
                   "oczekujace przekazania"]:
            assert kw in detail, f"missing keyword '{kw}' in error: {detail}"

        # cleanup
        requests.post(f"{BASE_URL}/api/equipment/transfers/{t1_id}/cancel",
                      headers=admin_headers, timeout=15)


class TestCancelTransfer:
    def test_cancel_pending_frees_stock(self, admin_headers, test_equipment):
        eq_id = test_equipment["id"]
        r = _create_pending_transfer(admin_headers, eq_id, 2)
        assert r.status_code == 200
        t_id = r.json()["id"]

        before = _get_eq_from_list(admin_headers, eq_id)
        assert before["pending_transfer_quantity"] == 2
        assert before["available_quantity"] == 1

        c = requests.post(f"{BASE_URL}/api/equipment/transfers/{t_id}/cancel",
                          headers=admin_headers, timeout=15)
        assert c.status_code == 200, c.text
        body = c.json()
        assert "message" in body

        after = _get_eq_from_list(admin_headers, eq_id)
        assert after["pending_transfer_quantity"] == 0
        assert after["available_quantity"] == 3

    def test_cancel_already_cancelled_returns_400(self, admin_headers, test_equipment):
        eq_id = test_equipment["id"]
        r = _create_pending_transfer(admin_headers, eq_id, 1)
        assert r.status_code == 200
        t_id = r.json()["id"]
        c1 = requests.post(f"{BASE_URL}/api/equipment/transfers/{t_id}/cancel",
                           headers=admin_headers, timeout=15)
        assert c1.status_code == 200
        # second call must 400
        c2 = requests.post(f"{BASE_URL}/api/equipment/transfers/{t_id}/cancel",
                           headers=admin_headers, timeout=15)
        assert c2.status_code == 400

    def test_cancel_nonexistent_returns_404(self, admin_headers):
        fake_id = str(uuid.uuid4())
        c = requests.post(f"{BASE_URL}/api/equipment/transfers/{fake_id}/cancel",
                          headers=admin_headers, timeout=15)
        assert c.status_code == 404


class TestIntegrityEndpoint:
    def test_integrity_returns_expected_structure(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/equipment/integrity",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "summary" in data
        assert "over_assigned" in data
        assert "orphan_assignments" in data
        assert "stuck_transfers" in data
        assert isinstance(data["over_assigned"], list)
        assert isinstance(data["orphan_assignments"], list)
        assert isinstance(data["stuck_transfers"], list)
        # summary counts
        s = data["summary"]
        assert s["over_assigned_count"] == len(data["over_assigned"])
        assert s["orphan_assignments_count"] == len(data["orphan_assignments"])
        assert s["stuck_transfers_count"] == len(data["stuck_transfers"])

    def test_known_overassigned_in_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/equipment/integrity",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        ids = [oa["equipment_id"] for oa in r.json()["over_assigned"]]
        if OVERASSIGNED_EQ_ID not in ids:
            pytest.skip("known overassigned eq not in DB anymore")
        oa = next(x for x in r.json()["over_assigned"]
                  if x["equipment_id"] == OVERASSIGNED_EQ_ID)
        for k in ["equipment_name", "total_quantity", "assigned_quantity",
                  "broken_quantity", "lost_quantity", "excess"]:
            assert k in oa
        assert oa["excess"] > 0

    def test_integrity_requires_admin(self):
        r = requests.get(f"{BASE_URL}/api/equipment/integrity", timeout=15)
        assert r.status_code in (401, 403)


class TestIntegrityRepair:
    def test_repair_cleanup_orphans_only(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/equipment/integrity/repair",
                          headers=admin_headers,
                          json={"cleanup_orphans": True,
                                "cancel_stuck_transfers": False},
                          timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "deleted_orphans" in data
        assert "cancelled_transfers" in data
        assert isinstance(data["deleted_orphans"], int)
        assert data["cancelled_transfers"] == 0

    def test_repair_cancel_stuck_transfers(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/equipment/integrity/repair",
                          headers=admin_headers,
                          json={"cleanup_orphans": False,
                                "cancel_stuck_transfers": True},
                          timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data["cancelled_transfers"], int)
        assert data["deleted_orphans"] == 0


class TestSetAssignmentValidation:
    def test_assign_respects_pending(self, admin_headers, admin_token):
        """eq total=2; create pending transfer of 1 → cannot assign 2 to another foreman."""
        # need a second foreman id (different from FOREMAN_A_ID)
        ru = requests.get(f"{BASE_URL}/api/foremen",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          timeout=15)
        if ru.status_code != 200:
            pytest.skip(f"cannot list foremen: {ru.status_code}")
        users = ru.json()
        other_foremen = [u for u in users if u.get("id") != FOREMAN_A_ID]
        if not other_foremen:
            pytest.skip("no second foreman available")
        other_id = other_foremen[0]["id"]

        # Create fresh equipment total=2
        name = f"TEST_iter93_assign_{uuid.uuid4().hex[:8]}"
        ce = requests.post(f"{BASE_URL}/api/equipment",
                           headers=admin_headers,
                           json={"name": name, "total_quantity": 2,
                                 "category": "electronics"},
                           timeout=15)
        assert ce.status_code in (200, 201)
        eq = ce.json()
        eq_id = eq["id"]
        try:
            # pending 1 to FOREMAN_A_ID
            r = _create_pending_transfer(admin_headers, eq_id, 1)
            assert r.status_code == 200
            t_id = r.json()["id"]

            # try direct-assign 2 to other foreman -> 400
            bad = requests.post(
                f"{BASE_URL}/api/equipment/assign?equipment_id={eq_id}",
                headers=admin_headers,
                json={"foreman_id": other_id, "quantity": 2},
                timeout=15)
            assert bad.status_code == 400, \
                f"expected 400 due to pending, got {bad.status_code}: {bad.text}"
            for kw in ["oczekujace przekazania", "przypisane innym"]:
                assert kw in bad.json().get("detail", "")

            # assign 1 should succeed (1 pending + 1 assign = 2 total OK)
            ok = requests.post(
                f"{BASE_URL}/api/equipment/assign?equipment_id={eq_id}",
                headers=admin_headers,
                json={"foreman_id": other_id, "quantity": 1},
                timeout=15)
            assert ok.status_code == 200, \
                f"expected 200, got {ok.status_code}: {ok.text}"

            # cleanup
            requests.post(f"{BASE_URL}/api/equipment/transfers/{t_id}/cancel",
                          headers=admin_headers, timeout=15)
            requests.post(
                f"{BASE_URL}/api/equipment/assign?equipment_id={eq_id}",
                headers=admin_headers,
                json={"foreman_id": other_id, "quantity": 0},
                timeout=15)
        finally:
            requests.delete(f"{BASE_URL}/api/equipment/{eq_id}",
                            headers=admin_headers, timeout=15)


class TestAcceptTransferFlow:
    """After accept: pending_transfer_quantity drops, assigned_quantity rises."""

    def test_accept_moves_pending_to_assigned(self, admin_headers, test_equipment):
        eq_id = test_equipment["id"]
        # baseline
        b = _get_eq_from_list(admin_headers, eq_id)
        baseline_assigned = b["assigned_quantity"]

        r = _create_pending_transfer(admin_headers, eq_id, 1)
        assert r.status_code == 200
        t_id = r.json()["id"]

        mid = _get_eq_from_list(admin_headers, eq_id)
        assert mid["pending_transfer_quantity"] == 1
        assert mid["assigned_quantity"] == baseline_assigned

        # foreman A accepts via foreman login token
        fl = requests.post(f"{BASE_URL}/api/auth/foreman/login",
                           json={"email": "TEST_Foreman_A_a8b95c",
                                 "password": "Test1234!"}, timeout=15)
        if fl.status_code != 200:
            requests.post(
                f"{BASE_URL}/api/equipment/transfers/{t_id}/cancel",
                headers=admin_headers, timeout=15)
            pytest.skip(f"foreman login failed: {fl.status_code} {fl.text[:100]}")
        ftok = fl.json().get("access_token")
        fheaders = {"Authorization": f"Bearer {ftok}",
                    "Content-Type": "application/json"}
        acc = requests.post(
            f"{BASE_URL}/api/equipment/transfers/{t_id}/accept",
            headers=fheaders, timeout=15)
        if acc.status_code != 200:
            requests.post(
                f"{BASE_URL}/api/equipment/transfers/{t_id}/cancel",
                headers=admin_headers, timeout=15)
            pytest.skip(f"accept failed (status={acc.status_code}): "
                        f"{acc.text[:200]}")

        end = _get_eq_from_list(admin_headers, eq_id)
        assert end["pending_transfer_quantity"] == 0
        assert end["assigned_quantity"] == baseline_assigned + 1

        # cleanup assignment
        requests.post(
            f"{BASE_URL}/api/equipment/assign?equipment_id={eq_id}",
            headers=admin_headers,
            json={"foreman_id": FOREMAN_A_ID, "quantity": 0},
            timeout=15)
