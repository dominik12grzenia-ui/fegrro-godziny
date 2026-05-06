from fastapi import FastAPI, APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv
from pathlib import Path
import os
import logging
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import uuid
from database import db
from auth import get_password_hash

# Route modules
from routes.auth import router as auth_router
from routes.employees import router as employees_router
from routes.sites import router as sites_router
from routes.assignments import router as assignments_router
from routes.hours import router as hours_router
from routes.requests import router as requests_router
from routes.absences import router as absences_router
from routes.advances import router as advances_router
from routes.penalties import router as penalties_router
from routes.reports import router as reports_router
from routes.sync import router as sync_router, cron_write_hours_previous_month, cron_daily_sync, set_scheduler
from routes.public import router as public_router
from routes.equipment import router as equipment_router
from routes.equipment_orders import router as equipment_orders_router
from routes.clothing import router as clothing_router
from routes.bhp import router as bhp_router
from routes.warehouse import router as warehouse_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Include all route modules
api_router.include_router(auth_router)
api_router.include_router(employees_router)
api_router.include_router(sites_router)
api_router.include_router(assignments_router)
api_router.include_router(hours_router)
api_router.include_router(requests_router)
api_router.include_router(absences_router)
api_router.include_router(advances_router)
api_router.include_router(penalties_router)
api_router.include_router(reports_router)
api_router.include_router(sync_router)
api_router.include_router(public_router)
api_router.include_router(equipment_router)
api_router.include_router(equipment_orders_router)
api_router.include_router(clothing_router)
api_router.include_router(bhp_router)
api_router.include_router(warehouse_router)


# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat(), "version": "2026-04-11-v6-monthly-employees"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    # Permissive but bounded: any *.vercel.app and any *.fegrro.pl + the preview sandbox.
    # allow_credentials must be True for Authorization header, so we use regex (not "*").
    allow_origin_regex=r"https://([a-z0-9-]+\.)*(vercel\.app|fegrro\.pl|emergentagent\.com)",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["Content-Disposition"],
    max_age=600,
)

# GZip: compresses JSON responses >= 500 bytes (cuts payload ~70% for hours/equipment lists)
app.add_middleware(GZipMiddleware, minimum_size=500)


# Security headers - defense in depth. Cheap to apply and blocks common attack vectors.
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        # HSTS only meaningful over HTTPS; harmless on http (browsers ignore)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# ============= SCHEDULER (CRON) =============
scheduler = AsyncIOScheduler()


@app.on_event("startup")
async def startup_event():
    # Ensure critical indexes for faster queries (safe to call repeatedly)
    try:
        await db.equipment_assignments.create_index("foreman_id")
        await db.equipment_assignments.create_index("equipment_id")
        await db.equipment.create_index("category")
        await db.equipment_history.create_index("equipment_id")
        await db.equipment_transfers.create_index([("to_foreman_id", 1), ("status", 1)])
        await db.equipment_defects.create_index("foreman_id")
        await db.equipment_defects.create_index("status")
        await db.hour_entries.create_index([("employee_id", 1), ("work_date", 1)])
        await db.hour_entries.create_index("work_date")
        await db.assignments.create_index([("employee_id", 1), ("month", 1), ("year", 1)])
        await db.assignments.create_index("site_id")
        await db.clothing_orders.create_index([("employee_id", 1), ("clothing_type_id", 1)])
        await db.clothing_orders.create_index("status")
        await db.absences.create_index([("employee_id", 1), ("status", 1)])
        await db.employees.create_index("public_token")
        await db.users.create_index([("role", 1), ("email", 1)])
        await db.users.create_index("full_name")
        await db.inventory_checks.create_index([("status", 1), ("category", 1)])
        await db.inventory_checks.create_index("required_foremen")
        await db.inventory_shortages.create_index([("check_id", 1), ("status", 1)])
        await db.inventory_shortages.create_index("foreman_id")
        await db.equipment_orders.create_index([("status", 1), ("created_at", -1)])
        await db.equipment_orders.create_index("foreman_id")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")

    # Create admin user if not exists, or sync password from env if ADMIN_PASSWORD is set
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@fegrro.pl")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    force_reset = os.environ.get("ADMIN_PASSWORD_RESET", "").lower() in ("1", "true", "yes")

    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        admin_id = str(uuid.uuid4())
        admin_doc = {
            "id": admin_id,
            "full_name": "Administrator",
            "email": admin_email,
            "role": "admin",
            "hashed_password": get_password_hash(admin_password),
            "created_at": datetime.now().isoformat()
        }
        await db.users.insert_one(admin_doc)
        logger.info(f"Admin user created: {admin_email}")
    elif force_reset:
        # One-shot password reset: set ADMIN_PASSWORD_RESET=true on Render, deploy, then remove the flag
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"hashed_password": get_password_hash(admin_password)}}
        )
        logger.warning(f"Admin password reset from ADMIN_PASSWORD env for {admin_email}")

    # One-shot migration: reset admin password to "Admin123!" exactly once
    # Marker in DB ensures this runs at most once per installation.
    # TODO: remove this block after 2026-06 once the user has logged in successfully.
    migration_marker = "admin_pw_reset_2026_05_v1"
    already_run = await db.migrations.find_one({"name": migration_marker})
    if not already_run:
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"hashed_password": get_password_hash("Admin123!")}}
        )
        await db.migrations.insert_one({
            "name": migration_marker,
            "executed_at": datetime.now().isoformat()
        })
        logger.warning(f"One-shot: admin password for {admin_email} set to provided value")

    # Start the scheduler for automatic jobs
    scheduler.add_job(
        cron_write_hours_previous_month,
        CronTrigger(day=2, hour=2, minute=0),
        id="monthly_excel_write",
        replace_existing=True,
        misfire_grace_time=3600
    )
    scheduler.add_job(
        cron_daily_sync,
        CronTrigger(hour=6, minute=0),
        id="daily_excel_sync",
        replace_existing=True,
        misfire_grace_time=3600
    )
    scheduler.start()
    set_scheduler(scheduler)
    logger.info("[CRON] Scheduler: zapis godzin 2. dnia o 02:00 | sync codzienny o 06:00")


@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown(wait=False)
    from database import client
    client.close()
