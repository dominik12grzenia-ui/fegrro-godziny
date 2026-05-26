"""iter95f: Widok roczny sumuje Q PER MIESIAC niezaleznie (nie jako jeden duzy agregat).

Test scenariusz:
- Budowa aktywna w maju i pazdzierniku
- Maj: sprzedaz firmy 30k, sprzedaz budowy 10k, leftover 3k -> ratio 33%, Q_may=1000
- Paz: sprzedaz firmy 100k, sprzedaz budowy 5k, leftover 6k -> ratio 5%, Q_oct=300
- Yearly view powinno dac Q_year = Q_may + Q_oct = 1300 (NIE jako jeden agregat: 
  agregat dalby (10k+5k)/(30k+100k) * (3k+6k) = 0.115 * 9000 = 1038, co jest INNE)
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


def test_year_q_equals_sum_of_monthly_q(H):
    """Q w widoku rocznym = suma Q per miesiac niezaleznie liczonych."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"MSUM-{suffix}"}, headers=H).json()["id"]
    kody = requests.get(f"{API}/finance/kody", headers=H).json()["rows"]
    ksb_id = next(k["id"] for k in kody if k["category"] == "KSB")
    ks_id = next(k["id"] for k in kody if k.get("category") == "PZS")

    zaps = []
    # MAJ: sprzedaz budowy 10k, sprzedaz firmy dodatkowo 20k (razem firma=30k), leftover (KSB bez budowy) = 3k
    zaps.append(requests.post(f"{API}/finance/zapisy", json={"date": "2028-05-15", "netto": 10000, "kod_id": ks_id, "budowa_id": bud}, headers=H).json())
    zaps.append(requests.post(f"{API}/finance/zapisy", json={"date": "2028-05-15", "netto": 20000, "kod_id": ks_id}, headers=H).json())
    zaps.append(requests.post(f"{API}/finance/zapisy", json={"date": "2028-05-20", "netto": 3000, "kod_id": ksb_id}, headers=H).json())
    # PAZDZIERNIK: sprzedaz budowy 5k, sprzedaz firmy dodatkowo 95k (razem firma=100k), leftover 6k
    zaps.append(requests.post(f"{API}/finance/zapisy", json={"date": "2028-10-10", "netto": 5000, "kod_id": ks_id, "budowa_id": bud}, headers=H).json())
    zaps.append(requests.post(f"{API}/finance/zapisy", json={"date": "2028-10-10", "netto": 95000, "kod_id": ks_id}, headers=H).json())
    zaps.append(requests.post(f"{API}/finance/zapisy", json={"date": "2028-10-15", "netto": 6000, "kod_id": ksb_id}, headers=H).json())
    try:
        # Pobierz Q dla maja
        r_may = requests.get(f"{API}/budget/{bud}/allocations?year=2028&month=5", headers=H).json()
        # Pobierz Q dla pazdziernika
        r_oct = requests.get(f"{API}/budget/{bud}/allocations?year=2028&month=10", headers=H).json()
        # Pobierz Q dla roku
        r_year = requests.get(f"{API}/budget/{bud}/allocations?year=2028", headers=H).json()

        q_may = r_may["pools"]["Q"]
        q_oct = r_oct["pools"]["Q"]
        q_year = r_year["pools"]["Q"]
        # Q_may = 10000/30000 * 3000 = 1000
        assert abs(q_may - 1000.0) < 1.0, f"Q_may={q_may} powinno byc ~1000"
        # Q_oct = 5000/100000 * 6000 = 300
        assert abs(q_oct - 300.0) < 1.0, f"Q_oct={q_oct} powinno byc ~300"
        # Q_year = Q_may + Q_oct = 1300 (NIE jako agregat: 15/130 * 9000 = 1038.46)
        assert abs(q_year - 1300.0) < 5.0, f"Q_year={q_year} powinno byc ~1300 (suma Q_may+Q_oct), nie agregat"
        # Sprawdz tez czerwiec/listopad - powinny byc 0 (brak aktywnosci budowy)
        r_jun = requests.get(f"{API}/budget/{bud}/allocations?year=2028&month=6", headers=H).json()
        assert r_jun["pools"]["Q"] == 0
    finally:
        for z in zaps:
            requests.delete(f"{API}/finance/zapisy/{z['id']}", headers=H)
