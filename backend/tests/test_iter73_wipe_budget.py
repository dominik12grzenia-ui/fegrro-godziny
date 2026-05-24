"""Test iter 73 - DELETE /budget/{budowa_id}/wipe."""
import os
import requests
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001") + "/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/admin/login", json={"email": "admin@fegrro.pl", "password": "Admin123!"})
    return r.json()["access_token"]


def test_wipe_budget_removes_lines_positions_progress(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    budowa_id = requests.get(f"{API}/finance/budowy", headers=h).json()["rows"][0]["id"]

    # Utworz etap, pozycje, podpozycje, progress
    s = requests.post(f"{API}/budget/stages", json={"budowa_id": budowa_id, "name": "ITER73 ETAP"}, headers=h).json()
    p = requests.post(f"{API}/budget/positions", json={
        "budowa_id": budowa_id, "stage_id": s["id"], "name": "ITER73 wipe"
    }, headers=h).json()
    sub = requests.post(f"{API}/budget/lines", json={
        "budowa_id": budowa_id, "category": "TEST", "name": "Sub", "type": "labor",
        "position_id": p["id"], "stage_id": s["id"], "quantity": 1, "unit_price_netto": 100
    }, headers=h).json()
    # Dodaj sierote (linia bez position_id - jak ze starego modelu)
    orphan = requests.post(f"{API}/budget/lines", json={
        "budowa_id": budowa_id, "category": "OLD", "name": "ITER73 orphan", "type": "materials",
        "stage_id": s["id"], "quantity": 5, "unit_price_netto": 200
    }, headers=h).json()
    # Wpisz progress
    requests.post(f"{API}/budget/positions/{p['id']}/progress",
                 json={"year": 2026, "month": 5, "progress_pct": 25}, headers=h)

    # Wipe
    w = requests.delete(f"{API}/budget/{budowa_id}/wipe", headers=h)
    assert w.status_code == 200, w.text
    data = w.json()
    assert data["ok"] is True
    assert data["deleted_lines"] >= 2  # subposition + orphan
    assert data["deleted_positions"] >= 1

    # Sprawdz ze wszystko znikneło
    lines = requests.get(f"{API}/budget/{budowa_id}/lines", headers=h).json()["rows"]
    assert all(line["id"] != sub["id"] for line in lines)
    assert all(line["id"] != orphan["id"] for line in lines)
    positions = requests.get(f"{API}/budget/{budowa_id}/positions", headers=h).json()["rows"]
    assert all(pp["id"] != p["id"] for pp in positions)

    # Cleanup etapu (nie jest usuwane przez wipe)
    requests.delete(f"{API}/budget/stages/{s['id']}", headers=h)
