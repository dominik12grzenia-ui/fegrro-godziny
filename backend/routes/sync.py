from fastapi import APIRouter, Depends, BackgroundTasks
from datetime import datetime
import uuid
import os
import calendar
import asyncio
import logging

from database import db
from auth import get_current_admin
from onedrive import (
    read_excel_employees, read_excel_sites,
    write_hours_to_excel, write_advances_to_excel, write_penalties_to_excel,
    generate_hours_pdf, upload_pdf_to_onedrive
)
from utils import POLISH_MONTHS_LOWER, POLISH_MONTHS_TITLE

logger = logging.getLogger(__name__)

router = APIRouter()


# ============= EXCEL SYNC =============

@router.post("/sync/excel")
async def sync_excel_from_onedrive(
    background_tasks: BackgroundTasks,
    month: int = None,
    year: int = None,
    current_user: dict = Depends(get_current_admin)
):
    if month is None:
        month = datetime.now().month
    if year is None:
        year = datetime.now().year
    background_tasks.add_task(do_excel_sync, "manual", month, year)
    sheet_name = POLISH_MONTHS_LOWER.get(month, "styczeń")
    return {"message": f"Synchronizacja z arkusza '{sheet_name}' rozpoczeta w tle"}


@router.post("/sync/trigger")
async def trigger_sync(current_user: dict = Depends(get_current_admin)):
    return {"message": "Użyj /api/sync/excel aby zsynchronizować z OneDrive"}


async def do_excel_sync(trigger: str = "manual", month: int = None, year: int = None):
    try:
        file_name = os.environ.get("ONEDRIVE_EXCEL_FILE", "Wypłaty główny.xlsx")
        
        if month is None:
            month = datetime.now().month
        if year is None:
            year = datetime.now().year
        sheet_name = POLISH_MONTHS_LOWER.get(month, "styczeń")
        
        logger.info(f"Syncing from {file_name}, sheet: {sheet_name}")
        
        employees_from_excel = read_excel_employees(file_name, sheet_name, start_row=17)
        
        emp_synced = 0
        excel_names = set()
        month_key = f"{year}-{month:02d}"
        
        for emp_data in employees_from_excel:
            name = emp_data["name"]
            phone = emp_data.get("phone")
            excel_names.add(name)
            
            import re
            escaped_name = re.escape(name)
            existing = await db.employees.find_one({"full_name": {"$regex": f"^{escaped_name}$", "$options": "i"}})
            if not existing:
                existing = await db.employees.find_one({"full_name": name})
            if existing:
                update_fields = {"currently_active": True, "full_name": name}
                if phone and phone != existing.get("phone_number"):
                    update_fields["phone_number"] = phone
                await db.employees.update_one(
                    {"id": existing["id"]},
                    {"$set": update_fields, "$addToSet": {"active_months": month_key}}
                )
            else:
                emp_id = str(uuid.uuid4())
                parts = name.split(" ", 1)
                await db.employees.insert_one({
                    "id": emp_id,
                    "first_name": parts[0] if parts else name,
                    "last_name": parts[1] if len(parts) > 1 else "",
                    "full_name": name,
                    "phone_number": phone,
                    "currently_active": True,
                    "active_months": [month_key],
                    "assigned_sites": [],
                    "created_at": datetime.now().isoformat()
                })
                emp_synced += 1
        
        # Remove this month from employees NOT in Excel for this month
        emp_deactivated = 0
        excel_names_upper = {n.upper() for n in excel_names}
        all_emps = await db.employees.find({"active_months": month_key}, {"_id": 0, "id": 1, "full_name": 1}).to_list(5000)
        for emp in all_emps:
            if emp["full_name"].upper() not in excel_names_upper:
                await db.employees.update_one(
                    {"id": emp["id"]},
                    {"$pull": {"active_months": month_key}}
                )
                emp_deactivated += 1
        
        if emp_deactivated > 0:
            logger.info(f"Deactivated {emp_deactivated} employees not found in Excel")
        
        sites_from_excel = read_excel_sites(file_name, sheet_name)
        
        sites_synced = 0
        sites_updated = 0
        for site_data in sites_from_excel:
            site_name = site_data["name"]
            existing = await db.construction_sites.find_one({"excel_column": site_data["col_letter"]})
            if not existing:
                existing = await db.construction_sites.find_one({"name": site_name})
            
            if not existing:
                site_id = str(uuid.uuid4())
                await db.construction_sites.insert_one({
                    "id": site_id,
                    "name": site_name,
                    "location_lat": None,
                    "location_lng": None,
                    "google_maps_url": None,
                    "excel_column": site_data["col_letter"],
                    "is_active": True,
                    "created_at": datetime.now().isoformat()
                })
                sites_synced += 1
            else:
                await db.construction_sites.update_one(
                    {"id": existing["id"]},
                    {"$set": {"name": site_name, "excel_column": site_data["col_letter"]}}
                )
                sites_updated += 1
        
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "type": "excel_sync",
            "file_name": file_name,
            "sheet_name": sheet_name,
            "employees_found": len(employees_from_excel),
            "new_employees": emp_synced,
            "deactivated_employees": emp_deactivated,
            "sites_found": len(sites_from_excel),
            "new_sites": sites_synced,
            "sites_updated": sites_updated,
            "status": "success",
            "synced_at": datetime.now().isoformat(),
            "trigger": trigger
        })
        
        logger.info(f"Excel sync: {len(employees_from_excel)} employees ({emp_synced} new), {len(sites_from_excel)} sites ({sites_synced} new, {sites_updated} updated)")
        
    except Exception as e:
        logger.error(f"Excel sync failed: {e}")
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "type": "excel_sync",
            "status": "error",
            "error": str(e),
            "synced_at": datetime.now().isoformat(),
            "trigger": trigger
        })


