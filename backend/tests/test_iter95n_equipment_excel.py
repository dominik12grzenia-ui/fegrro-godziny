"""iter95n: Equipment price book - 3 ceny (godzina/dzien/miesiac) + wynajmujacy + koszty poboczne."""
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


def test_create_equipment_full_fields(H):
    suffix = uuid.uuid4().hex[:6]
    r = requests.post(f"{API}/wyceny/cennik", json={
        "category": "equipment",
        "name": f"Zageszczarka {suffix}",
        "price_hour": 15.0, "price_day": 100.0, "price_month": 2000.0,
        "wynajmujacy": "Ramirent",
        "extra_cost": 50.0, "extra_cost_desc": "transport + paliwo",
    }, headers=H)
    r.raise_for_status()
    item = r.json()
    try:
        assert item["price_hour"] == 15.0
        assert item["price_day"] == 100.0
        assert item["price_month"] == 2000.0
        assert item["wynajmujacy"] == "Ramirent"
        assert item["extra_cost"] == 50.0
        assert item["extra_cost_desc"] == "transport + paliwo"
    finally:
        requests.delete(f"{API}/wyceny/cennik/{item['id']}", headers=H)


def test_update_equipment(H):
    suffix = uuid.uuid4().hex[:6]
    item = requests.post(f"{API}/wyceny/cennik", json={
        "category": "equipment", "name": f"Mlot {suffix}",
    }, headers=H).json()
    try:
        r = requests.patch(f"{API}/wyceny/cennik/{item['id']}", json={
            "price_hour": 25.0, "wynajmujacy": "własny", "extra_cost": 10.0,
        }, headers=H)
        r.raise_for_status()
        rows = requests.get(f"{API}/wyceny/cennik", params={"category": "equipment"}, headers=H).json()["rows"]
        mine = next(x for x in rows if x["id"] == item["id"])
        assert mine["price_hour"] == 25.0
        assert mine["wynajmujacy"] == "własny"
    finally:
        requests.delete(f"{API}/wyceny/cennik/{item['id']}", headers=H)
