"""iter95: Test propagacji budowa_id z naglowka faktury na pozycje.

Naprawia Kolumne Q w Budzecie - alokacje sprzedaz_budowa / o_pool / p_pool
patrza tylko na finance_zapisy (pozycje), nie na finance_invoices (naglowki).
"""
import os
import uuid
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

API = os.environ.get("API_URL", "http://localhost:8001/api")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@fegrro.pl")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "Admin123!")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _seed_invoice_with_positions(budowa_id_init=None):
    """Tworzy testowa fakture (naglowek + 2 pozycje) bezposrednio w MongoDB."""
    async def go():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        inv_id = str(uuid.uuid4())
        await db.finance_invoices.insert_one({
            "id": inv_id,
            "date": "2026-02-10",
            "year": 2026, "month": 2,
            "kontrahent": "TEST-PROPAGATE",
            "netto": 500.0, "brutto": 615.0,
            "kod_id": None, "kod_category": None,
            "budowa_id": budowa_id_init,
            "nr_faktury": f"TEST-{uuid.uuid4().hex[:6]}",
            "is_income": True,
            "source": "fakturownia",
            "fakturownia_invoice_id": f"fak-{uuid.uuid4().hex[:8]}",
        })
        pos_ids = []
        for i, netto in enumerate([300.0, 200.0]):
            zid = str(uuid.uuid4())
            await db.finance_zapisy.insert_one({
                "id": zid,
                "date": "2026-02-10",
                "year": 2026, "month": 2,
                "kontrahent": "TEST-PROPAGATE",
                "netto": netto, "brutto": netto * 1.23,
                "kod_id": "PZS", "kod_category": "PZS",  # iter95e: PZS dla sprzedaz
                "budowa_id": None,  # KLUCZOWE - pozycje bez budowa_id
                "is_income": True,
                "parent_invoice_id": inv_id,
                "source": "fakturownia",
            })
            pos_ids.append(zid)
        client.close()
        return inv_id, pos_ids
    return asyncio.get_event_loop().run_until_complete(go())


def _get_position_budowa(zid):
    async def go():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        z = await db.finance_zapisy.find_one({"id": zid}, {"_id": 0, "budowa_id": 1})
        client.close()
        return z.get("budowa_id") if z else None
    return asyncio.get_event_loop().run_until_complete(go())


def _cleanup(inv_id, pos_ids):
    async def go():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        await db.finance_invoices.delete_one({"id": inv_id})
        for pid in pos_ids:
            await db.finance_zapisy.delete_one({"id": pid})
        client.close()
    return asyncio.get_event_loop().run_until_complete(go())


def test_update_invoice_propagates_budowa_to_positions(H):
    """PUT /finance/invoices/{id} z budowa_id propaguje to do pozycji bez budowa_id."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"PROP-{suffix}"}, headers=H).json()["id"]
    inv_id, pos_ids = _seed_invoice_with_positions(budowa_id_init=None)
    try:
        # Przed: pozycje maja budowa_id=None
        assert all(_get_position_budowa(pid) is None for pid in pos_ids)
        # Akcja: PUT z budowa_id
        r = requests.put(f"{API}/finance/invoices/{inv_id}", json={"budowa_id": bud}, headers=H)
        r.raise_for_status()
        # Po: pozycje dostaly budowa_id
        for pid in pos_ids:
            assert _get_position_budowa(pid) == bud, f"Pozycja {pid} nie dostala budowy"
    finally:
        _cleanup(inv_id, pos_ids)


def test_update_invoice_does_not_overwrite_explicit_position_budowa(H):
    """Jezeli pozycja ma juz wlasny budowa_id, update naglowka NIE nadpisuje go."""
    suffix = uuid.uuid4().hex[:6]
    bud1 = requests.post(f"{API}/finance/budowy", json={"name": f"P1-{suffix}"}, headers=H).json()["id"]
    bud2 = requests.post(f"{API}/finance/budowy", json={"name": f"P2-{suffix}"}, headers=H).json()["id"]
    inv_id, pos_ids = _seed_invoice_with_positions(budowa_id_init=None)
    try:
        # Ustaw bud1 na PIERWSZEJ pozycji explicite
        r = requests.put(f"{API}/finance/zapisy/{pos_ids[0]}", json={"budowa_id": bud1}, headers=H)
        r.raise_for_status()
        # Teraz naglowek -> bud2
        r = requests.put(f"{API}/finance/invoices/{inv_id}", json={"budowa_id": bud2}, headers=H)
        r.raise_for_status()
        # Pozycja[0] zostaje przy bud1 (explicit), pozycja[1] dostaje bud2
        assert _get_position_budowa(pos_ids[0]) == bud1
        assert _get_position_budowa(pos_ids[1]) == bud2
    finally:
        _cleanup(inv_id, pos_ids)


def test_backfill_endpoint_propagates_budowa(H):
    """POST /finance/backfill-invoice-budowa-to-positions propaguje budowa_id ze wszystkich naglowkow."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"BF-{suffix}"}, headers=H).json()["id"]
    # Symuluj sytuacje: naglowek MA budowa_id (przypisany kiedys), pozycje NIE maja
    inv_id, pos_ids = _seed_invoice_with_positions(budowa_id_init=bud)
    try:
        # Przed: pozycje None
        assert all(_get_position_budowa(pid) is None for pid in pos_ids)
        # Akcja backfill
        r = requests.post(f"{API}/finance/backfill-invoice-budowa-to-positions", headers=H)
        r.raise_for_status()
        data = r.json()
        assert data["positions_updated"] >= 2
        # Po: pozycje dostaly budowa_id z naglowka
        for pid in pos_ids:
            assert _get_position_budowa(pid) == bud
    finally:
        _cleanup(inv_id, pos_ids)