# ============= WRITE HOURS TO EXCEL =============

@router.post("/sync/write-hours")
async def write_hours_to_excel_endpoint(
    month: int,
    year: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_admin)
):
    background_tasks.add_task(do_write_hours, month, year)
    return {"message": f"Zapisywanie godzin do Excela za {POLISH_MONTHS_LOWER.get(month, str(month))} {year} rozpoczete"}


async def do_write_hours(month: int, year: int, trigger: str = "manual"):
    try:
        file_name = os.environ.get("ONEDRIVE_EXCEL_FILE", "Wypłaty główny.xlsx")
        sheet_name = POLISH_MONTHS_LOWER.get(month, "styczeń")
        
        num_days = calendar.monthrange(year, month)[1]
        start_date = f"{year}-{month:02d}-01"
        end_date = f"{year}-{month:02d}-{num_days:02d}"
        
        hours = await db.hour_entries.find(
            {"work_date": {"$gte": start_date, "$lte": end_date}},
            {"_id": 0, "employee_id": 1, "site_id": 1, "hours_worked": 1}
        ).to_list(50000)
        
        employees = await db.employees.find({}, {"_id": 0, "id": 1, "full_name": 1}).to_list(1000)
        sites = await db.construction_sites.find({}, {"_id": 0, "id": 1, "name": 1, "excel_column": 1}).to_list(100)
        
        emp_map = {e["id"]: e["full_name"] for e in employees}
        
        # Build site_id -> excel_column mapping, use name as fallback
        site_excel_col = {}
        site_name_map = {}
        for s in sites:
            if s.get("excel_column"):
                site_excel_col[s["id"]] = s["excel_column"]
            site_name_map[s["id"]] = s["name"]
        
        sums = {}
        for entry in hours:
            emp_name = emp_map.get(entry["employee_id"])
            site_id = entry.get("site_id")
            if emp_name and site_id:
                # Try excel_column first, then site name
                site_key = site_excel_col.get(site_id) or site_name_map.get(site_id)
                if site_key:
                    key = (emp_name, site_key)
                    sums[key] = sums.get(key, 0) + entry["hours_worked"]
        
        updates = [
            {"employee_name": emp_name, "site_key": site_key, "hours_sum": hours_sum}
            for (emp_name, site_key), hours_sum in sums.items()
        ]
        
        logger.info(f"Writing {len(updates)} hour sums to Excel sheet '{sheet_name}'")
        result = write_hours_to_excel(file_name, sheet_name, updates)
        
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "type": "excel_write",
            "file_name": file_name,
            "sheet_name": sheet_name,
            "month": month,
            "year": year,
            "written": result["written"],
            "skipped": len(result["skipped"]),
            "skipped_details": result["skipped"][:10],
            "sites_in_excel": result["sites_found"],
            "status": "success",
            "synced_at": datetime.now().isoformat(),
            "trigger": trigger
        })
        
        logger.info(f"Excel write complete: {result['written']} cells written, {len(result['skipped'])} skipped")
        
    except Exception as e:
        logger.error(f"Excel write failed: {e}")
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "type": "excel_write",
            "status": "error",
            "error": str(e),
            "month": month,
            "year": year,
            "synced_at": datetime.now().isoformat(),
            "trigger": trigger
        })


# ============= WRITE ADVANCES TO EXCEL =============

