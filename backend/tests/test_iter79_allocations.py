"""Test endpoint /budget/{budowa_id}/allocations - alokacja kosztow O/P/Q."""
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


@pytest.fixture(scope="module")
def setup(H):
    """Tworzy 2 budowy z pozycjami i wpisami % zaawansowania."""
    suffix = uuid.uuid4().hex[:6]
    b1 = requests.post(f"{API}/finance/budowy", json={"name": f"ALOC-A-{suffix}"}, headers=H).json()["id"]
    b2 = requests.post(f"{API}/finance/budowy", json={"name": f"ALOC-B-{suffix}"}, headers=H).json()["id"]
    # Budowa A: 2 etapy, 2 pozycje
    s1 = requests.post(f"{API}/budget/stages", json={"budowa_id": b1, "name": "E1"}, headers=H).json()["id"]
    p1 = requests.post(f"{API}/budget/positions", json={"budowa_id": b1, "stage_id": s1, "name": "Wykop"}, headers=H).json()["id"]
    p2 = requests.post(f"{API}/budget/positions", json={"budowa_id": b1, "stage_id": s1, "name": "Stropy"}, headers=H).json()["id"]
    # Sloty M dla obu (zeby plan>0)
    for pos in [p1, p2]:
        requests.post(f"{API}/budget/lines", json={
            "budowa_id": b1, "category": "materials", "name": "slot-M", "type": "materials",
            "stage_id": s1, "position_id": pos, "quantity": 100, "unit_price_netto": 10,
        }, headers=H)
    # Ustaw progress: p1=80%, p2=60%
    requests.post(f"{API}/budget/positions/{p1}/progress", json={"year": 2026, "month": 2, "progress_pct": 80}, headers=H)
    requests.post(f"{API}/budget/positions/{p2}/progress", json={"year": 2026, "month": 2, "progress_pct": 60}, headers=H)
    # Dodaj zapisy
    kody = requests.get(f"{API}/finance/kody", headers=H).json()["rows"]
    kp_id = next(k["id"] for k in kody if k["id"] == "KP_WYNAGRODZENIA")
    # Pierwszy nie-KP kod kosztowy
    ksb_id = next(k["id"] for k in kody if k["category"] == "KSB")
    # O_pool=1400 (budowa A, brak budget_line_id, kod != KP)
    requests.post(f"{API}/finance/zapisy", json={
        "date": "2026-02-15", "netto": 1400, "kod_id": ksb_id, "budowa_id": b1,
    }, headers=H)
    # P_pool=1000 (budowa A, brak budget_line_id, kod = KP)
    requests.post(f"{API}/finance/zapisy", json={
        "date": "2026-02-10", "netto": 1000, "kod_id": kp_id, "budowa_id": b1,
    }, headers=H)
    # Budowa B - drugie KP zeby kp_total_firma > KP_budowa_A
    requests.post(f"{API}/finance/zapisy", json={
        "date": "2026-02-10", "netto": 4000, "kod_id": kp_id, "budowa_id": b2,
    }, headers=H)
    # Koszty firmowe BEZ budowy: 5000
    requests.post(f"{API}/finance/zapisy", json={
        "date": "2026-02-05", "netto": 5000, "kod_id": ksb_id, "budowa_id": None,
    }, headers=H)
    yield {"b1": b1, "b2": b2, "p1": p1, "p2": p2, "s1": s1}
    # Cleanup
    for bid in [b1, b2]:
        try:
            requests.delete(f"{API}/budget/{bid}/wipe", headers=H)
            # Usun stages tez
            ss = requests.get(f"{API}/budget/{bid}/stages", headers=H).json().get("rows", [])
            for s in ss:
                requests.delete(f"{API}/budget/stages/{s['id']}", headers=H)
            # Usun zapisy budowy
            zlist = requests.get(f"{API}/finance/zapisy?budowa_id={bid}&year=2026", headers=H).json().get("rows", [])
            for z in zlist:
                requests.delete(f"{API}/finance/zapisy/{z['id']}", headers=H)
            requests.delete(f"{API}/finance/budowy/{bid}", headers=H)
        except Exception:
            pass


def test_allocations_month(H, setup):
    """Sprawdza dystrybucje O/P/Q wg progresu."""
    r = requests.get(f"{API}/budget/{setup['b1']}/allocations?year=2026&month=2", headers=H)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["distributed"] is True
    # Pule (lokalnie kontrolowane przez nasz fixture)
    pools = data["pools"]
    assert pools["O"] == 1400.0
    assert pools["P"] == 1000.0
    # KP firma = KP_budowa_A (1000) + KP_budowa_B (4000) + ewentualne starsze KP w DB.
    # Spr. consystencje matematyczna: ratio = p_total_budowa / kp_total_firma
    assert pools["p_total_budowa"] == 1000.0
    assert pools["kp_total_firma"] >= 5000.0  # nasze 5000 + ew. inne
    expected_ratio = pools["p_total_budowa"] / pools["kp_total_firma"]
    assert abs(pools["wynagrodzenia_ratio"] - round(expected_ratio, 4)) < 0.001
    # Q = unassigned_company × ratio (zaokr.)
    assert pools["unassigned_company"] >= 5000.0
    expected_q = round(pools["unassigned_company"] * expected_ratio, 2)
    assert abs(pools["Q"] - expected_q) < 0.5
    # Total progress = 80 + 60 = 140
    assert data["total_progress_pct"] == 140.0
    # Position p1: share = 80/140
    alloc_p1 = data["positions"][setup["p1"]]
    share_p1 = 80.0 / 140.0
    assert round(alloc_p1["O"], 2) == round(1400.0 * share_p1, 2)
    assert round(alloc_p1["P"], 2) == round(1000.0 * share_p1, 2)
    # Position p2
    alloc_p2 = data["positions"][setup["p2"]]
    share_p2 = 60.0 / 140.0
    assert round(alloc_p2["O"], 2) == round(1400.0 * share_p2, 2)


def test_allocations_no_progress(H, setup):
    """Brak progresu → distributed=False, positions=empty, pools nadal liczone."""
    # styczen - brak progresu wpisanego
    r = requests.get(f"{API}/budget/{setup['b1']}/allocations?year=2026&month=1", headers=H)
    assert r.status_code == 200
    data = r.json()
    # Pule O/P/Q dla stycznia = 0 (brak zapisow w styczniu)
    assert data["pools"]["O"] == 0.0
    assert data["pools"]["P"] == 0.0
    assert data["distributed"] is False
    assert data["positions"] == {}


def test_allocations_year(H, setup):
    """Sumowanie progresu w skali roku."""
    r = requests.get(f"{API}/budget/{setup['b1']}/allocations?year=2026", headers=H)
    assert r.status_code == 200
    data = r.json()
    assert data["distributed"] is True
    assert data["total_progress_pct"] == 140.0
