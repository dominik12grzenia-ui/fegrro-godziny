"""Wyplaty (Payroll) - per pracownik / per miesiac.

Karteczka do koperty zawiera:
- imie i nazwisko, godziny x stawka = kwota_godzin
- zaliczki (w godzinach -> zl = godziny x stawka)
- kary -, mieszkanie -, inne -
- dodatki +, kierowca +, inne +
- = wyplata calos

Dodatkowo widok admina pokazuje rozpiske godzin per budowa, ale rozpiska NIE
trafia na karteczke (tylko sumaryczne pozycje).
"""
import io
import logging
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from fastapi.responses import StreamingResponse
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

from database import db
from auth import get_current_admin
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

router = APIRouter()
logger = logging.getLogger(__name__)


# ============= Models =============
class PayrollRecord(BaseModel):
    rate: Optional[float] = Field(default=0.0)  # zl/h
    is_fixed_salary: Optional[bool] = Field(default=False)  # stala pensja - kwota dzielona przez godziny
    fixed_salary_amount: Optional[float] = Field(default=0.0)  # gdy is_fixed_salary -> kwota wpisana zamiast rate*godziny
    advances_hours: Optional[float] = Field(default=0.0)  # zaliczki w godzinach
    penalties_zl: Optional[float] = Field(default=0.0)
    other_minus_zl: Optional[float] = Field(default=0.0)
    bonus_zl: Optional[float] = Field(default=0.0)  # dodatki + plus
    driver_zl: Optional[float] = Field(default=0.0)
    other_plus_zl: Optional[float] = Field(default=0.0)


def _calc(hours: float, rec: dict) -> dict:
    rate = float(rec.get("rate") or 0)
    is_fixed = bool(rec.get("is_fixed_salary") or False)
    fixed_amt = float(rec.get("fixed_salary_amount") or 0)
    adv_h = float(rec.get("advances_hours") or 0)
    pen = float(rec.get("penalties_zl") or 0)
    o_minus = float(rec.get("other_minus_zl") or 0)
    bonus = float(rec.get("bonus_zl") or 0)
    driver = float(rec.get("driver_zl") or 0)
    o_plus = float(rec.get("other_plus_zl") or 0)
    if is_fixed:
        # Kwota godzin = wpisana stala pensja; stawka_eff = pensja / godziny
        hours_amount = round(fixed_amt, 2)
        rate_eff = round(fixed_amt / hours, 2) if hours > 0 else 0.0
    else:
        hours_amount = round(hours * rate, 2)
        rate_eff = round(rate, 2)
    advances_zl = round(adv_h * rate_eff, 2)
    payout = round(hours_amount - advances_zl - pen - o_minus + bonus + driver + o_plus, 2)
    return {
        "hours_amount": hours_amount,
        "advances_zl": advances_zl,
        "rate_effective": rate_eff,
        "payout": payout,
    }


