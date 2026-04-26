from fastapi import APIRouter, Depends
from datetime import datetime
import calendar

from database import db
from auth import get_current_admin
from utils import POLISH_MONTHS_UPPER

router = APIRouter()


@router.get("/reports/monthly")
async def get_monthly_report(
    month: str,
    year: int,
    current_user: dict = Depends(get_current_admin)
):
    # Support both numeric and Polish month names
    try:
        month_num = int(month)
    except ValueError:
        month_num = POLISH_MONTHS_UPPER.get(month.upper(), 1)
    start_date = f"{year}-{month_num:02d}-01"
    end_date = f"{year}-{month_num:02d}-{calendar.monthrange(year, month_num)[1]}"
    
    entries = await db.hour_entries.find({
        "work_date": {"$gte": start_date, "$lte": end_date}
    }, {
        "_id": 0, "site_id": 1, "employee_id": 1, "hours_worked": 1, "work_date": 1
    }).to_list(5000)
    
    site_ids = list(set(e.get("site_id") for e in entries if e.get("site_id")))
    employee_ids = list(set(e["employee_id"] for e in entries))
    
    sites_list = await db.construction_sites.find(
        {"id": {"$in": site_ids}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(1000)
    sites_dict = {s["id"]: s for s in sites_list}
    
    employees_list = await db.employees.find(
        {"id": {"$in": employee_ids}}, {"_id": 0, "id": 1, "full_name": 1}
    ).to_list(1000)
    employees_dict = {e["id"]: e for e in employees_list}
    
    site_reports = {}
    for entry in entries:
        site_id = entry.get("site_id") or "unassigned"
        employee_id = entry["employee_id"]
        
        if site_id not in site_reports:
            site = sites_dict.get(site_id, {})
            site_reports[site_id] = {
                "site_name": site.get("name", "Unknown"),
                "employees": {},
                "total_hours": 0
            }
        
        if employee_id not in site_reports[site_id]["employees"]:
            employee = employees_dict.get(employee_id, {})
            site_reports[site_id]["employees"][employee_id] = {
                "full_name": employee.get("full_name", "Unknown"),
                "hours": 0
            }
        
        hours = entry.get("hours_worked", 0)
        site_reports[site_id]["employees"][employee_id]["hours"] += hours
        site_reports[site_id]["total_hours"] += hours
    
    report_list = []
    total_hours = 0
    for site_id, site_data in site_reports.items():
        employee_list = [
            {"employee_name": emp_data["full_name"], "hours": emp_data["hours"]}
            for emp_id, emp_data in site_data["employees"].items()
        ]
        report_list.append({
            "site_name": site_data["site_name"],
            "employees": employee_list,
            "site_total_hours": site_data["total_hours"]
        })
        total_hours += site_data["total_hours"]
    
    return {
        "month": month,
        "year": year,
        "site_reports": report_list,
        "total_hours": total_hours
    }


@router.get("/reports/pdf/download")
async def download_pdf_report(
    month: int,
    year: int,
    current_user: dict = Depends(get_current_admin)
):
    from fastapi.responses import Response
    from onedrive import generate_hours_pdf
    import calendar as cal
    from utils import POLISH_MONTHS_TITLE
    
    month_name = POLISH_MONTHS_TITLE.get(month, str(month))
    
    num_days = cal.monthrange(year, month)[1]
    start_date = f"{year}-{month:02d}-01"
    end_date = f"{year}-{month:02d}-{num_days:02d}"
    
    employees = await db.employees.find({"currently_active": True}, {"_id": 0}).to_list(1000)
    sites = await db.construction_sites.find({}, {"_id": 0}).to_list(100)
    hours = await db.hour_entries.find(
        {"work_date": {"$gte": start_date, "$lte": end_date}}, {"_id": 0}
    ).to_list(10000)
    
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
    safe_name = month_name.encode('ascii', 'replace').decode('ascii')
    file_name = f"Raport_{safe_name}_{year}.pdf"
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'}
    )
