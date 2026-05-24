"""iter86: Test backendu - dodanie wielu podpozycji tego samego rodzaju (R/M/S) jako skladowych."""
import os
import requests
import pytest
import uuid

API = os.environ.get("API_URL", "http://localhost:8001/api")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@fegrro.pl")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "Admin123!")


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_multiple_materials_subpositions(H):
    """Backend pozwala dodac wiele linii o type=materials, parent_id=slot.id."""
    suffix = uuid.uuid4().hex[:6]
    bid = requests.post(f"{API}/finance/budowy", json={"name": f"MULTI-SUB-{suffix}"}, headers=H).json()["id"]
    sid = requests.post(f"{API}/budget/stages", json={"budowa_id": bid, "name": "E1"}, headers=H).json()["id"]
    pid = requests.post(f"{API}/budget/positions", json={"budowa_id": bid, "stage_id": sid, "name": "Beton fund."}, headers=H).json()["id"]

    # 1. Slot M (kontener) - bez parent_id
    slot_m = requests.post(f"{API}/budget/lines", json={
        "budowa_id": bid, "category": "materials", "name": "slot-materials", "type": "materials",
        "stage_id": sid, "position_id": pid,
    }, headers=H).json()
    assert slot_m["parent_id"] is None
    # 2. Dodaj 3 skladowe pod slot_m
    names = ["Beton C8/10", "Beton C16/20", "Cement portlandzki"]
    children = []
    for n in names:
        c = requests.post(f"{API}/budget/lines", json={
            "budowa_id": bid, "category": "materials", "name": n, "type": "materials",
            "stage_id": sid, "position_id": pid, "parent_id": slot_m["id"],
            "quantity": 10, "unit_price_netto": 100,
        }, headers=H).json()
        assert c["parent_id"] == slot_m["id"]
        children.append(c)
    # 3. GET lines - sprawdz strukture
    lines = requests.get(f"{API}/budget/{bid}/lines", headers=H).json()["rows"]
    materials_top = [ln for ln in lines if ln["position_id"] == pid and ln["type"] == "materials" and not ln["parent_id"]]
    materials_children = [ln for ln in lines if ln["position_id"] == pid and ln["type"] == "materials" and ln["parent_id"] == slot_m["id"]]
    # Tylko 1 slot kontener
    assert len(materials_top) == 1
    # 3 skladowe
    assert len(materials_children) == 3
    assert set(c["name"] for c in materials_children) == set(names)

    # 4. GET options-flat - sprawdz ze widac wszystkie 3 skladowe
    opts = requests.get(f"{API}/budget/{bid}/options-flat", headers=H).json()["options"]
    sub_opts = [o for o in opts if o["level"] == "sub"]
    assert len(sub_opts) == 3
    codes = [o["code"] for o in sub_opts]
    assert "101.M.1" in codes
    assert "101.M.2" in codes
    assert "101.M.3" in codes

    # Cleanup
    requests.delete(f"{API}/budget/{bid}/wipe", headers=H)
    requests.delete(f"{API}/budget/stages/{sid}", headers=H)
    requests.delete(f"{API}/finance/budowy/{bid}", headers=H)
