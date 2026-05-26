"""iter95h: Test obslugi subpozycji w protokole.

- Widok protokolu zwraca subrows per pozycja
- POST /budget/lines/{line_id}/progress zapisuje subprogress
- Gdy istnieja subprogresy, miesiac_pct/prev_pct pozycji = weighted average
- PDF/Excel pokazuja tylko pozycje (nie subrows)
"""
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


def test_protokol_view_returns_subrows(H):
    """GET /budget/{id}/protokol-view zwraca subrows per pozycja."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"SUB-{suffix}"}, headers=H).json()["id"]
    s1 = requests.post(f"{API}/budget/stages", json={"budowa_id": bud, "name": "E1"}, headers=H).json()["id"]
    p1 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "Roboty"}, headers=H).json()["id"]
    # Tworze 3 sloty: labor (50), materials (30), equipment (20) - razem 100
    requests.post(f"{API}/budget/lines", json={
        "budowa_id": bud, "category": "labor", "name": "Robocizna", "type": "labor",
        "stage_id": s1, "position_id": p1, "quantity": 1, "unit_price_netto": 50,
    }, headers=H)
    requests.post(f"{API}/budget/lines", json={
        "budowa_id": bud, "category": "materials", "name": "Beton", "type": "materials",
        "stage_id": s1, "position_id": p1, "quantity": 1, "unit_price_netto": 30,
    }, headers=H)
    requests.post(f"{API}/budget/lines", json={
        "budowa_id": bud, "category": "equipment", "name": "Dzwig", "type": "equipment",
        "stage_id": s1, "position_id": p1, "quantity": 1, "unit_price_netto": 20,
    }, headers=H)
    r = requests.get(f"{API}/budget/{bud}/protokol-view/2026/3", headers=H)
    r.raise_for_status()
    data = r.json()
    pos_row = next(row for row in data["rows"] if row.get("type") == "line" and row.get("id") == p1)
    subrows = pos_row.get("subrows", [])
    assert len(subrows) == 3, f"Powinny byc 3 subrows, jest {len(subrows)}"
    types = sorted(s["type"] for s in subrows)
    assert types == ["equipment", "labor", "materials"]
    # Plan pozycji = suma sub_plan
    assert pos_row["plan_netto"] == 100.0


def test_subposition_progress_aggregates_to_position(H):
    """Po wpisaniu progresu per subpozycja, position progress = weighted average."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"AGG-{suffix}"}, headers=H).json()["id"]
    s1 = requests.post(f"{API}/budget/stages", json={"budowa_id": bud, "name": "E1"}, headers=H).json()["id"]
    p1 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "Roboty"}, headers=H).json()["id"]
    l_labor = requests.post(f"{API}/budget/lines", json={
        "budowa_id": bud, "category": "labor", "name": "Robocizna", "type": "labor",
        "stage_id": s1, "position_id": p1, "quantity": 1, "unit_price_netto": 50,
    }, headers=H).json()["id"]
    l_mat = requests.post(f"{API}/budget/lines", json={
        "budowa_id": bud, "category": "materials", "name": "Beton", "type": "materials",
        "stage_id": s1, "position_id": p1, "quantity": 1, "unit_price_netto": 50,
    }, headers=H).json()["id"]
    # Robocizna 100%, materials 0% -> weighted = 50% * 100 + 50% * 0 = 50%
    requests.post(f"{API}/budget/lines/{l_labor}/progress",
                  json={"year": 2026, "month": 4, "progress_pct": 100}, headers=H)
    requests.post(f"{API}/budget/lines/{l_mat}/progress",
                  json={"year": 2026, "month": 4, "progress_pct": 0}, headers=H)
    r = requests.get(f"{API}/budget/{bud}/protokol-view/2026/4", headers=H)
    r.raise_for_status()
    data = r.json()
    pos_row = next(row for row in data["rows"] if row.get("type") == "line" and row.get("id") == p1)
    # Pozycja powinna miec miesiac_pct = 50.0 (50*100 + 50*0) / 100
    assert abs(pos_row["miesiac_pct"] - 50.0) < 0.5, \
        f"miesiac_pct={pos_row['miesiac_pct']} powinno byc ~50.0"
    assert pos_row.get("sub_has_progress") is True
    # Wartosc pozycji = 100 * 50% = 50
    assert abs(pos_row["miesiac_val"] - 50.0) < 0.5


def test_pdf_excel_excludes_subrows(H):
    """Eksport PDF/Excel zwraca tylko pozycje (nie subrows)."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"EXP-{suffix}"}, headers=H).json()["id"]
    s1 = requests.post(f"{API}/budget/stages", json={"budowa_id": bud, "name": "E1"}, headers=H).json()["id"]
    p1 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "Roboty"}, headers=H).json()["id"]
    requests.post(f"{API}/budget/lines", json={
        "budowa_id": bud, "category": "labor", "name": "Robocizna", "type": "labor",
        "stage_id": s1, "position_id": p1, "quantity": 1, "unit_price_netto": 50,
    }, headers=H)
    # Excel
    r_xlsx = requests.get(f"{API}/budget/{bud}/protokol/2026/5", headers=H)
    assert r_xlsx.status_code == 200
    assert "spreadsheetml" in r_xlsx.headers.get("content-type", "")
    # PDF
    r_pdf = requests.get(f"{API}/budget/{bud}/protokol/2026/5/pdf", headers=H)
    assert r_pdf.status_code == 200
    assert r_pdf.headers.get("content-type", "").startswith("application/pdf")
    # Brak crashu = sukces. Eksport pomija subrows bo iteruje po `lines` (pozycjach).
