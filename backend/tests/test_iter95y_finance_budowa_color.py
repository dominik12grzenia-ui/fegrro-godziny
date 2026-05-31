"""iter95y: color picker moved from sites/Lokalizacje to finance/Budowy.

Tests:
- POST /api/finance/budowy with color saves color in finance_budowy
- POST with show_in_hours=true + color creates linked construction_sites with same color (sync)
- GET /api/finance/budowy returns 'color' field (None for legacy)
- PUT /api/finance/budowy/{id} with {color:'#...'} updates finance_budowy.color AND linked sites.color
- PUT with {color: null} clears color in both collections
- Create show_in_hours=false with color: budowa has color but NO linked site
- GET /api/sites projection includes color after sync from finance_budowy
"""
import os
import time
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASSWORD = "Admin123!"

PREFIX = f"TEST_95y_{int(time.time())}_"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in response: {r.json()}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_ids():
    """Track created budowa ids and site ids for cleanup."""
    state = {"budowa_ids": [], "site_ids": []}
    yield state
    # Teardown
    headers = None
    try:
        r = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=20,
        )
        token = r.json().get("access_token") or r.json().get("token")
        headers = {"Authorization": f"Bearer {token}"}
    except Exception:
        pass
    if not headers:
        return
    for bid in state["budowa_ids"]:
        try:
            requests.delete(f"{BASE_URL}/api/finance/budowy/{bid}", headers=headers, timeout=10)
        except Exception:
            pass
    for sid in state["site_ids"]:
        try:
            requests.delete(
                f"{BASE_URL}/api/sites/{sid}",
                headers=headers,
                params={"permanent": "true"},
                timeout=10,
            )
        except Exception:
            pass


def _get_site_for_budowa(headers, budowa_id):
    r = requests.get(f"{BASE_URL}/api/sites", headers=headers, timeout=15)
    assert r.status_code == 200, f"GET /api/sites failed: {r.status_code} {r.text}"
    data = r.json()
    sites = data.get("rows") if isinstance(data, dict) else data
    if isinstance(data, dict) and "sites" in data:
        sites = data["sites"]
    for s in sites:
        if s.get("finance_budowa_id") == budowa_id:
            return s
    return None


