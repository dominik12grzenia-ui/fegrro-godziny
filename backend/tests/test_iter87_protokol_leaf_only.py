"""iter87: Test regresji - protokol nie liczy podwojnie slotu i jego dzieci."""
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


def test_protokol_plan_netto_uses_only_leaf_lines(H):
    """Plan_netto pozycji w protokole = suma planu LISCI (linii bez dzieci).

    Bez tej poprawki: gdy slot ma quantity/price ORAZ dzieci z quantity/price,
    backend liczy obie wartosci → podwojne liczenie.
    """
    suffix = uuid.uuid4().hex[:6]
    bid = requests.post(f"{API}/finance/budowy", json={"name": f"PROTO-LEAF-{suffix}"}, headers=H).json()["id"]
    sid = requests.post(f"{API}/budget/stages", json={"budowa_id": bid, "name": "Etap 1"}, headers=H).json()["id"]
    pid = requests.post(f"{API}/budget/positions", json={"budowa_id": bid, "stage_id": sid, "name": "POZ-1"}, headers=H).json()["id"]

    # Slot M (kontener) z wlasna quantity/price - 100 * 50 = 5000 (stara wartosc, "ghost")
    slot_m = requests.post(f"{API}/budget/lines", json={
        "budowa_id": bid, "category": "materials", "name": "slot-M", "type": "materials",
        "stage_id": sid, "position_id": pid, "quantity": 100, "unit_price_netto": 50,
    }, headers=H).json()
    # 2 skladowe pod slot_m - 10*100 + 5*200 = 1000+1000 = 2000
    for n, q, p in [("Beton", 10, 100), ("Cement", 5, 200)]:
        requests.post(f"{API}/budget/lines", json={
            "budowa_id": bid, "category": "materials", "name": n, "type": "materials",
            "stage_id": sid, "position_id": pid, "parent_id": slot_m["id"],
            "quantity": q, "unit_price_netto": p,
        }, headers=H)

    # Wpisz progres zeby protokol pokazal pozycje
    requests.post(f"{API}/budget/positions/{pid}/progress", json={
        "year": 2026, "month": 5, "progress_pct": 100,
    }, headers=H)

    # GET protokol view dla maja 2026
    r = requests.get(f"{API}/budget/{bid}/protokol-view/2026/5", headers=H)
    assert r.status_code == 200, r.text
    rows = r.json().get("rows", [])
    poz = next((row for row in rows if row.get("type") == "line" and row.get("id") == pid), None)
    assert poz is not None, "Pozycja powinna byc w protokole (ma progress 100%)"
    # Powinno byc 2000 (liscie), NIE 5000+2000=7000 (podwojne liczenie)
    assert poz["plan_netto"] == 2000.0, f"Expected 2000.0, got {poz['plan_netto']} - podwojne liczenie slotu i dzieci!"

    # Cleanup
    requests.delete(f"{API}/budget/{bid}/wipe", headers=H)
    requests.delete(f"{API}/budget/stages/{sid}", headers=H)
    requests.delete(f"{API}/finance/budowy/{bid}", headers=H)


def test_protokol_plan_netto_slot_without_children_counts(H):
    """Gdy slot NIE ma dzieci, jego plan jest liczony bezposrednio."""
    suffix = uuid.uuid4().hex[:6]
    bid = requests.post(f"{API}/finance/budowy", json={"name": f"PROTO-SLOT-{suffix}"}, headers=H).json()["id"]
    sid = requests.post(f"{API}/budget/stages", json={"budowa_id": bid, "name": "Etap 1"}, headers=H).json()["id"]
    pid = requests.post(f"{API}/budget/positions", json={"budowa_id": bid, "stage_id": sid, "name": "POZ-1"}, headers=H).json()["id"]
    # Slot L bez dzieci - 7*350 = 2450
    requests.post(f"{API}/budget/lines", json={
        "budowa_id": bid, "category": "labor", "name": "Wylewanie", "type": "labor",
        "stage_id": sid, "position_id": pid, "quantity": 7, "unit_price_netto": 350,
    }, headers=H)
    requests.post(f"{API}/budget/positions/{pid}/progress", json={
        "year": 2026, "month": 5, "progress_pct": 50,
    }, headers=H)
    r = requests.get(f"{API}/budget/{bid}/protokol-view/2026/5", headers=H)
    rows = r.json().get("rows", [])
    poz = next((row for row in rows if row.get("type") == "line" and row.get("id") == pid), None)
    assert poz is not None
    assert poz["plan_netto"] == 2450.0
    # Cleanup
    requests.delete(f"{API}/budget/{bid}/wipe", headers=H)
    requests.delete(f"{API}/budget/stages/{sid}", headers=H)
    requests.delete(f"{API}/finance/budowy/{bid}", headers=H)
