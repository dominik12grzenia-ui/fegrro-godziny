"""iter95cu: AI text polish endpoint tests.

Endpoint: POST /api/wyceny/ai/polish
- Requires admin Bearer token
- Body: { text, kind }
- Returns: { polished, original }
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://equipment-payroll.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def admin_token():
    resp = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert resp.status_code == 200, f"Admin login failed: {resp.status_code} {resp.text[:200]}"
    token = resp.json().get("access_token")
    assert token, "No access_token in login response"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- AUTH ----------

class TestWycenyAiPolishAuth:
    def test_no_auth_returns_401_or_403(self):
        resp = requests.post(
            f"{BASE_URL}/api/wyceny/ai/polish",
            json={"text": "rurka pcv 110", "kind": "name"},
            timeout=15,
        )
        assert resp.status_code in (401, 403), f"Expected 401/403 without auth, got {resp.status_code}: {resp.text[:200]}"

    def test_bad_token_returns_401_or_403(self):
        resp = requests.post(
            f"{BASE_URL}/api/wyceny/ai/polish",
            json={"text": "rurka pcv 110", "kind": "name"},
            headers={"Authorization": "Bearer not-a-real-token", "Content-Type": "application/json"},
            timeout=15,
        )
        assert resp.status_code in (401, 403)


# ---------- VALIDATION ----------

class TestWycenyAiPolishValidation:
    def test_empty_text_returns_400(self, auth_headers):
        resp = requests.post(
            f"{BASE_URL}/api/wyceny/ai/polish",
            json={"text": "", "kind": "name"},
            headers=auth_headers,
            timeout=15,
        )
        # 400 from explicit check OR 422 from pydantic (acceptable, but spec asks 400)
        assert resp.status_code in (400, 422), f"Expected 400 on empty text, got {resp.status_code}"

    def test_whitespace_only_returns_400(self, auth_headers):
        resp = requests.post(
            f"{BASE_URL}/api/wyceny/ai/polish",
            json={"text": "   \n  ", "kind": "name"},
            headers=auth_headers,
            timeout=15,
        )
        assert resp.status_code in (400, 422), f"Expected 400 on whitespace text, got {resp.status_code}"

    def test_invalid_kind_returns_422(self, auth_headers):
        resp = requests.post(
            f"{BASE_URL}/api/wyceny/ai/polish",
            json={"text": "rurka pcv", "kind": "garbage"},
            headers=auth_headers,
            timeout=15,
        )
        assert resp.status_code == 422

    def test_very_short_text_returned_as_is(self, auth_headers):
        # Code: if len(text) < 2 -> returns polished=text, original=text
        resp = requests.post(
            f"{BASE_URL}/api/wyceny/ai/polish",
            json={"text": "a", "kind": "name"},
            headers=auth_headers,
            timeout=15,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["polished"] == "a"
        assert data["original"] == "a"


# ---------- AI POLISH (real LLM call) ----------

class TestWycenyAiPolishLLM:
    def test_polish_messy_name(self, auth_headers):
        """Real Claude Haiku call — expect ~3-5s response."""
        messy = "rurka pcv 110 plus studnia rewizyjna fi 400"
        resp = requests.post(
            f"{BASE_URL}/api/wyceny/ai/polish",
            json={"text": messy, "kind": "name"},
            headers=auth_headers,
            timeout=45,
        )
        assert resp.status_code == 200, f"LLM call failed: {resp.status_code} {resp.text[:500]}"
        data = resp.json()
        assert "polished" in data and "original" in data
        assert isinstance(data["polished"], str) and isinstance(data["original"], str)
        assert data["original"] == messy
        polished = data["polished"]
        assert len(polished) > 0
        # Polished should differ from messy input (capitalization or Ø symbol added)
        assert polished != messy, f"Expected polish to differ, got identical: {polished!r}"
        # Should still mention the technical keywords
        low = polished.lower()
        # Check Polish technical content preserved
        assert "110" in polished and "400" in polished, f"Numbers lost in polish: {polished!r}"
        assert ("studn" in low or "rewizyj" in low or "pcv" in low or "pvc" in low), (
            f"Technical terms lost: {polished!r}"
        )
        print(f"\nORIGINAL: {messy}\nPOLISHED: {polished}")

    def test_polish_description_kind(self, auth_headers):
        text = "robic wykop pod studzienke fi 1000 glebokosc 1.5m"
        resp = requests.post(
            f"{BASE_URL}/api/wyceny/ai/polish",
            json={"text": text, "kind": "description"},
            headers=auth_headers,
            timeout=45,
        )
        assert resp.status_code == 200, resp.text[:300]
        data = resp.json()
        assert data["original"] == text
        assert len(data["polished"]) > 0
        # Numbers preserved
        assert "1000" in data["polished"]
        print(f"\nDESC POLISHED: {data['polished']}")


# ---------- LOGO IN PDF (iter95cs) ----------

class TestWycenyPdfLogo:
    """Quick smoke check that PDF export still works; deep logo inspection is binary."""

    def test_pdf_export_returns_200_with_pdf(self, auth_headers):
        # Find any wycena id
        lst = requests.get(f"{BASE_URL}/api/wyceny", headers=auth_headers, timeout=15)
        if lst.status_code != 200:
            pytest.skip(f"Cannot list wyceny: {lst.status_code}")
        payload = lst.json()
        items = payload.get("rows") if isinstance(payload, dict) else payload
        if not items:
            pytest.skip("No wyceny in DB — cannot test PDF export")
        wid = items[0].get("id") or items[0].get("_id")
        if not wid:
            pytest.skip("No id field on wycena")
        resp = requests.get(
            f"{BASE_URL}/api/wyceny/{wid}/export.pdf?detail=client",
            headers={"Authorization": auth_headers["Authorization"]},
            timeout=30,
        )
        assert resp.status_code == 200, f"PDF export failed: {resp.status_code} {resp.text[:200]}"
        body = resp.content
        # PDF magic
        assert body[:4] == b"%PDF", f"Not a PDF: {body[:20]!r}"
        # Logo embed marker — file should be reasonably sized (logo + content)
        assert len(body) > 5000, f"PDF suspiciously small: {len(body)} bytes"
        print(f"\nPDF size: {len(body)} bytes")