@router.post("/advances/sync-excel")
async def sync_advances_to_excel(
    month: int,
    year: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_admin)
):
    background_tasks.add_task(do_write_advances, month, year)
    return {"message": "Zapisywanie zaliczek do Excela rozpoczete"}


async def do_write_advances(month: int, year: int):
    try:
        file_name = os.environ.get("ONEDRIVE_EXCEL_FILE", "Wypłaty główny.xlsx")
        sheet_name = POLISH_MONTHS_LOWER.get(month, "styczeń")
        
        advances = await db.advances.find(
            {"month": month, "year": year}, {"_id": 0}
        ).to_list(5000)
        
        employees = await db.employees.find({}, {"_id": 0, "id": 1, "full_name": 1}).to_list(1000)
        emp_map = {e["id"]: e["full_name"] for e in employees}
        
        adv_sums = {}
        for adv in advances:
            emp_name = emp_map.get(adv["employee_id"])
            if emp_name:
                adv_sums[emp_name] = adv_sums.get(emp_name, 0) + adv["amount"]
        
        updates = [{"employee_name": name, "amount": total} for name, total in adv_sums.items()]
        
        logger.info(f"Writing {len(updates)} advance sums to Excel column G, sheet '{sheet_name}'")
        result = write_advances_to_excel(file_name, sheet_name, updates)
        
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "type": "advances_write",
            "file_name": file_name,
            "sheet_name": sheet_name,
            "month": month,
            "year": year,
            "written": result["written"],
            "skipped": len(result["skipped"]),
            "status": "success",
            "synced_at": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Advances Excel write failed: {e}")
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "type": "advances_write",
            "status": "error",
            "error": str(e),
            "month": month,
            "year": year,
            "synced_at": datetime.now().isoformat()
        })


# ============= WRITE PENALTIES TO EXCEL =============

@router.post("/penalties/sync-excel")
async def sync_penalties_to_excel(
    month: int,
    year: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_admin)
):
    background_tasks.add_task(do_write_penalties, month, year)
    return {"message": "Zapisywanie kar do Excela rozpoczete"}


async def do_write_penalties(month: int, year: int):
    try:
        file_name = os.environ.get("ONEDRIVE_EXCEL_FILE", "Wypłaty główny.xlsx")
        sheet_name = POLISH_MONTHS_LOWER.get(month, "styczeń")
        
        penalties = await db.penalties.find(
            {"month": month, "year": year}, {"_id": 0}
        ).to_list(5000)
        
        employees = await db.employees.find({}, {"_id": 0, "id": 1, "full_name": 1}).to_list(1000)
        emp_map = {e["id"]: e["full_name"] for e in employees}
        
        pen_sums = {}
        for p in penalties:
            emp_name = emp_map.get(p["employee_id"])
            if emp_name:
                pen_sums[emp_name] = pen_sums.get(emp_name, 0) + p["amount"]
        
        updates = [{"employee_name": name, "amount": total} for name, total in pen_sums.items()]
        
        logger.info(f"Writing {len(updates)} penalty sums to Excel column H, sheet '{sheet_name}'")
        result = write_penalties_to_excel(file_name, sheet_name, updates)
        
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "type": "penalties_write",
            "file_name": file_name,
            "sheet_name": sheet_name,
            "month": month,
            "year": year,
            "written": result["written"],
            "skipped": len(result["skipped"]),
            "status": "success",
            "synced_at": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Penalties Excel write failed: {e}")
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "type": "penalties_write",
            "status": "error",
            "error": str(e),
            "month": month,
            "year": year,
            "synced_at": datetime.now().isoformat()
        })


# ============= PDF GENERATION & UPLOAD =============

@router.post("/reports/pdf")
async def generate_and_upload_pdf(
    month: int,
    year: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_admin)
):
    background_tasks.add_task(do_pdf_generation, month, year)
    return {"message": f"Generowanie PDF dla {month}/{year} rozpoczete"}


