"""BHP items routes.

Admin manages a catalog of BHP items (e.g. szelki, kask, rękawice) and
records issuances to individual employees. One record per physical piece.
Also: employee BHP info (job_title, validity dates) and document storage (PDFs).
"""
import base64
import io
import re
import zipfile
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response
from datetime import datetime, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field
import uuid

from database import db
from auth import get_current_admin, get_current_admin_or_warehouse

router = APIRouter()


# Document categories (kept as string constants for flexibility)
DOC_CATEGORIES = {
    "bhp_szkolenie": "Szkolenie BHP",
    "badania_lekarskie": "Badania lekarskie",
    "uprawnienia_hakowy": "Uprawnienia hakowy",
    "uprawnienia_sygnalista": "Uprawnienia sygnalista",
    "badanie_wysokosciowe": "Badanie wysokosciowe",
    "inne": "Inne",
}

_PL_FILE_MAP = {
    "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
    "ó": "o", "ś": "s", "ź": "z", "ż": "z",
    "Ą": "A", "Ć": "C", "Ę": "E", "Ł": "L", "Ń": "N",
    "Ó": "O", "Ś": "S", "Ź": "Z", "Ż": "Z",
    " ": "_",
}


def _safe_filename(text: str) -> str:
    s = str(text or "unknown")
    for k, v in _PL_FILE_MAP.items():
        s = s.replace(k, v)
    return re.sub(r"[^A-Za-z0-9_\-\.]", "", s)[:80] or "file"


# ============= Schemas =============
class BhpItemCreate(BaseModel):
    name: str
    photo: Optional[str] = None  # base64


class BhpItemUpdate(BaseModel):
    name: Optional[str] = None
    photo: Optional[str] = None
    is_active: Optional[bool] = None


class BhpIssuanceCreate(BaseModel):
    employee_id: str
    bhp_item_id: str
    quantity: int = Field(ge=1, default=1)
    serial_number: Optional[str] = None
    note: Optional[str] = None


class BhpIssuanceUpdate(BaseModel):
    quantity: Optional[int] = Field(default=None, ge=1)
    serial_number: Optional[str] = None
    note: Optional[str] = None


# ============= Items CRUD =============
@router.get("/bhp/items")
async def list_items(current_user: dict = Depends(get_current_admin_or_warehouse)):
    items = await db.bhp_items.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return items


