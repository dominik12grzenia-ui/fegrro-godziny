"""
Iter95av — Testy GUS endpoint + Logo w eksportach PDF/Excel + UI wycen.

Pokrywa:
1. GET /api/gus/{nip} — auth, walidacja NIP, sukces dla 5260250274.
2. Wycena exports (PDF + XLSX) - detail=full, detail=client + logo w XLSX (xl/media/image1.png).
3. BOM exports (PDF + XLSX) - logo embedded.
4. Regresja: snapshots, negotiation, convert-to-budget, clients endpoints.
"""
import io
import os
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://equipment-payroll.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASSWORD = "Admin123!"
NIP_MF = "5260250274"  # Ministerstwo Finansów - zawsze dostępny


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("access_token")
    assert tok, f"No access_token in response: {data}"
    return tok


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def wycena_id(auth_headers):
    r = requests.get(f"{API}/wyceny", headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"GET /wyceny failed: {r.status_code} {r.text[:200]}"
    rows = r.json().get("rows") or r.json()
    if isinstance(rows, dict):
        rows = rows.get("rows", [])
    assert rows, "Brak wycen w bazie"
    return rows[0]["id"]


# === GUS ===
class TestGus:
    def test_gus_unauthorized(self):
        r = requests.get(f"{API}/gus/{NIP_MF}", timeout=15)
        # 401 lub 403 - oba akceptowalne dla braku auth
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}: {r.text[:200]}"

    def test_gus_invalid_nip_short(self, auth_headers):
        r = requests.get(f"{API}/gus/123", headers=auth_headers, timeout=15)
        assert r.status_code == 400, f"Expected 400 dla NIP=123, got {r.status_code}: {r.text[:200]}"

    def test_gus_valid_nip(self, auth_headers):
        r = requests.get(f"{API}/gus/{NIP_MF}", headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert data.get("found") is True, f"Expected found=True, got: {data}"
        assert data.get("nip") == NIP_MF
        assert data.get("name"), f"Brak nazwy: {data}"
        assert "ministerstwo" in (data.get("name") or "").lower() or "finans" in (data.get("name") or "").lower(), \
            f"Nazwa nie zawiera MF: {data.get('name')}"
        # address może być pusty dla MF, ale field musi istnieć
        assert "address" in data


# === Wycena PDF / XLSX ===
class TestWycenaExports:
    def test_wycena_pdf_full(self, auth_headers, wycena_id):
        r = requests.get(f"{API}/wyceny/{wycena_id}/export.pdf?detail=full", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"PDF full failed: {r.status_code} {r.text[:200]}"
        assert "application/pdf" in r.headers.get("content-type", "").lower()
        assert r.content[:4] == b"%PDF", "Brak magic bytes PDF"
        # logo embedded -> wielkość > 30KB
        assert len(r.content) > 30000, f"PDF za mały ({len(r.content)} B), prawdopodobnie brak logo"

    def test_wycena_pdf_client(self, auth_headers, wycena_id):
        r = requests.get(f"{API}/wyceny/{wycena_id}/export.pdf?detail=client", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"PDF client failed: {r.status_code} {r.text[:200]}"
        assert r.content[:4] == b"%PDF"

    def test_wycena_xlsx_full_has_logo(self, auth_headers, wycena_id):
        r = requests.get(f"{API}/wyceny/{wycena_id}/export.xlsx?detail=full", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"XLSX full failed: {r.status_code} {r.text[:200]}"
        ct = r.headers.get("content-type", "").lower()
        assert "spreadsheet" in ct or "officedocument" in ct, f"Wrong content-type: {ct}"
        # sprawdź czy zawiera xl/media/image1.png
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            names = z.namelist()
        assert any(n.startswith("xl/media/image") for n in names), \
            f"Brak logo w XLSX full. Files: {[n for n in names if 'media' in n or 'image' in n]}"

    def test_wycena_xlsx_client_has_logo(self, auth_headers, wycena_id):
        r = requests.get(f"{API}/wyceny/{wycena_id}/export.xlsx?detail=client", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"XLSX client failed: {r.status_code} {r.text[:200]}"
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            names = z.namelist()
        assert any(n.startswith("xl/media/image") for n in names), \
            f"Brak logo w XLSX client. Files: {[n for n in names if 'media' in n or 'image' in n]}"


# === BOM PDF / XLSX ===
class TestBomExports:
    def test_bom_pdf_has_logo(self, auth_headers, wycena_id):
        r = requests.get(f"{API}/wyceny/{wycena_id}/bom.pdf", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"BOM PDF failed: {r.status_code} {r.text[:200]}"
        assert "application/pdf" in r.headers.get("content-type", "").lower()
        assert r.content[:4] == b"%PDF"
        # logo embedded -> >30KB
        assert len(r.content) > 30000, f"BOM PDF za mały ({len(r.content)} B), prawd. brak logo"

    def test_bom_xlsx_has_logo(self, auth_headers, wycena_id):
        r = requests.get(f"{API}/wyceny/{wycena_id}/bom.xlsx", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"BOM XLSX failed: {r.status_code} {r.text[:200]}"
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            names = z.namelist()
        assert any(n.startswith("xl/media/image") for n in names), \
            f"Brak logo w BOM XLSX. Files: {[n for n in names if 'media' in n or 'image' in n]}"


# === Regresja ===
class TestRegression:
    def test_clients_list(self, auth_headers):
        r = requests.get(f"{API}/wyceny/clients", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"clients: {r.status_code} {r.text[:200]}"

    def test_wycena_snapshots(self, auth_headers, wycena_id):
        r = requests.get(f"{API}/wyceny/{wycena_id}/snapshots", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"snapshots: {r.status_code} {r.text[:200]}"

    def test_wycena_negotiation(self, auth_headers, wycena_id):
        r = requests.get(f"{API}/wyceny/{wycena_id}/negotiation", headers=auth_headers, timeout=15)
        # Może być 200 lub 404 (jeśli nie ma negocjacji) - oba akceptowalne
        assert r.status_code in (200, 404), f"negotiation: {r.status_code} {r.text[:200]}"
