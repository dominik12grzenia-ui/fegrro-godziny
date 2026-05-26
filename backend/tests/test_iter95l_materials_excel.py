"""iter95l: Materials price book Excel-style (rozszerzony schemat)."""
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


def test_create_material_full_fields(H):
    """Tworzy pozycje material z wszystkimi 11 polami z Excel."""
    suffix = uuid.uuid4().hex[:6]
    r = requests.post(f"{API}/wyceny/cennik", json={
        "category": "materials",
        "sub_category": "izolacje",
        "name": f"Dysperbit {suffix}",
        "unit_price_netto": 120.50,
        "oferent": "Castorama",
        "opakowanie": "wiaderko",
        "pkg_qty": 20,
        "pkg_unit": "kg",
        "zapotrzebowanie": 1.5,
        "zap_unit": "kg/m2",
        "liczba_warstw": 1,
        "notes": "1 warstwa",
    }, headers=H)
    r.raise_for_status()
    item = r.json()
    try:
        assert item["sub_category"] == "izolacje"
        assert item["oferent"] == "Castorama"
        assert item["pkg_qty"] == 20
        assert item["pkg_unit"] == "kg"
        assert item["zapotrzebowanie"] == 1.5
        assert item["zap_unit"] == "kg/m2"
        assert item["liczba_warstw"] == 1
        # GET potwierdza
        rows = requests.get(f"{API}/wyceny/cennik", params={"category": "materials"}, headers=H).json()["rows"]
        mine = next(x for x in rows if x["id"] == item["id"])
        assert mine["oferent"] == "Castorama"
        assert mine["sub_category"] == "izolacje"
    finally:
        requests.delete(f"{API}/wyceny/cennik/{item['id']}", headers=H)


def test_update_material_fields(H):
    """PATCH aktualizuje rozszerzone pola."""
    suffix = uuid.uuid4().hex[:6]
    item = requests.post(f"{API}/wyceny/cennik", json={
        "category": "materials", "sub_category": "betony", "name": f"Beton {suffix}",
    }, headers=H).json()
    try:
        r = requests.patch(f"{API}/wyceny/cennik/{item['id']}", json={
            "oferent": "Lafarge", "opakowanie": "paleta", "pkg_qty": 100, "pkg_unit": "m2",
            "zapotrzebowanie": 15, "zap_unit": "szt/m2", "liczba_warstw": 2,
        }, headers=H)
        r.raise_for_status()
        rows = requests.get(f"{API}/wyceny/cennik", params={"category": "materials"}, headers=H).json()["rows"]
        mine = next(x for x in rows if x["id"] == item["id"])
        assert mine["oferent"] == "Lafarge"
        assert mine["zapotrzebowanie"] == 15
        assert mine["liczba_warstw"] == 2
    finally:
        requests.delete(f"{API}/wyceny/cennik/{item['id']}", headers=H)


def test_sub_categories(H):
    """Wszystkie 6 sub_category z Excel sa akceptowane."""
    sub_cats = ['izolacje', 'betony', 'stal', 'murowane', 'drobnica', 'pozostałe']
    items = []
    for sc in sub_cats:
        r = requests.post(f"{API}/wyceny/cennik", json={
            "category": "materials", "sub_category": sc, "name": f"test-{sc}-{uuid.uuid4().hex[:4]}",
        }, headers=H)
        r.raise_for_status()
        items.append(r.json())
    try:
        rows = requests.get(f"{API}/wyceny/cennik", params={"category": "materials"}, headers=H).json()["rows"]
        my_subs = {x["sub_category"] for x in rows if any(x["id"] == it["id"] for it in items)}
        assert my_subs == set(sub_cats)
    finally:
        for it in items:
            requests.delete(f"{API}/wyceny/cennik/{it['id']}", headers=H)