# ============= GET wyplaty (admin) =============
@router.get("/payroll")
async def list_payroll(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    current_user: dict = Depends(get_current_admin),
):
    """Lista wyplat per pracownik dla wybranego miesiaca/roku.

    Returns: [{employee_id, full_name, total_hours, sites_breakdown[],
               record:{...}, computed:{hours_amount, advances_zl, payout}}]
    Pracownicy zarchiwizowani i bez godzin NIE sa pomijani jezeli maja zapisane
    pola payroll (np. premia bez godzin). Sortowane A-Z.
    """
    # Aktywni pracownicy
    emps = await db.employees.find(
        {"$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}]},
        {"_id": 0, "id": 1, "full_name": 1},
    ).sort("full_name", 1).to_list(1000)

    start = f"{year:04d}-{month:02d}-01"
    end_day = 31
    end = f"{year:04d}-{month:02d}-{end_day:02d}"

    # Agregacja godzin per (employee, site)
    pipeline = [
        {"$match": {"work_date": {"$gte": start, "$lte": end}}},
        {"$group": {
            "_id": {"emp": "$employee_id", "site": "$site_id"},
            "total": {"$sum": "$hours"},
        }},
    ]
    breakdown_map: dict = {}  # emp_id -> {site_id: hours}
    async for row in db.hour_entries.aggregate(pipeline):
        emp = row["_id"].get("emp")
        site = row["_id"].get("site")
        if not emp:
            continue
        breakdown_map.setdefault(emp, {})[site] = float(row.get("total") or 0)

    # Mapowanie nazw budow
    site_ids = set()
    for sites in breakdown_map.values():
        site_ids.update(sites.keys())
    sites_docs = await db.sites.find(
        {"id": {"$in": [s for s in site_ids if s]}},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(1000)
    site_name_map = {s["id"]: s.get("name") for s in sites_docs}

    # Payroll records
    records = await db.payroll_records.find(
        {"year": year, "month": month},
        {"_id": 0},
    ).to_list(2000)
    rec_map = {r["employee_id"]: r for r in records}

    result = []
    for emp in emps:
        emp_id = emp["id"]
        sites_hours = breakdown_map.get(emp_id, {})
        total_hours = round(sum(sites_hours.values()), 2)
        sites_breakdown = sorted(
            [
                {"site_id": sid, "site_name": site_name_map.get(sid) or "(bez budowy)",
                 "hours": round(h, 2)}
                for sid, h in sites_hours.items()
            ],
            key=lambda x: -x["hours"],
        )
        rec = rec_map.get(emp_id, {})
        computed = _calc(total_hours, rec)
        result.append({
            "employee_id": emp_id,
            "full_name": emp.get("full_name"),
            "total_hours": total_hours,
            "sites_breakdown": sites_breakdown,
            "record": {
                "rate": float(rec.get("rate") or 0),
                "is_fixed_salary": bool(rec.get("is_fixed_salary") or False),
                "fixed_salary_amount": float(rec.get("fixed_salary_amount") or 0),
                "advances_hours": float(rec.get("advances_hours") or 0),
                "penalties_zl": float(rec.get("penalties_zl") or 0),
                "other_minus_zl": float(rec.get("other_minus_zl") or 0),
                "bonus_zl": float(rec.get("bonus_zl") or 0),
                "driver_zl": float(rec.get("driver_zl") or 0),
                "other_plus_zl": float(rec.get("other_plus_zl") or 0),
            },
            "computed": computed,
        })

    totals = {
        "total_hours": round(sum(r["total_hours"] for r in result), 2),
        "total_hours_amount": round(sum(r["computed"]["hours_amount"] for r in result), 2),
        "total_payout": round(sum(r["computed"]["payout"] for r in result), 2),
    }
    return {"year": year, "month": month, "rows": result, "totals": totals}


# ============= PUT zapis payroll fields =============
@router.put("/payroll/{employee_id}")
async def update_payroll(
    employee_id: str,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    payload: PayrollRecord = Body(...),
    current_user: dict = Depends(get_current_admin),
):
    raw = payload.model_dump(exclude_unset=True)
    update = {}
    for k, v in raw.items():
        if k == "is_fixed_salary":
            update[k] = bool(v)
        else:
            update[k] = float(v or 0)
    update.update({
        "employee_id": employee_id,
        "year": year,
        "month": month,
        "updated_at": datetime.now().isoformat(),
        "updated_by": current_user["sub"],
    })
    await db.payroll_records.update_one(
        {"employee_id": employee_id, "year": year, "month": month},
        {"$set": update},
        upsert=True,
    )
    return {"message": "Zapisano", "employee_id": employee_id, "year": year, "month": month}


# ============= POST PDF =============
class PdfRequest(BaseModel):
    employee_ids: Optional[List[str]] = None  # None = wszyscy


_POLISH_MONTHS = [
    "", "styczen", "luty", "marzec", "kwiecien", "maj", "czerwiec",
    "lipiec", "sierpien", "wrzesien", "pazdziernik", "listopad", "grudzien"
]


def _try_register_font():
    """Try to register a font that supports Polish chars. Fallback to Helvetica."""
    # Try DejaVu (Linux), then Vera (bundled in reportlab), then Helvetica fallback
    options = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/root/.venv/lib/python3.11/site-packages/reportlab/fonts/Vera.ttf",
         "/root/.venv/lib/python3.11/site-packages/reportlab/fonts/VeraBd.ttf"),
    ]
    for reg_path, bold_path in options:
        try:
            if os.path.exists(reg_path) and os.path.exists(bold_path):
                pdfmetrics.registerFont(TTFont("WC-Reg", reg_path))
                pdfmetrics.registerFont(TTFont("WC-Bold", bold_path))
                return ("WC-Reg", "WC-Bold")
        except Exception as e:
            logger.warning(f"Font registration failed for {reg_path}: {e}")
    return ("Helvetica", "Helvetica-Bold")


