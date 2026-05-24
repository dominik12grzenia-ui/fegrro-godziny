"""
Test iter 72 - Protokol operuje na BudgetPosition (nie na liniach).
- include_in_protocol filtruje pozycje
- progress per position_id
- plan_netto pozycji = suma plan z podpozycji + skladowych
"""
import os
import requests
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001") + "/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/admin/login", json={"email": "admin@fegrro.pl", "password": "Admin123!"})
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def context(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    budowy = requests.get(f"{API}/finance/budowy", headers=h).json()["rows"]
    budowa_id = budowy[0]["id"]
    # Utworz testowy etap
    stage_resp = requests.post(f"{API}/budget/stages", json={"budowa_id": budowa_id, "name": "ITER72 ETAP"}, headers=h)
    stage_id = stage_resp.json()["id"]
    return {"budowa_id": budowa_id, "stage_id": stage_id, "token": admin_token}


def _create_position(ctx, name, include=True):
    h = {"Authorization": f"Bearer {ctx['token']}"}
    return requests.post(f"{API}/budget/positions", json={
        "budowa_id": ctx["budowa_id"],
        "stage_id": ctx["stage_id"],
        "name": name,
        "include_in_protocol": include,
    }, headers=h)


def _add_subposition(ctx, position_id, type_, qty, price):
    h = {"Authorization": f"Bearer {ctx['token']}"}
    return requests.post(f"{API}/budget/lines", json={
        "budowa_id": ctx["budowa_id"],
        "category": "TEST",
        "name": "Sub",
        "type": type_,
        "position_id": position_id,
        "stage_id": ctx["stage_id"],
        "quantity": qty,
        "unit_price_netto": price,
    }, headers=h)


def test_include_in_protocol_field_default_true(context):
    r = _create_position(context, "ITER72 included")
    assert r.status_code == 200
    pos = r.json()
    assert pos["include_in_protocol"] is True
    h = {"Authorization": f"Bearer {context['token']}"}
    requests.delete(f"{API}/budget/positions/{pos['id']}", headers=h)


def test_include_in_protocol_false_excluded_from_view(context):
    h = {"Authorization": f"Bearer {context['token']}"}
    p_in = _create_position(context, "ITER72 IN").json()
    p_out = _create_position(context, "ITER72 OUT", include=False).json()
    _add_subposition(context, p_in["id"], "labor", 10, 100)
    _add_subposition(context, p_out["id"], "labor", 5, 50)

    view = requests.get(f"{API}/budget/{context['budowa_id']}/protokol-view/2026/5", headers=h).json()
    names = [row.get("name") for row in view["rows"] if row.get("type") == "line"]
    assert "ITER72 IN" in names
    assert "ITER72 OUT" not in names

    requests.delete(f"{API}/budget/positions/{p_in['id']}", headers=h)
    requests.delete(f"{API}/budget/positions/{p_out['id']}", headers=h)


def test_position_plan_netto_aggregates_sublines(context):
    h = {"Authorization": f"Bearer {context['token']}"}
    pos = _create_position(context, "ITER72 plan agg").json()
    _add_subposition(context, pos["id"], "labor", 10, 100)  # 1000
    _add_subposition(context, pos["id"], "materials", 2, 250)  # 500

    view = requests.get(f"{API}/budget/{context['budowa_id']}/protokol-view/2026/5", headers=h).json()
    line_row = next((row for row in view["rows"] if row.get("id") == pos["id"]), None)
    assert line_row is not None
    assert line_row["plan_netto"] == 1500.0

    requests.delete(f"{API}/budget/positions/{pos['id']}", headers=h)


def test_progress_via_position_endpoint(context):
    h = {"Authorization": f"Bearer {context['token']}"}
    pos = _create_position(context, "ITER72 progress").json()
    _add_subposition(context, pos["id"], "labor", 10, 100)  # plan=1000

    # Wpisz 30% na 2026/5
    pr = requests.post(f"{API}/budget/positions/{pos['id']}/progress",
                      json={"year": 2026, "month": 5, "progress_pct": 30}, headers=h)
    assert pr.status_code == 200, pr.text
    assert pr.json()["progress_pct"] == 30
    assert pr.json()["value_netto"] == 300.0  # 1000 * 30%

    # Sprawdz w widoku
    view = requests.get(f"{API}/budget/{context['budowa_id']}/protokol-view/2026/5", headers=h).json()
    line_row = next((row for row in view["rows"] if row.get("id") == pos["id"]), None)
    assert line_row["miesiac_pct"] == 30
    assert line_row["miesiac_val"] == 300.0

    # Walidacja >100%
    bad = requests.post(f"{API}/budget/positions/{pos['id']}/progress",
                       json={"year": 2026, "month": 6, "progress_pct": 80}, headers=h)
    assert bad.status_code == 400  # 30 + 80 = 110 > 100

    requests.delete(f"{API}/budget/positions/{pos['id']}", headers=h)


def test_patch_include_in_protocol(context):
    h = {"Authorization": f"Bearer {context['token']}"}
    pos = _create_position(context, "ITER72 patch", include=True).json()
    _add_subposition(context, pos["id"], "labor", 1, 100)

    # Zmien na False
    requests.patch(f"{API}/budget/positions/{pos['id']}", json={"include_in_protocol": False}, headers=h)
    view = requests.get(f"{API}/budget/{context['budowa_id']}/protokol-view/2026/5", headers=h).json()
    names = [row.get("name") for row in view["rows"] if row.get("type") == "line"]
    assert "ITER72 patch" not in names

    requests.delete(f"{API}/budget/positions/{pos['id']}", headers=h)
