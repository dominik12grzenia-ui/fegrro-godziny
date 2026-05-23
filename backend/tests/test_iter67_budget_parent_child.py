"""
Test iter 67 - Budget parent_id (skladowe kosztowe).
- Pozycja z parent_id musi sie dolaczyc do nadrzednej tego samego typu i budowy.
- Walidacja: brak parent, inna budowa, parent juz jest skladowa (max 2 poziomy), inny typ.
- Kaskadowe usuwanie: usuniecie rodzica usuwa dzieci.
"""
import os
import asyncio
import requests
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001") + "/api"
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASS = "Admin123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def budowa_id(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{API}/finance/budowy", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    rows = data["rows"] if isinstance(data, dict) and "rows" in data else data
    assert len(rows) > 0, "Brak budow do testu"
    return rows[0]["id"]


def _create_line(token, budowa_id, **kwargs):
    h = {"Authorization": f"Bearer {token}"}
    payload = {
        "budowa_id": budowa_id,
        "category": kwargs.pop("category", "TEST_ITER67"),
        "name": kwargs.pop("name", "Test glowna"),
        "type": kwargs.pop("type", "materials"),
        "quantity": kwargs.pop("quantity", 1.0),
        "unit_price_netto": kwargs.pop("unit_price_netto", 100.0),
    }
    payload.update(kwargs)
    r = requests.post(f"{API}/budget/lines", json=payload, headers=h)
    return r


def test_create_parent_then_child(admin_token, budowa_id):
    parent_r = _create_line(admin_token, budowa_id, name="ITER67 Beton C8/10 chudziak", type="materials")
    assert parent_r.status_code == 200, parent_r.text
    parent = parent_r.json()
    assert parent.get("parent_id") is None

    child_r = _create_line(
        admin_token, budowa_id,
        name="ITER67 Cement", type="materials", parent_id=parent["id"], unit_price_netto=50.0
    )
    assert child_r.status_code == 200, child_r.text
    child = child_r.json()
    assert child["parent_id"] == parent["id"]

    # Wyczysc
    h = {"Authorization": f"Bearer {admin_token}"}
    res = requests.delete(f"{API}/budget/lines/{parent['id']}", headers=h)
    assert res.status_code == 200
    # Sprawdz, ze dziecko tez znikla (cascade)
    lines_resp = requests.get(f"{API}/budget/{budowa_id}/lines", headers=h).json()
    lines = lines_resp["rows"] if isinstance(lines_resp, dict) and "rows" in lines_resp else lines_resp
    assert all(line["id"] != child["id"] for line in lines), "Dziecko nie zostalo usuniete kaskadowo"


def test_reject_nonexistent_parent(admin_token, budowa_id):
    r = _create_line(admin_token, budowa_id, parent_id="non-existent-uuid-zzzz")
    assert r.status_code == 404


def test_reject_grandchild(admin_token, budowa_id):
    parent_r = _create_line(admin_token, budowa_id, name="ITER67 GP", type="labor")
    parent = parent_r.json()
    child_r = _create_line(admin_token, budowa_id, name="ITER67 Child", type="labor", parent_id=parent["id"])
    child = child_r.json()
    grand_r = _create_line(admin_token, budowa_id, name="ITER67 Grand", type="labor", parent_id=child["id"])
    assert grand_r.status_code == 400
    # Cleanup
    h = {"Authorization": f"Bearer {admin_token}"}
    requests.delete(f"{API}/budget/lines/{parent['id']}", headers=h)


def test_reject_different_type(admin_token, budowa_id):
    parent_r = _create_line(admin_token, budowa_id, name="ITER67 ParentM", type="materials")
    parent = parent_r.json()
    bad_r = _create_line(admin_token, budowa_id, name="ITER67 WrongType", type="labor", parent_id=parent["id"])
    assert bad_r.status_code == 400, bad_r.text
    # Cleanup
    h = {"Authorization": f"Bearer {admin_token}"}
    requests.delete(f"{API}/budget/lines/{parent['id']}", headers=h)


def test_lines_endpoint_returns_parent_id_field(admin_token, budowa_id):
    parent_r = _create_line(admin_token, budowa_id, name="ITER67 PF", type="equipment")
    parent = parent_r.json()
    child_r = _create_line(admin_token, budowa_id, name="ITER67 PF Child", type="equipment", parent_id=parent["id"])
    child = child_r.json()

    h = {"Authorization": f"Bearer {admin_token}"}
    lines_resp = requests.get(f"{API}/budget/{budowa_id}/lines", headers=h).json()
    lines = lines_resp["rows"] if isinstance(lines_resp, dict) and "rows" in lines_resp else lines_resp
    found_child = next((line for line in lines if line["id"] == child["id"]), None)
    assert found_child is not None
    assert found_child.get("parent_id") == parent["id"]
    # Cleanup
    requests.delete(f"{API}/budget/lines/{parent['id']}", headers=h)
