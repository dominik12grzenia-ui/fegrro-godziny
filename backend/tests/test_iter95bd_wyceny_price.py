"""iter95bd: Test backend wyceny - price_min/max, history, rounding.

Pokrywa:
- PATCH /api/wyceny/lines/{id} z price_min/price_max (clearable=None)
- price_change_history zapis przy zmianie unit_price_netto
- below_min flag w historii
- /template endpoint zwraca price_change_history
- /preview endpoint zwraca cena zaokraglona (Math.round)
- Smoke: list/create/update wyceny/stages/positions/lines/scope-templates
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


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


@pytest.fixture(scope="module")
def api(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def wycena_ctx(api):
    """Create wycena + stage + position + line. Yield ids. Cleanup after."""
    name = f"TEST_iter95bd_{int(time.time())}"
    r = api.post(f"{BASE_URL}/api/wyceny", json={"name": name})
    assert r.status_code == 200, r.text
    w = r.json()
    wycena_id = w["id"]

    r = api.post(f"{BASE_URL}/api/wyceny/stages",
                 json={"wycena_id": wycena_id, "name": "Etap 1", "order": 0})
    assert r.status_code == 200, r.text
    stage_id = r.json()["id"]

    r = api.post(f"{BASE_URL}/api/wyceny/positions",
                 json={"wycena_id": wycena_id, "stage_id": stage_id,
                       "name": "Pozycja Test", "order": 0, "quantity": 10, "unit": "m²"})
    assert r.status_code == 200, r.text
    position_id = r.json()["id"]

    r = api.post(f"{BASE_URL}/api/wyceny/lines",
                 json={"wycena_id": wycena_id, "stage_id": stage_id,
                       "position_id": position_id, "type": "materials",
                       "name": "Sub Test", "quantity": 5, "unit_price_netto": 150,
                       "order": 0})
    assert r.status_code == 200, r.text
    line_id = r.json()["id"]

    yield {"wycena_id": wycena_id, "stage_id": stage_id,
           "position_id": position_id, "line_id": line_id}

    api.delete(f"{BASE_URL}/api/wyceny/{wycena_id}")


# ---------- price_min/price_max set & clearable ----------
class TestPriceMinMax:
    def test_set_price_min_max(self, api, wycena_ctx):
        lid = wycena_ctx["line_id"]
        r = api.patch(f"{BASE_URL}/api/wyceny/lines/{lid}",
                      json={"price_min": 100, "price_max": 300})
        assert r.status_code == 200, r.text

        # verify via template
        tpl = api.get(f"{BASE_URL}/api/wyceny/{wycena_ctx['wycena_id']}/template").json()
        sub = self._find_sub(tpl, lid)
        assert sub is not None, "sub line not found in template"
        assert sub.get("price_min") == 100
        assert sub.get("price_max") == 300

    def test_clear_price_min_with_null(self, api, wycena_ctx):
        lid = wycena_ctx["line_id"]
        r = api.patch(f"{BASE_URL}/api/wyceny/lines/{lid}",
                      json={"price_min": None})
        assert r.status_code == 200, r.text

        tpl = api.get(f"{BASE_URL}/api/wyceny/{wycena_ctx['wycena_id']}/template").json()
        sub = self._find_sub(tpl, lid)
        assert sub.get("price_min") is None, f"expected None, got {sub.get('price_min')}"
        # max should still be 300
        assert sub.get("price_max") == 300

    def test_reset_price_min_for_history_tests(self, api, wycena_ctx):
        # reset min to 100 for next tests
        lid = wycena_ctx["line_id"]
        r = api.patch(f"{BASE_URL}/api/wyceny/lines/{lid}",
                      json={"price_min": 100})
        assert r.status_code == 200

    @staticmethod
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


# ---------- price_change_history ----------
class TestPriceChangeHistory:
    def test_first_price_change_records_history(self, api, wycena_ctx):
        lid = wycena_ctx["line_id"]
        # current price is 150, min=100 (set above)
        r = api.patch(f"{BASE_URL}/api/wyceny/lines/{lid}",
                      json={"unit_price_netto": 200})
        assert r.status_code == 200

        sub = TestPriceMinMax._find_sub(
            api.get(f"{BASE_URL}/api/wyceny/{wycena_ctx['wycena_id']}/template").json(),
            lid,
        )
        hist = sub.get("price_change_history", [])
        assert len(hist) >= 1, f"history empty: {hist}"
        h = hist[-1]
        assert h["from_price"] == 150.0
        assert h["to_price"] == 200.0
        assert h["min_price"] == 100.0
        assert h["below_min"] is False
        assert h.get("user_email") == ADMIN_EMAIL or h.get("user_id")
        assert "ts" in h

    def test_below_min_change_flags_below_min(self, api, wycena_ctx):
        lid = wycena_ctx["line_id"]
        # change to 80 - below min 100
        r = api.patch(f"{BASE_URL}/api/wyceny/lines/{lid}",
                      json={"unit_price_netto": 80})
        assert r.status_code == 200

        sub = TestPriceMinMax._find_sub(
            api.get(f"{BASE_URL}/api/wyceny/{wycena_ctx['wycena_id']}/template").json(),
            lid,
        )
        hist = sub.get("price_change_history", [])
        assert len(hist) >= 2
        h = hist[-1]
        assert h["from_price"] == 200.0
        assert h["to_price"] == 80.0
        assert h["min_price"] == 100.0
        assert h["below_min"] is True, f"below_min should be true: {h}"

    def test_history_grows_on_each_change(self, api, wycena_ctx):
        lid = wycena_ctx["line_id"]
        sub_before = TestPriceMinMax._find_sub(
            api.get(f"{BASE_URL}/api/wyceny/{wycena_ctx['wycena_id']}/template").json(),
            lid,
        )
        n_before = len(sub_before.get("price_change_history", []))

        # do 3 more changes
        for new_p in (120, 90, 250):
            r = api.patch(f"{BASE_URL}/api/wyceny/lines/{lid}",
                          json={"unit_price_netto": new_p})
            assert r.status_code == 200

        sub_after = TestPriceMinMax._find_sub(
            api.get(f"{BASE_URL}/api/wyceny/{wycena_ctx['wycena_id']}/template").json(),
            lid,
        )
        n_after = len(sub_after.get("price_change_history", []))
        assert n_after == n_before + 3, f"expected +3 entries, got {n_after - n_before}"

        hist = sub_after.get("price_change_history", [])
        # last entry: 90 -> 250 (above min, below_min=false)
        assert hist[-1]["from_price"] == 90.0
        assert hist[-1]["to_price"] == 250.0
        assert hist[-1]["below_min"] is False
        # 2nd-to-last: 120 -> 90 (below min)
        assert hist[-2]["from_price"] == 120.0
        assert hist[-2]["to_price"] == 90.0
        assert hist[-2]["below_min"] is True


# ---------- backend cena rounding (via _build_wycena_export) ----------
class TestCenaRounding:
    def test_build_wycena_export_returns_rounded_cena(self, wycena_ctx):
        """Verify _build_wycena_export rounds cena_pos (cena=round, cena_unrounded=raw)."""
        import asyncio
        import sys
        sys.path.insert(0, "/app/backend")
        from routes.wyceny import _build_wycena_export

        data = asyncio.run(_build_wycena_export(wycena_ctx["wycena_id"]))
        found_with_cena = False
        for st in data.get("stages", []):
            for ep in st.get("positions", []):
                cena = ep.get("cena")
                cena_unrounded = ep.get("cena_unrounded")
                if cena_unrounded and cena_unrounded > 0:
                    found_with_cena = True
                    assert isinstance(cena, int) or cena == int(cena), \
                        f"cena {cena} not int-rounded"
                    assert cena == round(cena_unrounded), \
                        f"cena {cena} != round({cena_unrounded})"
        assert found_with_cena, "no position with cena_unrounded>0 found"


# ---------- Smoke: regression for other wyceny endpoints ----------
class TestSmoke:
    def test_list_wyceny(self, api):
        r = api.get(f"{BASE_URL}/api/wyceny")
        assert r.status_code == 200
        data = r.json()
        # API returns {"rows": [...]}
        rows = data.get("rows") if isinstance(data, dict) else data
        assert isinstance(rows, list)

    def test_scope_templates_get(self, api):
        r = api.get(f"{BASE_URL}/api/wyceny/scope-templates")
        assert r.status_code == 200
        assert "templates" in r.json()

    def test_create_update_position(self, api, wycena_ctx):
        # update position name
        r = api.patch(f"{BASE_URL}/api/wyceny/positions/{wycena_ctx['position_id']}",
                      json={"name": "Updated Pos"})
        assert r.status_code == 200

    def test_update_stage(self, api, wycena_ctx):
        r = api.patch(f"{BASE_URL}/api/wyceny/stages/{wycena_ctx['stage_id']}",
                      json={"wycena_id": wycena_ctx["wycena_id"], "name": "Etap Renamed", "order": 0})
        assert r.status_code == 200

    def test_export_xlsx(self, api, wycena_ctx):
        # ensure xlsx export works (uses _generate_wycena_xlsx_bytes with rounded cena)
        r = api.get(f"{BASE_URL}/api/wyceny/{wycena_ctx['wycena_id']}/export.xlsx",
                    params={"detail": "positions"})
        assert r.status_code == 200
        assert len(r.content) > 1000
        assert r.headers.get("content-type", "").startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml"
        )
