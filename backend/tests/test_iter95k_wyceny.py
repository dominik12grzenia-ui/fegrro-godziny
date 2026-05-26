"""iter95k: Wyceny - standalone module."""
import os
import uuid
import time
import pytest
import requests

API = os.environ.get("API_URL", "http://localhost:8001/api")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@fegrro.pl")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "Admin123!")


@pytest.fixture(scope="module")
def H():
    for _ in range(3):
        r = requests.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        if r.status_code == 200:
            return {"Authorization": f"Bearer {r.json()['access_token']}"}
        time.sleep(2)
    r.raise_for_status()


def test_create_wycena_without_budowa(H):
    """Tworzenie wyceny NIE wymaga budowy."""
    suffix = uuid.uuid4().hex[:6]
    r = requests.post(f"{API}/wyceny", json={"name": f"Oferta {suffix}"}, headers=H)
    r.raise_for_status()
    w = r.json()
    assert w["name"].startswith("Oferta")
    assert "id" in w
    # Sprawdz ze jest na liscie
    rows = requests.get(f"{API}/wyceny", headers=H).json()["rows"]
    assert any(x["id"] == w["id"] for x in rows)
    # Cleanup
    requests.delete(f"{API}/wyceny/{w['id']}", headers=H)


def test_wycena_full_structure(H):
    """Etap -> Pozycja -> Slot (R/M/S) -> wartosc."""
    suffix = uuid.uuid4().hex[:6]
    w = requests.post(f"{API}/wyceny", json={"name": f"OFR {suffix}"}, headers=H).json()
    try:
        s = requests.post(f"{API}/wyceny/stages", json={"wycena_id": w["id"], "name": "Etap A", "order": 0}, headers=H).json()
        p = requests.post(f"{API}/wyceny/positions", json={"wycena_id": w["id"], "stage_id": s["id"], "name": "Pozycja 1", "order": 0}, headers=H).json()
        # 3 sloty
        lm = requests.post(f"{API}/wyceny/lines", json={
            "wycena_id": w["id"], "stage_id": s["id"], "position_id": p["id"],
            "type": "materials", "name": "Beton", "unit": "m3", "quantity": 10, "unit_price_netto": 350,
        }, headers=H).json()
        ll = requests.post(f"{API}/wyceny/lines", json={
            "wycena_id": w["id"], "stage_id": s["id"], "position_id": p["id"],
            "type": "labor", "name": "Robocizna", "unit": "h", "quantity": 20, "unit_price_netto": 50,
        }, headers=H).json()
        le = requests.post(f"{API}/wyceny/lines", json={
            "wycena_id": w["id"], "stage_id": s["id"], "position_id": p["id"],
            "type": "equipment", "name": "Dzwig", "unit": "h", "quantity": 5, "unit_price_netto": 200,
        }, headers=H).json()
        # Template
        tpl = requests.get(f"{API}/wyceny/{w['id']}/template", headers=H).json()
        assert tpl["wycena"]["name"].startswith("OFR")
        assert len(tpl["stages"]) == 1
        assert len(tpl["stages"][0]["positions"]) == 1
        assert len(tpl["stages"][0]["positions"][0]["slots"]) == 3
        # Suma w liscie wycen
        rows = requests.get(f"{API}/wyceny", headers=H).json()["rows"]
        my = next(x for x in rows if x["id"] == w["id"])
        # 10*350 + 20*50 + 5*200 = 3500 + 1000 + 1000 = 5500
        assert my["total_netto"] == 5500.0
    finally:
        requests.delete(f"{API}/wyceny/{w['id']}", headers=H)


def test_wycena_cascade_delete(H):
    """Delete wyceny usuwa stages/positions/lines."""
    suffix = uuid.uuid4().hex[:6]
    w = requests.post(f"{API}/wyceny", json={"name": f"DEL {suffix}"}, headers=H).json()
    s = requests.post(f"{API}/wyceny/stages", json={"wycena_id": w["id"], "name": "S1"}, headers=H).json()
    p = requests.post(f"{API}/wyceny/positions", json={"wycena_id": w["id"], "stage_id": s["id"], "name": "P1"}, headers=H).json()
    l = requests.post(f"{API}/wyceny/lines", json={
        "wycena_id": w["id"], "stage_id": s["id"], "position_id": p["id"],
        "type": "materials", "name": "X", "quantity": 1, "unit_price_netto": 10,
    }, headers=H).json()
    requests.delete(f"{API}/wyceny/{w['id']}", headers=H)
    # Template powinien zwrocic 404
    r = requests.get(f"{API}/wyceny/{w['id']}/template", headers=H)
    assert r.status_code == 404


def test_price_book_crud(H):
    """Cennik - CRUD per kategoria + search."""
    suffix = uuid.uuid4().hex[:6]
    # Stworz 3 kategorie
    items = []
    for cat, name in [("materials", f"Beton {suffix}"), ("labor", f"Stolarz {suffix}"), ("equipment", f"Wiertarka {suffix}")]:
        r = requests.post(f"{API}/wyceny/cennik", json={
            "category": cat, "name": name, "unit": "szt", "unit_price_netto": 100,
        }, headers=H)
        r.raise_for_status()
        items.append(r.json())
    try:
        # Filtr per kategoria
        for cat in ["materials", "labor", "equipment"]:
            rows = requests.get(f"{API}/wyceny/cennik", params={"category": cat}, headers=H).json()["rows"]
            assert any(suffix in x["name"] for x in rows)
        # Search
        rows = requests.get(f"{API}/wyceny/cennik", params={"category": "materials", "q": suffix}, headers=H).json()["rows"]
        assert len(rows) >= 1
        # Update
        r = requests.patch(f"{API}/wyceny/cennik/{items[0]['id']}",
                            json={"unit_price_netto": 250}, headers=H)
        r.raise_for_status()
        # Pobierz i sprawdz
        rows = requests.get(f"{API}/wyceny/cennik", params={"category": "materials"}, headers=H).json()["rows"]
        updated = next(x for x in rows if x["id"] == items[0]["id"])
        assert updated["unit_price_netto"] == 250
    finally:
        for it in items:
            requests.delete(f"{API}/wyceny/cennik/{it['id']}", headers=H)


def test_price_book_invalid_category(H):
    """Niepoprawna kategoria -> 400."""
    r = requests.post(f"{API}/wyceny/cennik", json={
        "category": "invalid", "name": "X", "unit_price_netto": 10,
    }, headers=H)
    assert r.status_code == 400