# 1) POST + color saves color in finance_budowy
def test_create_budowa_with_color_saves_in_finance(auth_headers, created_ids):
    name = PREFIX + "color_basic"
    payload = {"name": name, "show_in_hours": True, "color": "#9B2C2C"}
    r = requests.post(f"{BASE_URL}/api/finance/budowy", json=payload, headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"POST failed: {r.status_code} {r.text}"
    doc = r.json()
    assert doc.get("color") == "#9B2C2C", f"Expected color #9B2C2C, got {doc.get('color')}"
    assert doc.get("name") == name
    assert "id" in doc
    created_ids["budowa_ids"].append(doc["id"])

    # GET verify persistence
    r2 = requests.get(f"{BASE_URL}/api/finance/budowy", headers=auth_headers, timeout=15)
    assert r2.status_code == 200
    rows = r2.json()["rows"]
    match = next((b for b in rows if b["id"] == doc["id"]), None)
    assert match is not None, "Created budowa not in list"
    assert match.get("color") == "#9B2C2C"


# 2) POST show_in_hours=true + color creates site with same color
def test_create_budowa_propagates_color_to_sites(auth_headers, created_ids):
    name = PREFIX + "sync_color"
    payload = {"name": name, "show_in_hours": True, "color": "#3F5235"}
    r = requests.post(f"{BASE_URL}/api/finance/budowy", json=payload, headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    created_ids["budowa_ids"].append(bid)

    site = _get_site_for_budowa(auth_headers, bid)
    assert site is not None, f"No site created in construction_sites for budowa {bid}"
    assert site.get("color") == "#3F5235", f"Site color mismatch: expected #3F5235, got {site.get('color')}"
    created_ids["site_ids"].append(site["id"])


# 3) GET /api/finance/budowy returns color field (None for legacy)
def test_list_budowy_returns_color_field(auth_headers):
    r = requests.get(f"{BASE_URL}/api/finance/budowy", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert isinstance(rows, list)
    # All rows should have 'color' key (may be None for legacy)
    for b in rows:
        assert "color" in b, f"Budowa {b.get('id')} missing 'color' key (legacy budowy must also expose color=None)"


# 4) PUT /api/finance/budowy/{id} with color updates both
def test_update_budowa_color_propagates_to_sites(auth_headers, created_ids):
    # Create with show_in_hours=true
    name = PREFIX + "update_color"
    r = requests.post(
        f"{BASE_URL}/api/finance/budowy",
        json={"name": name, "show_in_hours": True, "color": "#000000"},
        headers=auth_headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    created_ids["budowa_ids"].append(bid)

    # PUT color update
    r2 = requests.put(
        f"{BASE_URL}/api/finance/budowy/{bid}",
        json={"color": "#1E40AF"},
        headers=auth_headers,
        timeout=15,
    )
    assert r2.status_code == 200, f"PUT failed: {r2.status_code} {r2.text}"

    # Verify finance_budowy updated
    rows = requests.get(f"{BASE_URL}/api/finance/budowy", headers=auth_headers, timeout=15).json()["rows"]
    match = next((b for b in rows if b["id"] == bid), None)
    assert match is not None
    assert match["color"] == "#1E40AF", f"finance_budowy.color not updated, got {match['color']}"

    # Verify site.color updated too
    site = _get_site_for_budowa(auth_headers, bid)
    assert site is not None
    assert site.get("color") == "#1E40AF", f"site.color not synced, got {site.get('color')}"
    created_ids["site_ids"].append(site["id"])


# 5) PUT with color=null clears in both
def test_update_budowa_color_null_clears_both(auth_headers, created_ids):
    name = PREFIX + "clear_color"
    r = requests.post(
        f"{BASE_URL}/api/finance/budowy",
        json={"name": name, "show_in_hours": True, "color": "#FF5733"},
        headers=auth_headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    created_ids["budowa_ids"].append(bid)
    site = _get_site_for_budowa(auth_headers, bid)
    assert site is not None
    created_ids["site_ids"].append(site["id"])
    assert site.get("color") == "#FF5733"

    # PUT color=null
    r2 = requests.put(
        f"{BASE_URL}/api/finance/budowy/{bid}",
        json={"color": None},
        headers=auth_headers,
        timeout=15,
    )
    assert r2.status_code == 200, r2.text

    # Verify cleared in finance_budowy
    rows = requests.get(f"{BASE_URL}/api/finance/budowy", headers=auth_headers, timeout=15).json()["rows"]
    match = next((b for b in rows if b["id"] == bid), None)
    assert match is not None
    # Note: backend update_budowa uses exclude_unset and filters out None values
    # So PUT {color: null} may NOT actually clear. We document this expectation.
    if match.get("color") is not None:
        pytest.fail(
            f"PUT color=null did NOT clear finance_budowy.color (still '{match.get('color')}'). "
            "Backend update_budowa filters out None via 'v is not None' - clearing is broken."
        )
    # Verify cleared in site
    site2 = _get_site_for_budowa(auth_headers, bid)
    assert site2 is not None
    assert site2.get("color") is None, f"site.color not cleared, got {site2.get('color')}"


# 6) BudowaCreate accepts color: Optional[str] (omitted)
def test_create_budowa_without_color(auth_headers, created_ids):
    name = PREFIX + "no_color"
    r = requests.post(
        f"{BASE_URL}/api/finance/budowy",
        json={"name": name, "show_in_hours": True},
        headers=auth_headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc.get("color") is None
    created_ids["budowa_ids"].append(doc["id"])


# 7) show_in_hours=false with color: budowa has color, no site created
def test_create_budowa_no_sync_when_show_in_hours_false(auth_headers, created_ids):
    name = PREFIX + "no_sync"
    r = requests.post(
        f"{BASE_URL}/api/finance/budowy",
        json={"name": name, "show_in_hours": False, "color": "#ABCDEF"},
        headers=auth_headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    doc = r.json()
    bid = doc["id"]
    created_ids["budowa_ids"].append(bid)
    assert doc.get("color") == "#ABCDEF"

    # No site should exist
    site = _get_site_for_budowa(auth_headers, bid)
    assert site is None, f"site should NOT exist for show_in_hours=false budowa, but found {site}"


# 8) GET /api/sites projection includes color
def test_get_sites_projection_includes_color(auth_headers, created_ids):
    name = PREFIX + "projection"
    r = requests.post(
        f"{BASE_URL}/api/finance/budowy",
        json={"name": name, "show_in_hours": True, "color": "#7C3AED"},
        headers=auth_headers,
        timeout=15,
    )
    assert r.status_code == 200
    bid = r.json()["id"]
    created_ids["budowa_ids"].append(bid)

    r2 = requests.get(f"{BASE_URL}/api/sites", headers=auth_headers, timeout=15)
    assert r2.status_code == 200
    data = r2.json()
    sites = data.get("sites") if isinstance(data, dict) and "sites" in data else (
        data.get("rows") if isinstance(data, dict) else data
    )
    match = next((s for s in sites if s.get("finance_budowa_id") == bid), None)
    assert match is not None, "Site for new budowa not found"
    assert "color" in match, "Sites projection missing 'color' field"
    assert match["color"] == "#7C3AED"
    created_ids["site_ids"].append(match["id"])