def test_q_column_after_propagation(H):
    """End-to-end: po propagacji sprzedaz_budowa > 0 => Q > 0 jezeli sa unassigned costs."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"QFX-{suffix}"}, headers=H).json()["id"]
    # Etap + pozycja + slot labor (R) - bez tego Q nie ma gdzie wpasc
    s1 = requests.post(f"{API}/budget/stages", json={"budowa_id": bud, "name": "E1"}, headers=H).json()["id"]
    p1 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "Roboty"}, headers=H).json()["id"]
    requests.post(f"{API}/budget/lines", json={
        "budowa_id": bud, "category": "labor", "name": "Robocizna", "type": "labor",
        "stage_id": s1, "position_id": p1, "quantity": 100, "unit_price_netto": 50,
    }, headers=H)
    # Progress p1=100% (zeby Q sie nie zerowal)
    requests.post(f"{API}/budget/positions/{p1}/progress",
                  json={"year": 2026, "month": 2, "progress_pct": 100}, headers=H)
    # Sprzedaz przypisana do budowy via faktura naglowkowa
    inv_id, pos_ids = _seed_invoice_with_positions(budowa_id_init=bud)
    # Koszt nieprzypisany do budowy (firmowy) - bezposredni zapis manualny
    cost_id = None
    try:
        kody = requests.get(f"{API}/finance/kody", headers=H).json()["rows"]
        ksb_id = next(k["id"] for k in kody if k["category"] == "KSB")
        cost_r = requests.post(f"{API}/finance/zapisy", json={
            "date": "2026-02-15", "netto": 1000, "kod_id": ksb_id,
            # Brak budowa_id - to firmowy nieprzypisany koszt
        }, headers=H)
        cost_r.raise_for_status()
        cost_id = cost_r.json()["id"]

        # Propaguj naglowek -> pozycje (sprzedaz przypisana do budowy)
        requests.post(f"{API}/finance/backfill-invoice-budowa-to-positions", headers=H)

        # Pobierz allocations
        r = requests.get(f"{API}/budget/{bud}/allocations?year=2026&month=2", headers=H)
        r.raise_for_status()
        data = r.json()
        # sprzedaz_budowa powinna byc > 0 (po propagacji)
        assert data["pools"]["sprzedaz_budowa"] >= 500.0, \
            f"sprzedaz_budowa={data['pools']['sprzedaz_budowa']} - propagacja nie zadzialala"
        # Q_pool > 0 (sprzedaz_ratio * unassigned_company)
        assert data["pools"]["Q"] > 0, \
            f"Q_pool={data['pools']['Q']} - powinno byc > 0"
    finally:
        if cost_id:
            requests.delete(f"{API}/finance/zapisy/{cost_id}", headers=H)
        _cleanup(inv_id, pos_ids)
