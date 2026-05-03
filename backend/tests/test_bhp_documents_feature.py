"""BHP Employees + Documents + Bulk download e2e tests.

Covers:
- Admin login
- GET /api/bhp/employees (filters: include_archived, only_archived, site_id)
- PUT /api/employees/{id}/bhp-info (job_title, registered_at, bhp_valid_until,
  height_work_certified, height_valid_until)
- POST /api/employees/{id}/documents (PDF base64; invalid category; >10MB rejection)
- GET /api/employees/{id}/documents (no file_data field)
- GET /api/employees/{id}/documents/{doc_id}/download
- DELETE /api/employees/{id}/documents/{doc_id}
- POST /api/employees/{id}/archive + /restore
- POST /api/bhp/documents/bulk-download (zip)
- POST /api/bhp/documents/bulk-download (pdf merged)
- Edge: bulk-download with no docs -> 404
- Edge: bulk-download pdf with non-PDF file -> 400 with helpful msg
"""
import base64
import io
import os
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nostalgic-visvesvaraya-4.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@fegrro.pl"
ADMIN_PASSWORD = "Admin123!"

# Minimal valid 1-page PDF (~600B)
MIN_PDF_BYTES = (
    b"%PDF-1.1\n%\xe2\xe3\xcf\xd3\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<<>>>>endobj\n"
    b"4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 100 700 Td (TEST PDF) Tj ET\nendstream endobj\n"
    b"xref\n0 5\n0000000000 65535 f \n0000000018 00000 n \n0000000064 00000 n \n0000000111 00000 n \n0000000196 00000 n \n"
    b"trailer<</Size 5/Root 1 0 R>>\nstartxref\n290\n%%EOF\n"
)


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def employee_id(headers):
    """Pick first employee from /api/bhp/employees."""
    r = requests.get(f"{BASE_URL}/api/bhp/employees", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    emps = r.json()
    if not emps:
        pytest.skip("No employees in DB to test against")
    # Prefer an employee that is NOT already archived to avoid polluting tests
    for e in emps:
        if not e.get("is_archived"):
            return e["id"]
    return emps[0]["id"]


# ============= Listing =============
class TestBhpEmployeeListing:
    def test_list_active(self, headers):
        r = requests.get(f"{BASE_URL}/api/bhp/employees", headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # Active list should NOT contain archived employees
        for e in data:
            assert e.get("is_archived") in (False, None)
            assert "documents_total" in e
            assert "documents_by_category" in e

    def test_list_include_archived(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/bhp/employees?include_archived=true",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_only_archived(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/bhp/employees?only_archived=true",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200
        for e in r.json():
            assert e.get("is_archived") is True


# ============= BHP info update =============
class TestEmployeeBhpInfo:
    def test_update_bhp_info_persists(self, headers, employee_id):
        payload = {
            "job_title": "TEST_Operator",
            "registered_at": "2024-01-15",
            "bhp_valid_until": "2026-12-31",
            "height_work_certified": True,
            "height_valid_until": "2026-06-30",
        }
        r = requests.put(
            f"{BASE_URL}/api/employees/{employee_id}/bhp-info",
            headers=headers, json=payload, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["job_title"] == "TEST_Operator"
        assert data["bhp_valid_until"] == "2026-12-31"
        assert data["height_work_certified"] is True
        assert data["height_valid_until"] == "2026-06-30"

    def test_update_bhp_info_404(self, headers):
        r = requests.put(
            f"{BASE_URL}/api/employees/nonexistent-id-xyz/bhp-info",
            headers=headers, json={"job_title": "X"}, timeout=30,
        )
        assert r.status_code == 404


# ============= Documents =============
class TestDocuments:
    def test_upload_invalid_category(self, headers, employee_id):
        b64 = base64.b64encode(MIN_PDF_BYTES).decode()
        r = requests.post(
            f"{BASE_URL}/api/employees/{employee_id}/documents",
            headers=headers,
            json={"category": "bogus_cat", "file_name": "x.pdf", "file_data": b64},
            timeout=30,
        )
        assert r.status_code == 400
        assert "kategoria" in r.text.lower() or "kategori" in r.text.lower()

    def test_upload_too_large(self, headers, employee_id):
        # Build base64 longer than 14MB threshold
        big_b64 = "A" * (14 * 1024 * 1024 + 10)
        r = requests.post(
            f"{BASE_URL}/api/employees/{employee_id}/documents",
            headers=headers,
            json={"category": "inne", "file_name": "big.pdf", "file_data": big_b64},
            timeout=60,
        )
        assert r.status_code == 400
        assert "10MB" in r.text or "duzy" in r.text.lower()

    def test_upload_list_download_delete(self, headers, employee_id):
        b64 = base64.b64encode(MIN_PDF_BYTES).decode()
        # Upload
        r = requests.post(
            f"{BASE_URL}/api/employees/{employee_id}/documents",
            headers=headers,
            json={"category": "bhp_szkolenie", "file_name": "TEST_szkolenie.pdf", "file_data": b64},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["category"] == "bhp_szkolenie"
        assert doc["file_name"] == "TEST_szkolenie.pdf"
        assert "file_data" not in doc  # response strips heavy data
        assert doc["size_bytes"] > 0
        doc_id = doc["id"]

        # List
        r = requests.get(
            f"{BASE_URL}/api/employees/{employee_id}/documents",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200
        lst = r.json()
        assert any(d["id"] == doc_id for d in lst)
        for d in lst:
            assert "file_data" not in d  # heavy field excluded

        # Download
        r = requests.get(
            f"{BASE_URL}/api/employees/{employee_id}/documents/{doc_id}/download",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:5] == b"%PDF-"

        # Delete
        r = requests.delete(
            f"{BASE_URL}/api/employees/{employee_id}/documents/{doc_id}",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200

        # Verify gone
        r = requests.get(
            f"{BASE_URL}/api/employees/{employee_id}/documents/{doc_id}/download",
            headers=headers, timeout=30,
        )
        assert r.status_code == 404


# ============= Archive / restore =============
class TestArchive:
    def test_archive_and_restore(self, headers):
        # Pick an active employee that we don't actively need
        r = requests.get(f"{BASE_URL}/api/bhp/employees", headers=headers, timeout=30)
        assert r.status_code == 200
        active = [e for e in r.json() if not e.get("is_archived")]
        if not active:
            pytest.skip("Need at least 1 active employee")
        emp_id = active[-1]["id"]

        # Archive
        r = requests.post(
            f"{BASE_URL}/api/employees/{emp_id}/archive",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200

        # Verify in only_archived list
        r = requests.get(
            f"{BASE_URL}/api/bhp/employees?only_archived=true",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200
        assert any(e["id"] == emp_id for e in r.json())

        # Restore
        r = requests.post(
            f"{BASE_URL}/api/employees/{emp_id}/restore",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200

        # Verify back in active
        r = requests.get(f"{BASE_URL}/api/bhp/employees", headers=headers, timeout=30)
        assert any(e["id"] == emp_id for e in r.json())


# ============= Bulk download =============
class TestBulkDownload:
    @pytest.fixture(scope="class")
    def emp_with_docs(self, headers):
        r = requests.get(f"{BASE_URL}/api/bhp/employees", headers=headers, timeout=30)
        emps = r.json()
        emp_id = next((e["id"] for e in emps if not e.get("is_archived")), emps[0]["id"])
        b64 = base64.b64encode(MIN_PDF_BYTES).decode()
        # Upload 2 docs in different categories
        ids = []
        for cat in ("bhp_szkolenie", "badania_lekarskie"):
            r = requests.post(
                f"{BASE_URL}/api/employees/{emp_id}/documents",
                headers=headers,
                json={"category": cat, "file_name": f"TEST_{cat}.pdf", "file_data": b64},
                timeout=30,
            )
            assert r.status_code == 200, r.text
            ids.append(r.json()["id"])
        yield emp_id, ids
        # Cleanup
        for did in ids:
            requests.delete(f"{BASE_URL}/api/employees/{emp_id}/documents/{did}", headers=headers)

    def test_bulk_zip(self, headers, emp_with_docs):
        emp_id, _ = emp_with_docs
        r = requests.post(
            f"{BASE_URL}/api/bhp/documents/bulk-download",
            headers=headers,
            json={
                "employee_ids": [emp_id],
                "categories": ["bhp_szkolenie", "badania_lekarskie"],
                "format": "zip",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type") == "application/zip"
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = zf.namelist()
        assert len(names) == 2
        # Per-employee folder structure
        for n in names:
            assert "/" in n  # has folder

    def test_bulk_pdf_merged(self, headers, emp_with_docs):
        emp_id, _ = emp_with_docs
        r = requests.post(
            f"{BASE_URL}/api/bhp/documents/bulk-download",
            headers=headers,
            json={
                "employee_ids": [emp_id],
                "categories": ["bhp_szkolenie", "badania_lekarskie"],
                "format": "pdf",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type") == "application/pdf"
        assert r.content[:5] == b"%PDF-"

    def test_bulk_invalid_format(self, headers, emp_with_docs):
        emp_id, _ = emp_with_docs
        r = requests.post(
            f"{BASE_URL}/api/bhp/documents/bulk-download",
            headers=headers,
            json={"employee_ids": [emp_id], "categories": ["inne"], "format": "rar"},
            timeout=30,
        )
        assert r.status_code == 400

    def test_bulk_invalid_category(self, headers, emp_with_docs):
        emp_id, _ = emp_with_docs
        r = requests.post(
            f"{BASE_URL}/api/bhp/documents/bulk-download",
            headers=headers,
            json={"employee_ids": [emp_id], "categories": ["bogus"], "format": "zip"},
            timeout=30,
        )
        assert r.status_code == 400

    def test_bulk_no_docs_404(self, headers, emp_with_docs):
        emp_id, _ = emp_with_docs
        # 'inne' category is not uploaded
        r = requests.post(
            f"{BASE_URL}/api/bhp/documents/bulk-download",
            headers=headers,
            json={"employee_ids": [emp_id], "categories": ["inne"], "format": "zip"},
            timeout=30,
        )
        assert r.status_code == 404

    def test_bulk_pdf_with_non_pdf_file(self, headers):
        """Upload a non-PDF file, then try merged PDF -> should 400 with helpful msg."""
        r = requests.get(f"{BASE_URL}/api/bhp/employees", headers=headers, timeout=30)
        emps = r.json()
        emp_id = next((e["id"] for e in emps if not e.get("is_archived")), emps[0]["id"])
        # Plain text bytes (not a PDF)
        b64 = base64.b64encode(b"this is just plain text, not a PDF file").decode()
        r = requests.post(
            f"{BASE_URL}/api/employees/{emp_id}/documents",
            headers=headers,
            json={"category": "inne", "file_name": "TEST_notpdf.txt", "file_data": b64},
            timeout=30,
        )
        assert r.status_code == 200
        doc_id = r.json()["id"]
        try:
            r = requests.post(
                f"{BASE_URL}/api/bhp/documents/bulk-download",
                headers=headers,
                json={"employee_ids": [emp_id], "categories": ["inne"], "format": "pdf"},
                timeout=60,
            )
            assert r.status_code == 400, f"Expected 400 got {r.status_code}: {r.text[:200]}"
            assert "PDF" in r.text or "pdf" in r.text.lower()
        finally:
            requests.delete(f"{BASE_URL}/api/employees/{emp_id}/documents/{doc_id}", headers=headers)
