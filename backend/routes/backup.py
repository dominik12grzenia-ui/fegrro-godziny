"""Auto-backup - codzienna kopia kolekcji finansowych w MongoDB.

iter95br: Pakiet D. Zapisuje snapshot kazdej kolekcji jako jeden dokument w `backups`
collection raz dziennie o 02:30 (po payroll cron).

Retencja: 30 dni. Starsze backupy automatycznie usuwane.

Endpointy:
- GET /api/backup/list           - lista backupow
- POST /api/backup/now           - manualny backup (admin only)
- GET /api/backup/download/{id}  - download jako JSON
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta
import uuid
import logging

from database import db
from auth import get_current_admin

router = APIRouter()
logger = logging.getLogger(__name__)


# Kolekcje do backupu (te najwazniejsze finansowe + audit)
BACKUP_COLLECTIONS = [
    "finance_zapisy", "finance_invoices", "finance_budowy", "finance_periods",
    "finance_kody", "budget_lines", "budget_categories", "budget_stages", "budget_positions",
    "wyceny", "wyceny_lines", "wyceny_stages", "wyceny_positions",
    "audit_log",
]


async def perform_backup() -> dict:
    """Wykonuje backup wszystkich kluczowych kolekcji. Zwraca metadata."""
    bid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    snapshot = {}
    total_docs = 0
    for cn in BACKUP_COLLECTIONS:
        docs = await db[cn].find({}, {"_id": 0}).to_list(length=None)
        snapshot[cn] = docs
        total_docs += len(docs)
    backup_doc = {
        "id": bid,
        "created_at": now,
        "collections": list(snapshot.keys()),
        "total_documents": total_docs,
        "snapshot": snapshot,
    }
    await db.backups.insert_one(backup_doc)
    # Retencja: kasuj backupy starsze niz 30 dni
    cutoff = now - timedelta(days=30)
    res = await db.backups.delete_many({"created_at": {"$lt": cutoff}})
    logger.info(f"Backup {bid} created: {total_docs} docs across {len(snapshot)} collections; retention removed {res.deleted_count}")
    return {
        "id": bid,
        "created_at": now.isoformat(),
        "total_documents": total_docs,
        "collections_count": len(snapshot),
        "retention_removed": res.deleted_count,
    }


@router.get("/backup/list")
async def list_backups(_user: dict = Depends(get_current_admin)):
    """Lista wszystkich backupow (bez snapshotu - tylko metadata)."""
    rows = await db.backups.find(
        {}, {"_id": 0, "snapshot": 0},
    ).sort([("created_at", -1)]).to_list(length=100)
    return {"rows": rows}


@router.post("/backup/now")
async def trigger_backup(_user: dict = Depends(get_current_admin)):
    """Manualny backup na zadanie admina."""
    meta = await perform_backup()
    return meta


@router.get("/backup/download/{backup_id}")
async def download_backup(backup_id: str, _user: dict = Depends(get_current_admin)):
    """Pelny backup z zawartoscia (JSON)."""
    doc = await db.backups.find_one({"id": backup_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Backup nie znaleziony")
    # Konwersja datetime → ISO
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc
