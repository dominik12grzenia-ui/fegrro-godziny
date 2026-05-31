"""
iter95x backend tests:
- Wyceny scope-templates (GET/PUT + admin-only + default deduplication + auto UUID)
- Sites color field (GET/POST/PUT + null clear)
- 403 for non-admin (foreman)
"""
import os
import pytest
import requests

def _load_backend_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val.rstrip("/")
    # fallback: read /app/frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASS = "Admin123!"
FOREMAN_EMAIL = "Roman Chufrida"
FOREMAN_PASS = "Test1234!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def foreman_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/foreman/login",
        json={"email": FOREMAN_EMAIL, "password": FOREMAN_PASS},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"foreman login failed: {r.status_code} {r.text}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def foreman_h(foreman_token):
    return {"Authorization": f"Bearer {foreman_token}"}


# ============ SCOPE TEMPLATES ============

class TestScopeTemplates:
    def test_get_initial(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/wyceny/scope-templates", headers=admin_h, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "templates" in data
        assert isinstance(data["templates"], list)

    def test_put_save_and_uuid_assigned(self, admin_h):
        payload = {
            "templates": [
                {"name": "TEST_Dom", "scope_includes": "a\nb", "scope_excludes": "c", "is_default": True},
                {"name": "TEST_Komercja", "scope_includes": "x", "scope_excludes": "y", "is_default": False},
            ]
        }
        r = requests.put(
            f"{BASE_URL}/api/wyceny/scope-templates", json=payload, headers=admin_h, timeout=10
        )
        assert r.status_code == 200, r.text
        out = r.json()["templates"]
        assert len(out) == 2
        # Both should have id (UUID assigned)
        for t in out:
            assert t.get("id"), f"missing id: {t}"
            assert len(t["id"]) >= 16
        # Verify by GET
        r2 = requests.get(f"{BASE_URL}/api/wyceny/scope-templates", headers=admin_h, timeout=10)
        assert r2.status_code == 200
        got = r2.json()["templates"]
        assert len(got) == 2
        names = {t["name"] for t in got}
        assert "TEST_Dom" in names and "TEST_Komercja" in names
        dom = next(t for t in got if t["name"] == "TEST_Dom")
        assert dom["scope_includes"] == "a\nb"
        assert dom["scope_excludes"] == "c"
        assert dom["is_default"] is True

    def test_put_deduplicates_default(self, admin_h):
        # Two with is_default=True -> only first stays True
        payload = {
            "templates": [
                {"name": "TEST_A", "scope_includes": "1", "scope_excludes": "", "is_default": True},
                {"name": "TEST_B", "scope_includes": "2", "scope_excludes": "", "is_default": True},
                {"name": "TEST_C", "scope_includes": "3", "scope_excludes": "", "is_default": True},
            ]
        }
        r = requests.put(
            f"{BASE_URL}/api/wyceny/scope-templates", json=payload, headers=admin_h, timeout=10
        )
        assert r.status_code == 200
        out = r.json()["templates"]
        defaults = [t for t in out if t["is_default"]]
        assert len(defaults) == 1, f"expected exactly 1 default, got {len(defaults)}"
        assert defaults[0]["name"] == "TEST_A"

    def test_put_preserves_existing_id(self, admin_h):
        # Save then re-save with existing IDs and verify they're preserved
        payload = {
            "templates": [
                {"name": "TEST_Persist", "scope_includes": "x", "scope_excludes": "y", "is_default": False},
            ]
        }
        r = requests.put(
            f"{BASE_URL}/api/wyceny/scope-templates", json=payload, headers=admin_h, timeout=10
        )
        assert r.status_code == 200
        original_id = r.json()["templates"][0]["id"]
        # PUT again with id
        payload2 = {
            "templates": [
                {"id": original_id, "name": "TEST_Persist2", "scope_includes": "x2", "scope_excludes": "", "is_default": False},
            ]
        }
        r2 = requests.put(
            f"{BASE_URL}/api/wyceny/scope-templates", json=payload2, headers=admin_h, timeout=10
        )
        assert r2.status_code == 200
        assert r2.json()["templates"][0]["id"] == original_id
        assert r2.json()["templates"][0]["name"] == "TEST_Persist2"

    def test_foreman_get_forbidden(self, foreman_h):
        r = requests.get(f"{BASE_URL}/api/wyceny/scope-templates", headers=foreman_h, timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_foreman_put_forbidden(self, foreman_h):
        r = requests.put(
            f"{BASE_URL}/api/wyceny/scope-templates",
            json={"templates": []},
            headers=foreman_h,
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_cleanup_templates(self, admin_h):
        # cleanup - reset to empty list
        r = requests.put(
            f"{BASE_URL}/api/wyceny/scope-templates",
            json={"templates": []},
            headers=admin_h,
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["templates"] == []


# ============ SITES COLOR ============

class TestSitesColor:
    site_id = None

    def test_create_site_with_color(self, admin_h):
        payload = {
            "name": "TEST_iter95x_color_site",
            "category": "biuro",  # avoid auto-creating finance_budowy entanglement
            "color": "#9B2C2C",
        }
        r = requests.post(f"{BASE_URL}/api/sites", json=payload, headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["color"] == "#9B2C2C"
        assert "id" in data
        TestSitesColor.site_id = data["id"]

    def test_get_sites_returns_color(self, admin_h):
        assert TestSitesColor.site_id, "create test must run first"
        r = requests.get(f"{BASE_URL}/api/sites", headers=admin_h, timeout=10)
        assert r.status_code == 200
        sites = r.json()
        match = [s for s in sites if s["id"] == TestSitesColor.site_id]
        assert len(match) == 1
        assert match[0]["color"] == "#9B2C2C"
        # 'color' key must exist on every site (default None for legacy)
        for s in sites:
            assert "color" in s, f"site {s.get('id')} missing 'color' key"

    def test_update_color_hex(self, admin_h):
        assert TestSitesColor.site_id
        r = requests.put(
            f"{BASE_URL}/api/sites/{TestSitesColor.site_id}",
            json={"color": "#3F5235"},
            headers=admin_h,
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json()["color"] == "#3F5235"
        # Verify persistence
        r2 = requests.get(f"{BASE_URL}/api/sites", headers=admin_h, timeout=10)
        site = next((s for s in r2.json() if s["id"] == TestSitesColor.site_id), None)
        assert site is not None
        assert site["color"] == "#3F5235"

    def test_update_color_null_clears(self, admin_h):
        """Per spec: PUT z color=null powinien wyczyscic kolor."""
        assert TestSitesColor.site_id
        r = requests.put(
            f"{BASE_URL}/api/sites/{TestSitesColor.site_id}",
            json={"color": None, "name": "TEST_iter95x_color_site"},  # include name so update_data not empty
            headers=admin_h,
            timeout=10,
        )
        assert r.status_code == 200, r.text
        # Re-fetch
        r2 = requests.get(f"{BASE_URL}/api/sites", headers=admin_h, timeout=10)
        site = next((s for s in r2.json() if s["id"] == TestSitesColor.site_id), None)
        assert site is not None
        assert site["color"] is None, f"expected color cleared to None, got {site['color']!r}"

    def test_foreman_post_site_forbidden(self, foreman_h):
        r = requests.post(
            f"{BASE_URL}/api/sites",
            json={"name": "TEST_foreman_blocked", "color": "#000000"},
            headers=foreman_h,
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_foreman_put_site_forbidden(self, foreman_h):
        if not TestSitesColor.site_id:
            pytest.skip("no site to test")
        r = requests.put(
            f"{BASE_URL}/api/sites/{TestSitesColor.site_id}",
            json={"color": "#123456"},
            headers=foreman_h,
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_cleanup_site(self, admin_h):
        if not TestSitesColor.site_id:
            pytest.skip("nothing to cleanup")
        r = requests.delete(
            f"{BASE_URL}/api/sites/{TestSitesColor.site_id}?permanent=true",
            headers=admin_h,
            timeout=10,
        )
        assert r.status_code == 200
