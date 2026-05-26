"""iter95d: Widok roczny alokacji ogranicza zakres dat do miesiacy aktywnosci budowy.

Bez tego budowa zalozona np. w kwietniu zaciagalaby koszty nieprzypisane firmy
od stycznia, co jest niepoprawne.
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
    # Retry na rate limit
    for _ in range(3):
        r = requests.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        if r.status_code == 200:
            return {"Authorization": f"Bearer {r.json()['access_token']}"}
        time.sleep(2)
    r.raise_for_status()


def test_year_view_skips_months_before_budowa_activity(H):
    """Widok roczny: budowa z pierwszym zapisem w maju NIE powinna lapac kosztow firmowych ze stycznia/lutego."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"RNG-{suffix}"}, headers=H).json()["id"]
    # Etap + pozycja + slot labor
    s1 = requests.post(f"{API}/budget/stages", json={"budowa_id": bud, "name": "E1"}, headers=H).json()["id"]
    p1 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "Roboty"}, headers=H).json()["id"]
    requests.post(f"{API}/budget/lines", json={
        "budowa_id": bud, "category": "labor", "name": "Robocizna", "type": "labor",
        "stage_id": s1, "position_id": p1, "quantity": 100, "unit_price_netto": 50,
    }, headers=H)
    requests.post(f"{API}/budget/positions/{p1}/progress",
                  json={"year": 2027, "month": 5, "progress_pct": 100}, headers=H)

    kody = requests.get(f"{API}/finance/kody", headers=H).json()["rows"]
    ksb_id = next(k["id"] for k in kody if k["category"] == "KSB")
    ks_id = next(k["id"] for k in kody if k.get("category") == "PZS")

    # Sprzedaz budowy w maju - to PIERWSZY zapis tej budowy
    sale_b = requests.post(f"{API}/finance/zapisy", json={
        "date": "2027-05-15", "netto": 10000, "kod_id": ks_id, "budowa_id": bud,
    }, headers=H).json()
    # Sprzedaz firmy w styczniu (przed budowa)
    sale_f_jan = requests.post(f"{API}/finance/zapisy", json={
        "date": "2027-01-10", "netto": 20000, "kod_id": ks_id,
    }, headers=H).json()
    # Sprzedaz firmy w maju (rownolegle z budowa)
    sale_f_may = requests.post(f"{API}/finance/zapisy", json={
        "date": "2027-05-20", "netto": 20000, "kod_id": ks_id,
    }, headers=H).json()
    # Koszt firmowy STYCZEN (bez budowy) - NIE powinien byc lapany
    cost_jan = requests.post(f"{API}/finance/zapisy", json={
        "date": "2027-01-12", "netto": 5000, "kod_id": ksb_id,
    }, headers=H).json()
    # Koszt firmowy MAJ (bez budowy) - powinien byc lapany
    cost_may = requests.post(f"{API}/finance/zapisy", json={
        "date": "2027-05-22", "netto": 3000, "kod_id": ksb_id,
    }, headers=H).json()
    try:
        # Widok roczny (bez month)
        r = requests.get(f"{API}/budget/{bud}/allocations?year=2027", headers=H)
        r.raise_for_status()
        data = r.json()
        pools = data["pools"]
        # Zakres dat powinien startowac od maja (pierwszy zapis budowy)
        assert data["date_range"]["start"].startswith("2027-05"), \
            f"Zakres rozpoczyna sie od {data['date_range']['start']} (powinien 2027-05-XX)"
        # unassigned_company POWINNO byc tylko maj = 3000, NIE 8000 (jan+maj)
        assert pools["unassigned_company"] == 3000.0, \
            f"unassigned_company={pools['unassigned_company']} powinno byc 3000 (tylko maj)"
        # sprzedaz_total_firma = 30000 (sale_f_may 20000 + sale_b 10000 - oba to maj sprzedaze firmy)
        assert pools["sprzedaz_total_firma"] == 30000.0, \
            f"sprzedaz_total_firma={pools['sprzedaz_total_firma']} powinno byc 30000 (tylko maj, oba)"
        # sprzedaz_budowa = 10000 (sale_b)
        assert pools["sprzedaz_budowa"] == 10000.0
        # ratio = 10000/30000 = 0.333..., Q = 3000 * 0.333 ≈ 1000
        assert abs(pools["Q"] - 1000.0) < 1.0, f"Q={pools['Q']} powinno byc ~1000"
    finally:
        for z in [sale_b, sale_f_jan, sale_f_may, cost_jan, cost_may]:
            requests.delete(f"{API}/finance/zapisy/{z['id']}", headers=H)


def test_month_view_unchanged(H):
    """Widok miesieczny dziala jak wczesniej - tylko ten miesiac."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"MNT-{suffix}"}, headers=H).json()["id"]
    r = requests.get(f"{API}/budget/{bud}/allocations?year=2027&month=3", headers=H)
    r.raise_for_status()
    data = r.json()
    # Zakres dat: caly marzec
    assert data["date_range"]["start"] == "2027-03-01"
    assert data["date_range"]["end"] == "2027-03-31"
