"""Test endpoint /budget/{budowa_id}/options-flat oraz inline assign budget_line_id w zapisach."""
import os
import requests
import pytest
import uuid

API = os.environ.get("API_URL", "http://localhost:8001/api")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@fegrro.pl")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "Admin123!")


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    r.raise_for_status()
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def budowa(H):
    # Tworzymy testowa budowe
    name = f"BUDŻETOWA-OPT-{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/finance/budowy", json={
        "name": name,
        "kaucja_gir_pct": 5.0, "kaucja_dw_pct": 2.0, "koszt_budowy_pct": 10.0,
    }, headers=H)
    r.raise_for_status()
    bid = r.json()["id"]
    yield bid
    # cleanup
    try:
        # Wipe budget + delete budowa
        requests.delete(f"{API}/budget/{bid}/wipe", headers=H)
        requests.delete(f"{API}/finance/budowy/{bid}", headers=H)
    except Exception:
        pass


def test_options_flat_empty(H, budowa):
    """Empty when no stages."""
    r = requests.get(f"{API}/budget/{budowa}/options-flat", headers=H)
    assert r.status_code == 200
    assert r.json()["options"] == []


def test_options_flat_with_hierarchy(H, budowa):
    """Stage -> Position -> 3 slots (R/M/S) -> 2 sub-components under materials."""
    # Stage
    s = requests.post(f"{API}/budget/stages", json={"budowa_id": budowa, "name": "Etap 1 - Roboty ziemne"}, headers=H).json()
    sid = s["id"]
    # Position
    p = requests.post(f"{API}/budget/positions", json={"budowa_id": budowa, "stage_id": sid, "name": "Wykop fundamentowy"}, headers=H).json()
    pid = p["id"]
    # 3 sloty (equipment/labor/materials)
    slots = {}
    for t in ["equipment", "labor", "materials"]:
        ln = requests.post(f"{API}/budget/lines", json={
            "budowa_id": budowa, "category": t, "name": f"slot-{t}", "type": t,
            "stage_id": sid, "position_id": pid,
        }, headers=H).json()
        slots[t] = ln["id"]
    # 2 sub-components pod materials
    sub1 = requests.post(f"{API}/budget/lines", json={
        "budowa_id": budowa, "category": "materials", "name": "Beton B25", "type": "materials",
        "stage_id": sid, "position_id": pid, "parent_id": slots["materials"],
        "quantity": 10, "unit_price_netto": 100,
    }, headers=H).json()
    sub2 = requests.post(f"{API}/budget/lines", json={
        "budowa_id": budowa, "category": "materials", "name": "Stal pret", "type": "materials",
        "stage_id": sid, "position_id": pid, "parent_id": slots["materials"],
        "quantity": 5, "unit_price_netto": 50,
    }, headers=H).json()
    # GET options-flat
    r = requests.get(f"{API}/budget/{budowa}/options-flat", headers=H)
    assert r.status_code == 200
    opts = r.json()["options"]
    # iter83: pozycja-header + 3 sloty + 2 sub = 6 opcji
    assert len(opts) == 6
    # Pierwsza powinna byc position-header
    assert opts[0]["level"] == "position"
    assert opts[0]["disabled"] is True
    assert opts[0]["id"].startswith("position:")
    # Reszta - sloty i sub
    codes = [o["code"] for o in opts]
    assert "101.S" in codes
    assert "101.R" in codes
    assert "101.M" in codes
    assert "101.M.1" in codes
    assert "101.M.2" in codes
    # Sloty maja level=slot
    slot_opts = [o for o in opts if o["level"] == "slot"]
    sub_opts = [o for o in opts if o["level"] == "sub"]
    pos_opts = [o for o in opts if o["level"] == "position"]
    assert len(slot_opts) == 3
    assert len(sub_opts) == 2
    assert len(pos_opts) == 1
    # stage_name+position_name uzupelnione (pomijajac headery)
    assert all(o["stage_name"] == "Etap 1 - Roboty ziemne" for o in opts if o["level"] != "position")
    assert all(o["position_name"] == "Wykop fundamentowy" for o in opts if o["level"] != "position")


def test_zapis_assign_budget_line(H, budowa):
    """Tworzymy zapis i przypisujemy budget_line_id, potem czyscimy."""
    # Pobierz pierwsza opcje slotu/sub (nie position-header)
    opts = requests.get(f"{API}/budget/{budowa}/options-flat", headers=H).json()["options"]
    assignable = [o for o in opts if o["level"] != "position"]
    assert assignable, "Brak opcji budzetu - upewnij sie ze test_options_flat_with_hierarchy zostal uruchomiony wczesniej"
    line_id = assignable[0]["id"]
    # Pobierz kod
    kody = requests.get(f"{API}/finance/kody", headers=H).json()["rows"]
    kod_id = kody[0]["id"]
    # Stworz zapis
    z = requests.post(f"{API}/finance/zapisy", json={
        "date": "2026-02-15", "netto": 500, "kod_id": kod_id,
        "budowa_id": budowa, "budget_line_id": line_id,
    }, headers=H).json()
    assert z["budget_line_id"] == line_id
    zid = z["id"]
    # Sprawdz ze /budget/lines wlicza ten zapis do execution_netto
    lines = requests.get(f"{API}/budget/{budowa}/lines", headers=H).json()["rows"]
    target = next((ln for ln in lines if ln["id"] == line_id), None)
    assert target is not None
    assert target["execution_netto"] >= 500
    # Wyczysc przypisanie poprzez PUT z null
    r = requests.put(f"{API}/finance/zapisy/{zid}", json={"budget_line_id": None}, headers=H)
    assert r.status_code == 200
    # Sprawdz ze przypisanie zostalo wyzerowane
    zlist = requests.get(f"{API}/finance/zapisy?budowa_id={budowa}", headers=H).json()["rows"]
    z_after = next((z for z in zlist if z["id"] == zid), None)
    assert z_after is not None
    assert z_after.get("budget_line_id") in (None, "")
    # Cleanup
    requests.delete(f"{API}/finance/zapisy/{zid}", headers=H)