@router.post("/bhp/items")
async def create_item(payload: BhpItemCreate,
                       current_user: dict = Depends(get_current_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "photo": payload.photo,
        "is_active": True,
        "created_at": datetime.now().isoformat(),
    }
    await db.bhp_items.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/bhp/items/{item_id}")
async def update_item(item_id: str, payload: BhpItemUpdate,
                       current_user: dict = Depends(get_current_admin)):
    update_doc = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_doc:
        raise HTTPException(status_code=400, detail="Brak pol do aktualizacji")
    if "name" in update_doc:
        update_doc["name"] = update_doc["name"].strip()
    result = await db.bhp_items.update_one({"id": item_id}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pozycja nie znaleziona")
    doc = await db.bhp_items.find_one({"id": item_id}, {"_id": 0})
    return doc


@router.delete("/bhp/items/{item_id}")
async def delete_item(item_id: str,
                       current_user: dict = Depends(get_current_admin)):
    # Delete item + all its issuances
    result = await db.bhp_items.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pozycja nie znaleziona")
    await db.bhp_issuances.delete_many({"bhp_item_id": item_id})
    return {"message": "Pozycja usunieta"}


# ============= Issuances =============
@router.get("/bhp/issuances")
async def list_issuances(current_user: dict = Depends(get_current_admin_or_warehouse)):
    """Returns flat list of issuances. Admin UI groups them by item or by employee."""
    items = await db.bhp_issuances.find({}, {"_id": 0}).sort("issued_at", -1).to_list(5000)
    return items


@router.post("/bhp/issuances")
async def create_issuance(payload: BhpIssuanceCreate,
                           current_user: dict = Depends(get_current_admin_or_warehouse)):
    emp = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0, "id": 1, "full_name": 1})
    if not emp:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")
    item = await db.bhp_items.find_one({"id": payload.bhp_item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Rzecz BHP nie znaleziona")

    doc = {
        "id": str(uuid.uuid4()),
        "employee_id": emp["id"],
        "employee_name": emp["full_name"],
        "bhp_item_id": item["id"],
        "bhp_item_name": item["name"],
        "quantity": int(payload.quantity),
        "serial_number": (payload.serial_number or "").strip() or None,
        "note": (payload.note or "").strip() or None,
        "issued_at": datetime.now().isoformat(),
        "issued_by": current_user["sub"],
    }
    await db.bhp_issuances.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/bhp/issuances/{issuance_id}")
async def update_issuance(issuance_id: str, payload: BhpIssuanceUpdate,
                           current_user: dict = Depends(get_current_admin)):
    update_doc = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_doc:
        raise HTTPException(status_code=400, detail="Brak pol do aktualizacji")
    if "serial_number" in update_doc:
        update_doc["serial_number"] = (update_doc["serial_number"] or "").strip() or None
    if "note" in update_doc:
        update_doc["note"] = (update_doc["note"] or "").strip() or None
    result = await db.bhp_issuances.update_one({"id": issuance_id}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Wydanie nie znalezione")
    doc = await db.bhp_issuances.find_one({"id": issuance_id}, {"_id": 0})
    return doc


@router.delete("/bhp/issuances/{issuance_id}")
async def delete_issuance(issuance_id: str,
                           current_user: dict = Depends(get_current_admin)):
    result = await db.bhp_issuances.delete_one({"id": issuance_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Wydanie nie znalezione")
    return {"message": "Wydanie usuniete"}


# ============= Employee BHP info =============
class EmployeeBhpInfoUpdate(BaseModel):
    job_title: Optional[str] = None
    registered_at: Optional[str] = None  # ISO date
    bhp_valid_until: Optional[str] = None
    height_work_certified: Optional[bool] = None
    height_valid_until: Optional[str] = None
    # HR
    pesel: Optional[str] = None
    permit_type: Optional[str] = None
    permit_valid_until: Optional[str] = None
    legal_stay_until: Optional[str] = None
    company_name: Optional[str] = None
    employment_fraction: Optional[str] = None  # "1/4"|"1/2"|"1/1"


@router.put("/employees/{employee_id}/bhp-info")
async def update_employee_bhp_info(
    employee_id: str,
    payload: EmployeeBhpInfoUpdate,
    current_user: dict = Depends(get_current_admin),
):
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")
    if payload.employment_fraction is not None and payload.employment_fraction not in ("", "1/4", "1/2", "1/1"):
        raise HTTPException(status_code=400, detail="Nieprawidlowa wielkosc etatu (1/4, 1/2 lub 1/1)")
    update_doc = {}
    payload_data = payload.model_dump(exclude_unset=True)
    for k, v in payload_data.items():
        if v == "":
            update_doc[k] = None
        else:
            update_doc[k] = v
    if not update_doc:
        raise HTTPException(status_code=400, detail="Brak pol do aktualizacji")
    update_doc["updated_at"] = datetime.now().isoformat()
    await db.employees.update_one({"id": employee_id}, {"$set": update_doc})
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    return emp


# ============= Archive / restore =============
@router.post("/employees/{employee_id}/archive")
async def archive_employee(
    employee_id: str,
    current_user: dict = Depends(get_current_admin),
):
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0, "id": 1})
    if not emp:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")
    await db.employees.update_one(
        {"id": employee_id},
        {"$set": {
            "is_archived": True,
            "archived_at": datetime.now().isoformat(),
            "currently_active": False,
        }},
    )
    return {"message": "Zarchiwizowano"}


@router.post("/employees/{employee_id}/restore")
async def restore_employee(
    employee_id: str,
    current_user: dict = Depends(get_current_admin),
):
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0, "id": 1})
    if not emp:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")
    await db.employees.update_one(
        {"id": employee_id},
        {"$set": {"is_archived": False, "archived_at": None}},
    )
    return {"message": "Przywrocono"}


@router.delete("/employees/{employee_id}/hard")
async def hard_delete_employee(
    employee_id: str,
    current_user: dict = Depends(get_current_admin),
):
    """Permanently delete an archived employee + all related records.
    Guarded: only allowed when employee.is_archived == True.
    """
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0, "id": 1, "is_archived": 1, "full_name": 1})
    if not emp:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")
    if not emp.get("is_archived"):
        raise HTTPException(
            status_code=400,
            detail="Mozna trwale usunac tylko zarchiwizowanego pracownika - najpierw archiwizuj",
        )
    # Cascade delete
    await db.employee_documents.delete_many({"employee_id": employee_id})
    await db.bhp_issuances.delete_many({"employee_id": employee_id})
    await db.clothing_orders.delete_many({"employee_id": employee_id})
    await db.notifications.delete_many({"employee_id": employee_id})
    await db.employees.delete_one({"id": employee_id})
    return {"message": "Pracownik trwale usuniety"}


