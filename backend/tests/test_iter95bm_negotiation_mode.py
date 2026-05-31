"""iter95bm: Backend tests for negotiation mode (tryb negocjacji).

Covers:
- PATCH /api/wyceny/{id} with negotiation_mode flag (persistence + readback via /template)
- POST /api/wyceny/lines: auto-set price_min for materials/equipment (uses MAX with cennik)
- POST /api/wyceny/lines: labor copies price_min/price_max from price_book
- PATCH /api/wyceny/lines/{id}: HTTP 400 when below price_min and negotiation_mode=true
- PATCH /api/wyceny/lines/{id}: allows below price_min when negotiation_mode=false (records below_min=true)
- PATCH /api/wyceny/lines/{id}: allows below_min_accepted=true override
- PATCH /api/wyceny/lines/{id}: price_book_id triggers MAX(existing, book) for materials/equipment
- Smoke regression for other wyceny endpoints
"""
import os
import time
import pytest
import requests


def _load_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not url:
        env_path = "/app/frontend/.env"
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
    return url.rstrip("/")


BASE_URL = _load_base_url()
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASS = "Admin123!"
REF_WYCENA_ID = "52438c80-a55c-488b-9868-d5969c5b0402"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def api(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def ctx(api):
    """Create wycena + stage + position + cennik items (materials, labor). Cleanup after."""
    ts = int(time.time())
    name = f"TEST_iter95bm_{ts}"
    r = api.post(f"{BASE_URL}/api/wyceny", json={"name": name})
    assert r.status_code == 200, r.text
    wycena_id = r.json()["id"]

    r = api.post(f"{BASE_URL}/api/wyceny/stages",
                 json={"wycena_id": wycena_id, "name": "Etap NEG", "order": 0})
    assert r.status_code == 200, r.text
    stage_id = r.json()["id"]

    r = api.post(f"{BASE_URL}/api/wyceny/positions",
                 json={"wycena_id": wycena_id, "stage_id": stage_id,
                       "name": "Pozycja NEG", "order": 0, "quantity": 10, "unit": "m²"})
    assert r.status_code == 200, r.text
    position_id = r.json()["id"]

    # Cennik entries
    r = api.post(f"{BASE_URL}/api/wyceny/cennik",
                 json={"category": "materials", "name": f"TEST_mat_{ts}",
                       "unit_price_netto": 90, "price_min": 80, "price_max": 200})
    assert r.status_code == 200, r.text
    cennik_mat_80 = r.json()["id"]

    r = api.post(f"{BASE_URL}/api/wyceny/cennik",
                 json={"category": "materials", "name": f"TEST_mat200_{ts}",
                       "unit_price_netto": 250, "price_min": 200, "price_max": 400})
    assert r.status_code == 200, r.text
    cennik_mat_200 = r.json()["id"]

    r = api.post(f"{BASE_URL}/api/wyceny/cennik",
                 json={"category": "labor", "name": f"TEST_labor_{ts}",
                       "unit_price_netto": 120, "price_min": 100, "price_max": 150})
    assert r.status_code == 200, r.text
    cennik_labor = r.json()["id"]

    created_lines = []

    yield {
        "wycena_id": wycena_id, "stage_id": stage_id, "position_id": position_id,
        "cennik_mat_80": cennik_mat_80, "cennik_mat_200": cennik_mat_200,
        "cennik_labor": cennik_labor, "created_lines": created_lines,
    }

    # Cleanup
    api.delete(f"{BASE_URL}/api/wyceny/{wycena_id}")
    for cid in (cennik_mat_80, cennik_mat_200, cennik_labor):
        api.delete(f"{BASE_URL}/api/wyceny/cennik/{cid}")


def _find_sub(tpl, line_id):
    for st in tpl.get("stages", []):
        for p in st.get("positions", []):
            for slot in p.get("slots", []):
                if slot.get("id") == line_id:
                    return slot
                for ch in slot.get("children", []):
                    if ch.get("id") == line_id:
                        return ch
    return None


def _set_negotiation(api, wycena_id, value: bool):
    r = api.patch(f"{BASE_URL}/api/wyceny/{wycena_id}",
                  json={"negotiation_mode": value})
    assert r.status_code == 200, r.text
    return r.json()


# =========== TESTS ===========

class TestNegotiationModeFlag:
    """PATCH /api/wyceny/{id} with negotiation_mode; readback via /template."""

    def test_set_negotiation_true(self, api, ctx):
        doc = _set_negotiation(api, ctx["wycena_id"], True)
        assert doc.get("negotiation_mode") is True

        tpl = api.get(f"{BASE_URL}/api/wyceny/{ctx['wycena_id']}/template").json()
        assert tpl["wycena"].get("negotiation_mode") is True

    def test_set_negotiation_false(self, api, ctx):
        doc = _set_negotiation(api, ctx["wycena_id"], False)
        assert doc.get("negotiation_mode") is False

        tpl = api.get(f"{BASE_URL}/api/wyceny/{ctx['wycena_id']}/template").json()
        assert tpl["wycena"].get("negotiation_mode") is False


class TestAutoPriceMinOnCreate:
    """POST /api/wyceny/lines auto-set price_min for materials/equipment."""

    def test_materials_no_price_book_first_price_becomes_min(self, api, ctx):
        r = api.post(f"{BASE_URL}/api/wyceny/lines",
                     json={"wycena_id": ctx["wycena_id"], "stage_id": ctx["stage_id"],
                           "position_id": ctx["position_id"], "type": "materials",
                           "name": "AutoMin Mat", "quantity": 1, "unit_price_netto": 50,
                           "order": 1})
        assert r.status_code == 200, r.text
        line = r.json()
        ctx["created_lines"].append(line["id"])
        assert line.get("price_min") == 50.0, f"expected 50, got {line.get('price_min')}"

    def test_equipment_no_price_book_first_price_becomes_min(self, api, ctx):
        r = api.post(f"{BASE_URL}/api/wyceny/lines",
                     json={"wycena_id": ctx["wycena_id"], "stage_id": ctx["stage_id"],
                           "position_id": ctx["position_id"], "type": "equipment",
                           "name": "AutoMin Equip", "quantity": 1, "unit_price_netto": 75,
                           "order": 2})
        assert r.status_code == 200, r.text
        line = r.json()
        ctx["created_lines"].append(line["id"])
        assert line.get("price_min") == 75.0

    def test_materials_with_price_book_takes_max(self, api, ctx):
        """unit=50, book.price_min=80 → expect MAX=80."""
        r = api.post(f"{BASE_URL}/api/wyceny/lines",
                     json={"wycena_id": ctx["wycena_id"], "stage_id": ctx["stage_id"],
                           "position_id": ctx["position_id"], "type": "materials",
                           "name": "AutoMin From Book", "quantity": 1,
                           "unit_price_netto": 50,
                           "price_book_id": ctx["cennik_mat_80"], "order": 3})
        assert r.status_code == 200, r.text
        line = r.json()
        ctx["created_lines"].append(line["id"])
        assert line.get("price_min") == 80.0, \
            f"MAX(50,80) should be 80, got {line.get('price_min')}"

    def test_labor_copies_min_max_from_book(self, api, ctx):
        r = api.post(f"{BASE_URL}/api/wyceny/lines",
                     json={"wycena_id": ctx["wycena_id"], "stage_id": ctx["stage_id"],
                           "position_id": ctx["position_id"], "type": "labor",
                           "name": "Labor From Book", "quantity": 1,
                           "unit_price_netto": 120,
                           "price_book_id": ctx["cennik_labor"], "order": 4})
        assert r.status_code == 200, r.text
        line = r.json()
        ctx["created_lines"].append(line["id"])
        assert line.get("price_min") == 100.0
        assert line.get("price_max") == 150.0


class TestNegotiationModeValidation:
    """PATCH /api/wyceny/lines/{id}: below price_min blocks when negotiation_mode=true."""

    @pytest.fixture
    def neg_line(self, api, ctx):
        # Fresh line with price_min=100 (auto set from unit_price_netto=100)
        r = api.post(f"{BASE_URL}/api/wyceny/lines",
                     json={"wycena_id": ctx["wycena_id"], "stage_id": ctx["stage_id"],
                           "position_id": ctx["position_id"], "type": "materials",
                           "name": "NegLine", "quantity": 1, "unit_price_netto": 100,
                           "order": 10})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        ctx["created_lines"].append(lid)
        assert r.json().get("price_min") == 100.0
        return lid

    def test_block_below_min_when_neg_mode_true(self, api, ctx, neg_line):
        _set_negotiation(api, ctx["wycena_id"], True)
        r = api.patch(f"{BASE_URL}/api/wyceny/lines/{neg_line}",
                      json={"unit_price_netto": 50})
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        # Verify message is human-readable
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        msg = (body.get("detail") or "").lower()
        assert "negocjacj" in msg or "minimum" in msg, f"unexpected detail: {body}"

        # Confirm price was NOT updated
        tpl = api.get(f"{BASE_URL}/api/wyceny/{ctx['wycena_id']}/template").json()
        sub = _find_sub(tpl, neg_line)
        assert sub["unit_price_netto"] == 100, \
            f"price should remain 100, got {sub['unit_price_netto']}"

    def test_allow_below_min_when_neg_mode_false(self, api, ctx, neg_line):
        _set_negotiation(api, ctx["wycena_id"], False)
        r = api.patch(f"{BASE_URL}/api/wyceny/lines/{neg_line}",
                      json={"unit_price_netto": 50})
        assert r.status_code == 200, r.text

        tpl = api.get(f"{BASE_URL}/api/wyceny/{ctx['wycena_id']}/template").json()
        sub = _find_sub(tpl, neg_line)
        assert sub["unit_price_netto"] == 50
        hist = sub.get("price_change_history", [])
        assert len(hist) >= 1
        last = hist[-1]
        assert last["to_price"] == 50.0
        assert last["below_min"] is True, f"expected below_min=True, got {last}"

    def test_allow_below_min_with_accepted_flag(self, api, ctx, neg_line):
        # Reset price above min first (line was set to 50 in last test, neg=false)
        _set_negotiation(api, ctx["wycena_id"], False)
        r = api.patch(f"{BASE_URL}/api/wyceny/lines/{neg_line}",
                      json={"unit_price_netto": 100})
        assert r.status_code == 200

        # Now enable negotiation mode
        _set_negotiation(api, ctx["wycena_id"], True)

        # Send below_min_accepted=true with price < min
        r = api.patch(f"{BASE_URL}/api/wyceny/lines/{neg_line}",
                      json={"unit_price_netto": 60, "below_min_accepted": True,
                            "below_min_reason": "Klient zaakceptowal rabat"})
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"

        tpl = api.get(f"{BASE_URL}/api/wyceny/{ctx['wycena_id']}/template").json()
        sub = _find_sub(tpl, neg_line)
        assert sub["unit_price_netto"] == 60


class TestPriceBookOnUpdate:
    """PATCH with price_book_id copies min/max according to type rules."""

    def test_patch_price_book_id_materials_copies_max_min(self, api, ctx):
        # Create a fresh materials line WITHOUT price_book and with price_min=None
        # (unit_price_netto=0 → no auto min)
        r = api.post(f"{BASE_URL}/api/wyceny/lines",
                     json={"wycena_id": ctx["wycena_id"], "stage_id": ctx["stage_id"],
                           "position_id": ctx["position_id"], "type": "materials",
                           "name": "PBPatch", "quantity": 1, "unit_price_netto": 0,
                           "order": 20})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        ctx["created_lines"].append(lid)
        assert r.json().get("price_min") is None

        # Patch with price_book_id (book.price_min=200) → expect price_min=200
        r = api.patch(f"{BASE_URL}/api/wyceny/lines/{lid}",
                      json={"price_book_id": ctx["cennik_mat_200"]})
        assert r.status_code == 200, r.text

        tpl = api.get(f"{BASE_URL}/api/wyceny/{ctx['wycena_id']}/template").json()
        sub = _find_sub(tpl, lid)
        assert sub.get("price_min") == 200.0, \
            f"expected 200 from book, got {sub.get('price_min')}"


# =========== Smoke regression ===========
class TestSmokeRegression:
    def test_list_wyceny(self, api):
        r = api.get(f"{BASE_URL}/api/wyceny")
        assert r.status_code == 200
        assert "rows" in r.json()

    def test_list_cennik(self, api):
        r = api.get(f"{BASE_URL}/api/wyceny/cennik?category=materials")
        assert r.status_code == 200
        assert "rows" in r.json()

    def test_get_template_for_ref_wycena(self, api):
        r = api.get(f"{BASE_URL}/api/wyceny/{REF_WYCENA_ID}/template")
        # Reference wycena from problem statement should exist
        assert r.status_code in (200, 404), r.text

    def test_update_position(self, api, ctx):
        r = api.patch(f"{BASE_URL}/api/wyceny/positions/{ctx['position_id']}",
                      json={"name": "Updated Neg Pos"})
        assert r.status_code == 200

    def test_update_stage(self, api, ctx):
        r = api.patch(f"{BASE_URL}/api/wyceny/stages/{ctx['stage_id']}",
                      json={"wycena_id": ctx["wycena_id"], "name": "Etap NEG Renamed", "order": 0})
        assert r.status_code == 200

    def test_delete_line(self, api, ctx):
        # Create a throwaway line and delete it
        r = api.post(f"{BASE_URL}/api/wyceny/lines",
                     json={"wycena_id": ctx["wycena_id"], "stage_id": ctx["stage_id"],
                           "position_id": ctx["position_id"], "type": "materials",
                           "name": "ToDelete", "quantity": 1, "unit_price_netto": 10,
                           "order": 99})
        assert r.status_code == 200
        lid = r.json()["id"]
        r = api.delete(f"{BASE_URL}/api/wyceny/lines/{lid}")
        assert r.status_code == 200


# =========== Restore ref wycena negotiation_mode=false ===========
class TestZRestoreRefWycena:
    """Last (alphabetical Z) - restore reference wycena negotiation_mode=False."""

    def test_restore_ref_wycena_negotiation_false(self, api):
        # Check if ref wycena exists; if yes, set negotiation_mode=False
        r = api.get(f"{BASE_URL}/api/wyceny/{REF_WYCENA_ID}/template")
        if r.status_code != 200:
            pytest.skip(f"Ref wycena {REF_WYCENA_ID} not found (status {r.status_code})")
        rr = api.patch(f"{BASE_URL}/api/wyceny/{REF_WYCENA_ID}",
                       json={"negotiation_mode": False})
        assert rr.status_code == 200, rr.text
