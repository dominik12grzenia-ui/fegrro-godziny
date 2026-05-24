"""
Test iter 68 - BudgetPosition (pozycja kosztorysowa) + auto-sloty R/M/S.
"""
import os
import requests
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001") + "/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/admin/login", json={"email": "admin@fegrro.pl", "password": "Admin123!"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def context(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    budowy = requests.get(f"{API}/finance/budowy", headers=h).json()["rows"]
    budowa_id = budowy[0]["id"]
    stages = requests.get(f"{API}/budget/{budowa_id}/stages", headers=h).json()["rows"]
    if not stages:
        # Utworz etap testowy
        r = requests.post(f"{API}/budget/stages", json={"budowa_id": budowa_id, "name": "ITER68 ETAP"}, headers=h)
        stage_id = r.json()["id"]
    else:
        stage_id = stages[0]["id"]
    return {"budowa_id": budowa_id, "stage_id": stage_id, "token": admin_token}


def test_position_creates_3_slots(context):
    h = {"Authorization": f"Bearer {context['token']}"}
    r = requests.post(f"{API}/budget/positions", json={
        "budowa_id": context["budowa_id"],
        "stage_id": context["stage_id"],
        "name": "ITER68 Wykonanie chodnika",
    }, headers=h)
    assert r.status_code == 200, r.text
    pos = r.json()
    assert pos["name"] == "ITER68 Wykonanie chodnika"
    assert pos["stage_id"] == context["stage_id"]
    slots = pos["slots"]
    assert len(slots) == 3
    types = sorted(s["type"] for s in slots)
    assert types == ["equipment", "labor", "materials"]
    for s in slots:
        assert s["position_id"] == pos["id"]
        assert s["parent_id"] is None
        assert s["quantity"] == 0.0
        assert s["unit_price_netto"] == 0.0

    # Cleanup
    d = requests.delete(f"{API}/budget/positions/{pos['id']}", headers=h)
    assert d.status_code == 200
    assert d.json()["deleted_lines"] == 3


def test_position_requires_stage(context):
    h = {"Authorization": f"Bearer {context['token']}"}
    r = requests.post(f"{API}/budget/positions", json={
        "budowa_id": context["budowa_id"],
        "stage_id": "non-existent-stage",
        "name": "ITER68 should fail",
    }, headers=h)
    assert r.status_code == 400


def test_skladowa_inherits_position_id(context):
    h = {"Authorization": f"Bearer {context['token']}"}
    r = requests.post(f"{API}/budget/positions", json={
        "budowa_id": context["budowa_id"],
        "stage_id": context["stage_id"],
        "name": "ITER68 Position with skladowa",
    }, headers=h)
    pos = r.json()
    pos_id = pos["id"]
    labor_slot = next(s for s in pos["slots"] if s["type"] == "labor")

    # Dodaj skladowa do slotu Robocizna BEZ podawania position_id
    child_r = requests.post(f"{API}/budget/lines", json={
        "budowa_id": context["budowa_id"],
        "category": "ITER68",
        "name": "ITER68 Wykop pod chodnik",
        "type": "labor",
        "parent_id": labor_slot["id"],
        "quantity": 10,
        "unit_price_netto": 50,
    }, headers=h)
    assert child_r.status_code == 200, child_r.text
    child = child_r.json()
    # position_id i stage_id powinny byc odziedziczone z rodzica (slotu)
    assert child["position_id"] == pos_id
    assert child["stage_id"] == context["stage_id"]
    assert child["parent_id"] == labor_slot["id"]

    # Cascade delete pozycji powinno usunac slot + skladowa
    d = requests.delete(f"{API}/budget/positions/{pos_id}", headers=h)
    assert d.status_code == 200
    assert d.json()["deleted_lines"] == 4  # 3 sloty + 1 skladowa


def test_position_patch_syncs_slot_name(context):
    h = {"Authorization": f"Bearer {context['token']}"}
    r = requests.post(f"{API}/budget/positions", json={
        "budowa_id": context["budowa_id"],
        "stage_id": context["stage_id"],
        "name": "ITER68 Original",
    }, headers=h)
    pos = r.json()
    pos_id = pos["id"]
    # Zmien nazwe
    pr = requests.patch(f"{API}/budget/positions/{pos_id}", json={"name": "ITER68 Updated"}, headers=h)
    assert pr.status_code == 200
    # Slot powinien miec zaktualizowana nazwe
    lines = requests.get(f"{API}/budget/{context['budowa_id']}/lines", headers=h).json()["rows"]
    slots = [line for line in lines if line.get("position_id") == pos_id and not line.get("parent_id")]
    assert len(slots) == 3
    for s in slots:
        assert s["name"] == "ITER68 Updated"
    requests.delete(f"{API}/budget/positions/{pos_id}", headers=h)