def _draw_card(c, x, y, w, h, employee: dict, year: int, month: int, fonts):
    """Rysuje pojedyncza karteczke wyplaty w prostokacie (x,y)-(x+w,y+h)."""
    f_reg, f_bold = fonts
    pad = 4 * mm
    # Ramka
    c.setLineWidth(0.6)
    c.rect(x, y, w, h)
    # Naglowek: nazwisko + miesiac
    c.setFont(f_bold, 11)
    name = (employee.get("full_name") or "").upper()[:32]
    c.drawString(x + pad, y + h - pad - 9, name)
    c.setFont(f_reg, 8)
    period = f"{_POLISH_MONTHS[month]} {year}".capitalize()
    c.drawRightString(x + w - pad, y + h - pad - 9, period)

    # Linie pozycji
    rec = employee.get("record", {})
    comp = employee.get("computed", {})
    hours = employee.get("total_hours", 0)
    rate = float(comp.get("rate_effective") or rec.get("rate") or 0)
    is_fixed = bool(rec.get("is_fixed_salary"))

    lines = [
        ("Godziny", f"{hours:g} h", "X"),
        ("Stawka" + (" (st.)" if is_fixed else ""), f"{rate:.2f} zl", "="),
        ("Kwota godzin", f"{comp.get('hours_amount', 0):.2f} zl", ""),
        ("Zaliczki -", f"{comp.get('advances_zl', 0):.2f} zl", ""),
        ("Kary -", f"{rec.get('penalties_zl', 0):.2f} zl", ""),
        ("Dodatki +", f"{rec.get('bonus_zl', 0):.2f} zl", ""),
        ("Kierowca +", f"{rec.get('driver_zl', 0):.2f} zl", ""),
        ("Inne -", f"{rec.get('other_minus_zl', 0):.2f} zl", ""),
        ("Inne +", f"{rec.get('other_plus_zl', 0):.2f} zl", ""),
    ]
    line_h = (h - 2 * pad - 18) / (len(lines) + 1)
    cy = y + h - pad - 14 - line_h
    c.setFont(f_reg, 9)
    for label, val, sign in lines:
        c.setFont(f_reg, 9)
        c.drawString(x + pad, cy, label)
        if sign:
            c.drawString(x + w / 2 - 6, cy, sign)
        c.setFont(f_bold, 9)
        c.drawRightString(x + w - pad, cy, val)
        cy -= line_h
    # Linia separatora
    c.setLineWidth(0.4)
    c.line(x + pad, cy + line_h * 0.4, x + w - pad, cy + line_h * 0.4)
    # WYPLATA CALOS
    c.setFont(f_bold, 11)
    c.drawString(x + pad, cy, "WYPLATA CALOS =")
    c.drawRightString(x + w - pad, cy, f"{comp.get('payout', 0):.2f} zl")


@router.post("/payroll/pdf")
async def generate_payroll_pdf(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    payload: PdfRequest = Body(default_factory=PdfRequest),
    current_user: dict = Depends(get_current_admin),
):
    """Generuje PDF z karteczkami wyplat.

    Uklad: 2 kolumny x 3 rzedy = 6 karteczek na strone A4.
    Bez podzialu godzin na budowy (tylko podsumowanie).
    """
    # Reuse list_payroll logic
    full = await list_payroll(year=year, month=month, current_user=current_user)
    rows = full["rows"]
    if payload.employee_ids is not None:
        wanted = set(payload.employee_ids)
        rows = [r for r in rows if r["employee_id"] in wanted]
    if not rows:
        raise HTTPException(status_code=400, detail="Brak pracownikow do wygenerowania")

    fonts = _try_register_font()
    buf = io.BytesIO()
    page_w, page_h = A4
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Wyplaty {_POLISH_MONTHS[month]} {year}")

    margin = 8 * mm
    cols, rows_per_page = 2, 3
    card_w = (page_w - 2 * margin) / cols
    card_h = (page_h - 2 * margin) / rows_per_page

    for idx, emp in enumerate(rows):
        slot = idx % (cols * rows_per_page)
        if slot == 0 and idx > 0:
            c.showPage()
        row = slot // cols
        col = slot % cols
        x = margin + col * card_w
        y = page_h - margin - (row + 1) * card_h
        # Lekki padding miedzy karteczkami
        _draw_card(c, x + 1, y + 1, card_w - 2, card_h - 2, emp, year, month, fonts)

    c.save()
    buf.seek(0)
    filename = f"wyplaty_{_POLISH_MONTHS[month]}_{year}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