# ============= Documents CRUD =============
class DocumentCreate(BaseModel):
    category: str
    file_name: str
    file_data: str  # base64 (may include data: prefix)
    valid_until: Optional[str] = None  # ISO date - termin waznosci dokumentu
    is_height_related: Optional[bool] = None  # czy dokument dotyczy badan wysokosciowych


@router.get("/employees/{employee_id}/documents")
async def list_documents(
    employee_id: str,
    current_user: dict = Depends(get_current_admin),
):
    docs = await db.employee_documents.find(
        {"employee_id": employee_id},
        {"_id": 0, "file_data": 0},
    ).sort("uploaded_at", -1).to_list(500)
    return docs


@router.post("/employees/{employee_id}/documents")
async def upload_document(
    employee_id: str,
    payload: DocumentCreate,
    current_user: dict = Depends(get_current_admin),
):
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0, "full_name": 1})
    if not emp:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")
    if payload.category not in DOC_CATEGORIES:
        raise HTTPException(status_code=400, detail="Nieprawidlowa kategoria")
    raw_b64 = payload.file_data
    if "," in raw_b64 and raw_b64.startswith("data:"):
        raw_b64 = raw_b64.split(",", 1)[1]
    if len(raw_b64) > 14 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Plik za duzy (max 10MB)")
    try:
        decoded = base64.b64decode(raw_b64, validate=False)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Nieprawidlowy plik")
    size_bytes = len(decoded)

    doc = {
        "id": str(uuid.uuid4()),
        "employee_id": employee_id,
        "category": payload.category,
        "file_name": payload.file_name.strip() or "document.pdf",
        "file_data": raw_b64,
        "size_bytes": size_bytes,
        "valid_until": (payload.valid_until or "").strip() or None,
        "is_height_related": bool(payload.is_height_related) if payload.is_height_related is not None else None,
        "uploaded_at": datetime.now().isoformat(),
        "uploaded_by": current_user["sub"],
    }
    await db.employee_documents.insert_one(doc)
    doc.pop("file_data", None)
    doc.pop("_id", None)
    return doc