async def do_pdf_generation(month: int, year: int):
    try:
        month_name = POLISH_MONTHS_TITLE.get(month, str(month))
        
        num_days = calendar.monthrange(year, month)[1]
        start_date = f"{year}-{month:02d}-01"
        end_date = f"{year}-{month:02d}-{num_days:02d}"
        
        employees = await db.employees.find({"currently_active": True}, {"_id": 0}).to_list(1000)
        sites = await db.construction_sites.find({}, {"_id": 0}).to_list(100)
        hours = await db.hour_entries.find(
            {"work_date": {"$gte": start_date, "$lte": end_date}}, {"_id": 0}
        ).to_list(10000)
        assignments = await db.assignments.find({"year": year}, {"_id": 0}).to_list(10000)
        
        employees_data = []
        for emp in employees:
            emp_hours = [h for h in hours if h["employee_id"] == emp["id"]]
            site_hours = {}
            for site in sites:
                site_hours[site["id"]] = sum(
                    h["hours_worked"] for h in emp_hours if h.get("site_id") == site["id"]
                )
            employees_data.append({"name": emp["full_name"], "site_hours": site_hours})
        
        pdf_bytes = generate_hours_pdf(employees_data, month_name, year, sites)
        
        folder = os.environ.get("ONEDRIVE_ARCHIVE_FOLDER", "Archiwizacja")
        file_name = f"Raport_{month_name}_{year}.pdf"
        
        try:
            result = upload_pdf_to_onedrive(pdf_bytes, file_name, folder)
            logger.info(f"PDF uploaded: {result.get('name', file_name)}")
            
            await db.sync_logs.insert_one({
                "id": str(uuid.uuid4()),
                "type": "pdf_upload",
                "file_name": file_name,
                "folder": folder,
                "month": month,
                "year": year,
                "status": "success",
                "web_url": result.get("webUrl"),
                "synced_at": datetime.now().isoformat()
            })
        except Exception as upload_err:
            logger.error(f"PDF upload failed: {upload_err}")
            local_path = f"/tmp/{file_name}"
            with open(local_path, "wb") as f:
                f.write(pdf_bytes)
            
            await db.sync_logs.insert_one({
                "id": str(uuid.uuid4()),
                "type": "pdf_upload",
                "file_name": file_name,
                "status": "local_only",
                "error": str(upload_err),
                "local_path": local_path,
                "synced_at": datetime.now().isoformat()
            })
            
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "type": "pdf_generation",
            "status": "error",
            "error": str(e),
            "synced_at": datetime.now().isoformat()
        })


# ============= SYNC LOGS & CRON =============

@router.get("/sync/logs")
async def get_sync_logs(current_user: dict = Depends(get_current_admin)):
    logs = await db.sync_logs.find({}, {"_id": 0}).sort("synced_at", -1).to_list(20)
    return logs


_scheduler_ref = None

def set_scheduler(sched):
    global _scheduler_ref
    _scheduler_ref = sched


@router.get("/cron/status")
async def get_cron_status(current_user: dict = Depends(get_current_admin)):
    jobs = []
    if _scheduler_ref:
        monthly_job = _scheduler_ref.get_job("monthly_excel_write")
        if monthly_job:
            jobs.append({
                "job_id": "monthly_excel_write",
                "description": "Zapis godzin do Excela (2. dzien miesiaca, 02:00)",
                "next_run": monthly_job.next_run_time.isoformat() if monthly_job.next_run_time else None
            })
        daily_job = _scheduler_ref.get_job("daily_excel_sync")
        if daily_job:
            jobs.append({
                "job_id": "daily_excel_sync",
                "description": "Codzienny sync pracownikow i budow (06:00)",
                "next_run": daily_job.next_run_time.isoformat() if daily_job.next_run_time else None
            })
    return {"active": len(jobs) > 0, "jobs": jobs}


@router.post("/cron/trigger")
async def trigger_cron_manually(current_user: dict = Depends(get_current_admin)):
    asyncio.create_task(cron_write_hours_previous_month())
    now = datetime.now()
    if now.month == 1:
        prev_month, prev_year = 12, now.year - 1
    else:
        prev_month, prev_year = now.month - 1, now.year
    return {
        "message": f"Reczne uruchomienie crona: zapis godzin za {prev_month}/{prev_year}",
        "status": "triggered"
    }


async def cron_write_hours_previous_month():
    now = datetime.now()
    if now.month == 1:
        prev_month = 12
        prev_year = now.year - 1
    else:
        prev_month = now.month - 1
        prev_year = now.year

    logger.info(f"[CRON] Automatyczny zapis godzin za {prev_month}/{prev_year}")
    await do_write_hours(prev_month, prev_year, trigger="automatic")
    
    logger.info(f"[CRON] Automatyczny zapis zaliczek za {prev_month}/{prev_year}")
    await do_write_advances(prev_month, prev_year)
    
    logger.info(f"[CRON] Automatyczny zapis kar za {prev_month}/{prev_year}")
    await do_write_penalties(prev_month, prev_year)


async def cron_daily_sync():
    logger.info("[CRON] Codzienny sync pracownikow i budow z Excela")
    try:
        await do_excel_sync(trigger="automatic")
        logger.info("[CRON] Codzienny sync zakonczony pomyslnie")
    except Exception as e:
        logger.error(f"[CRON] Blad codziennego synca: {e}")
