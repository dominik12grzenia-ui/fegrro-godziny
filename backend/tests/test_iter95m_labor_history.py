"""iter95m: Labor price book - price_m2/price_m3 + auto-tracking historii zmian cen."""
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


def _get(H, item_id):
    rows = requests.get(f"{API}/wyceny/cennik", params={"category": "labor"}, headers=H).json()["rows"]
    return next((x for x in rows if x["id"] == item_id), None)


def test_create_labor_with_m2_m3(H):
    """Labor moze miec dwie ceny - m2 i m3."""
    suffix = uuid.uuid4().hex[:6]
    r = requests.post(f"{API}/wyceny/cennik", json={
        "category": "labor", "name": f"Tynkowanie {suffix}",
        "price_m2": 45.50, "price_m3": 120.00,
    }, headers=H)
    r.raise_for_status()
    item = r.json()
    try:
        assert item["price_m2"] == 45.50
        assert item["price_m3"] == 120.00
        assert item.get("price_history") == []
    finally:
        requests.delete(f"{API}/wyceny/cennik/{item['id']}", headers=H)


def test_price_changes_tracked_in_history(H):
    """Kazda zmiana price_m2/m3 dopisuje wpis do price_history."""
    suffix = uuid.uuid4().hex[:6]
    item = requests.post(f"{API}/wyceny/cennik", json={
        "category": "labor", "name": f"Malowanie {suffix}", "price_m2": 20.0, "price_m3": 50.0,
    }, headers=H).json()
    try:
        # Zmien m2 z 20 -> 25
        requests.patch(f"{API}/wyceny/cennik/{item['id']}", json={"price_m2": 25.0}, headers=H).raise_for_status()
        # Zmien m3 z 50 -> 60
        requests.patch(f"{API}/wyceny/cennik/{item['id']}", json={"price_m3": 60.0}, headers=H).raise_for_status()
        # Zmien m2 ponownie z 25 -> 30
        requests.patch(f"{API}/wyceny/cennik/{item['id']}", json={"price_m2": 30.0}, headers=H).raise_for_status()
        # Sprawdz historie
        cur = _get(H, item["id"])
        hist = cur["price_history"]
        assert len(hist) == 3, f"oczekiwano 3 wpisow, jest {len(hist)}"
        assert hist[0]["field"] == "price_m2" and hist[0]["old"] == 20.0 and hist[0]["new"] == 25.0
        assert hist[1]["field"] == "price_m3" and hist[1]["old"] == 50.0 and hist[1]["new"] == 60.0
        assert hist[2]["field"] == "price_m2" and hist[2]["old"] == 25.0 and hist[2]["new"] == 30.0
        # Aktualne wartosci
        assert cur["price_m2"] == 30.0
        assert cur["price_m3"] == 60.0
    finally:
        requests.delete(f"{API}/wyceny/cennik/{item['id']}", headers=H)


def test_same_value_no_history_entry(H):
    """Zapis tej samej ceny nie tworzy wpisu historii."""
    suffix = uuid.uuid4().hex[:6]
    item = requests.post(f"{API}/wyceny/cennik", json={
        "category": "labor", "name": f"Wyrownanie {suffix}", "price_m2": 15.0,
    }, headers=H).json()
    try:
        # Zapis tej samej wartosci
        requests.patch(f"{API}/wyceny/cennik/{item['id']}", json={"price_m2": 15.0}, headers=H).raise_for_status()
        cur = _get(H, item["id"])
        assert cur["price_history"] == []
    finally:
        requests.delete(f"{API}/wyceny/cennik/{item['id']}", headers=H)


def test_materials_no_history_tracking(H):
    """Material NIE ma trackingu historii (tylko labor)."""
    suffix = uuid.uuid4().hex[:6]
    item = requests.post(f"{API}/wyceny/cennik", json={
        "category": "materials", "name": f"Beton {suffix}", "unit_price_netto": 100,
    }, headers=H).json()
    try:
        requests.patch(f"{API}/wyceny/cennik/{item['id']}", json={"unit_price_netto": 200}, headers=H).raise_for_status()
        rows = requests.get(f"{API}/wyceny/cennik", params={"category": "materials"}, headers=H).json()["rows"]
        cur = next(x for x in rows if x["id"] == item["id"])
        # price_history nie wzbogacane (pozostaje puste)
        assert cur.get("price_history") in (None, [])
    finally:
        requests.delete(f"{API}/wyceny/cennik/{item['id']}", headers=H)