@router.get("/employees/{employee_id}/documents/{doc_id}/download")
async def download_document(
    employee_id: str,
    doc_id: str,
    current_user: dict = Depends(get_current_admin),
):
    doc = await db.employee_documents.find_one({"id": doc_id, "employee_id": employee_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    try:
        content = base64.b64decode(doc["file_data"], validate=False)
    except (ValueError, TypeError):
        raise HTTPException(status_code=500, detail="Plik uszkodzony")
    fname = _safe_filename(doc.get("file_name") or "document.pdf")
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.delete("/employees/{employee_id}/documents/{doc_id}")
async def delete_document(
    employee_id: str,
    doc_id: str,
    current_user: dict = Depends(get_current_admin),
):
    result = await db.employee_documents.delete_one({"id": doc_id, "employee_id": employee_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    return {"message": "Usunieto"}


# ============= Employees listing with filters (for BHP tab) =============
@router.get("/bhp/employees")
async def list_employees_for_bhp(
    include_archived: bool = Query(False),
    only_archived: bool = Query(False),
    site_id: Optional[str] = Query(None),
    assigned_on_date: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_admin),
):
    query: dict = {}
    if only_archived:
        query["is_archived"] = True
    elif not include_archived:
        query["$or"] = [{"is_archived": {"$exists": False}}, {"is_archived": False}]

    if site_id:
        query["assigned_sites"] = site_id

    employees = await db.employees.find(
        query, {"_id": 0}
    ).sort("full_name", 1).to_list(5000)

    # Attach document counts (single aggregation)
    emp_ids = [e["id"] for e in employees]
    counts_by_emp: dict = {}
    if emp_ids:
        cursor = db.employee_documents.aggregate([
            {"$match": {"employee_id": {"$in": emp_ids}}},
            {"$group": {
                "_id": {"emp": "$employee_id", "cat": "$category"},
                "count": {"$sum": 1},
            }},
        ])
        async for row in cursor:
            emp = row["_id"]["emp"]
            cat = row["_id"]["cat"]
            counts_by_emp.setdefault(emp, {})[cat] = row["count"]

    for e in employees:
        e["documents_by_category"] = counts_by_emp.get(e["id"], {})
        e["documents_total"] = sum(counts_by_emp.get(e["id"], {}).values())

    return employees


# ============= Bulk download =============
class BulkDownloadPayload(BaseModel):
    employee_ids: List[str] = Field(min_length=1)
    categories: List[str] = Field(min_length=1)
    format: str = Field(default="zip")


@router.post("/bhp/documents/bulk-download")
async def bulk_download(
    payload: BulkDownloadPayload,
    current_user: dict = Depends(get_current_admin),
):
    if payload.format not in ("zip", "pdf"):
        raise HTTPException(status_code=400, detail="format must be zip or pdf")
    invalid = [c for c in payload.categories if c not in DOC_CATEGORIES]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Nieprawidlowe kategorie: {invalid}")

    emps = await db.employees.find(
        {"id": {"$in": payload.employee_ids}},
        {"_id": 0, "id": 1, "full_name": 1},
    ).to_list(5000)
    emp_names = {e["id"]: e["full_name"] for e in emps}

    docs = await db.employee_documents.find(
        {"employee_id": {"$in": payload.employee_ids}, "category": {"$in": payload.categories}},
        {"_id": 0},
    ).to_list(5000)

    if not docs:
        raise HTTPException(status_code=404, detail="Brak dokumentow do pobrania")

    ts = datetime.now().strftime("%Y%m%d_%H%M")

    if payload.format == "zip":
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for doc in docs:
                try:
                    content = base64.b64decode(doc["file_data"], validate=False)
                except (ValueError, TypeError):
                    continue
                emp_name = emp_names.get(doc["employee_id"], "unknown")
                cat_label = _safe_filename(DOC_CATEGORIES.get(doc["category"], doc["category"]))
                safe_emp = _safe_filename(emp_name)
                orig_name = _safe_filename(doc.get("file_name") or "doc.pdf")
                path = f"{safe_emp}/{cat_label}_{orig_name}"
                suffix = 1
                final_path = path
                while final_path in zf.namelist():
                    if "." in final_path:
                        root, ext = final_path.rsplit(".", 1)
                        final_path = f"{root}_{suffix}.{ext}"
                    else:
                        final_path = f"{final_path}_{suffix}"
                    suffix += 1
                zf.writestr(final_path, content)
        buf.seek(0)
        filename = f"dokumenty_bhp_{ts}.zip"
        return Response(
            content=buf.getvalue(),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # format == "pdf" -> merge all PDFs
    try:
        from pypdf import PdfWriter, PdfReader
    except ImportError:
        raise HTTPException(status_code=500, detail="pypdf not installed")

    writer = PdfWriter()
    added = 0
    cat_order = {c: i for i, c in enumerate(DOC_CATEGORIES.keys())}
    docs_sorted = sorted(
        docs,
        key=lambda d: (
            (emp_names.get(d["employee_id"], "") or "").lower(),
            cat_order.get(d.get("category"), 99),
            d.get("uploaded_at", ""),
        ),
    )
    for doc in docs_sorted:
        try:
            content = base64.b64decode(doc["file_data"], validate=False)
            reader = PdfReader(io.BytesIO(content))
            for page in reader.pages:
                writer.add_page(page)
            added += 1
        except Exception:
            continue
    if added == 0:
        raise HTTPException(
            status_code=400,
            detail="Zadne z wybranych dokumentow nie jest prawidlowym PDF - uzyj formatu ZIP",
        )

    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    filename = f"dokumenty_bhp_{ts}.pdf"
    return Response(
        content=out.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============= Notification hook (called from sync) =============
async def notify_employee_missing_from_excel(employee_id: str, employee_name: str, month_key: str):
    """Insert a notification; called by Excel sync when employee is not present."""
    notif = {
        "id": str(uuid.uuid4()),
        "type": "employee_missing_excel",
        "title": f"Pracownik zniknal z Excela: {employee_name}",
        "message": f"{employee_name} nie wystapil w arkuszu {month_key}. Rozwaz archiwizacje w zakladce BHP.",
        "employee_id": employee_id,
        "status": "unread",
        "created_at": datetime.now().isoformat(),
    }
    try:
        await db.notifications.insert_one(notif)
    except Exception:
        pass



# ============= Expiration alerts =============
@router.get("/bhp/alerts")
async def bhp_alerts(
    days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_admin),
):
    """Returns employees with expirations within `days` days (or already expired).
    Includes: bhp_valid_until, height_valid_until, permit_valid_until, legal_stay_until
    + per-document valid_until.
    """
    today = datetime.now().date()
    cutoff = today + timedelta(days=days)
    cutoff_iso = cutoff.isoformat()
    today_iso = today.isoformat()

    # Only consider non-archived employees
    employees = await db.employees.find(
        {"$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}]},
        {"_id": 0},
    ).to_list(5000)

    out_employee_alerts = []
    emp_ids = []
    for e in employees:
        alerts = []
        for field, label in [
            ("bhp_valid_until", "BHP"),
            ("permit_valid_until", "Zezwolenie"),
            ("legal_stay_until", "Legalny pobyt"),
        ]:
            d = (e.get(field) or "").strip()
            if d and d <= cutoff_iso:
                alerts.append({
                    "field": field,
                    "label": label,
                    "valid_until": d,
                    "expired": d < today_iso,
                })
        if e.get("height_work_certified"):
            d = (e.get("height_valid_until") or "").strip()
            if d and d <= cutoff_iso:
                alerts.append({
                    "field": "height_valid_until",
                    "label": "Wysokosciowe",
                    "valid_until": d,
                    "expired": d < today_iso,
                })
        if alerts:
            out_employee_alerts.append({
                "employee_id": e["id"],
                "employee_name": e["full_name"],
                "alerts": alerts,
            })
        emp_ids.append(e["id"])

    # Per-document expirations
    docs = await db.employee_documents.find(
        {
            "employee_id": {"$in": emp_ids},
            "valid_until": {"$ne": None, "$lte": cutoff_iso},
        },
        {"_id": 0, "file_data": 0},
    ).to_list(5000)
    emp_name_by_id = {e["id"]: e["full_name"] for e in employees}
    out_doc_alerts = [
        {
            "employee_id": d.get("employee_id"),
            "employee_name": emp_name_by_id.get(d.get("employee_id"), "?"),
            "document_id": d.get("id"),
            "category": d.get("category"),
            "category_label": DOC_CATEGORIES.get(d.get("category"), d.get("category")),
            "file_name": d.get("file_name"),
            "valid_until": d.get("valid_until"),
            "is_height_related": d.get("is_height_related"),
            "expired": (d.get("valid_until") or "") < today_iso,
        }
        for d in docs
    ]

    return {
        "today": today_iso,
        "cutoff": cutoff_iso,
        "days_window": days,
        "employees": out_employee_alerts,
        "documents": out_doc_alerts,
    }

