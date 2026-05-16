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
import uuid
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
    is_fixed_salary: Optional[bool] = Field(default=False)
    fixed_salary_amount: Optional[float] = Field(default=0.0)
    # advances_zl i penalties_zl sa AUTO z tabel db.advances/db.penalties - nie pole tutaj
    other_minus_zl: Optional[float] = Field(default=0.0)
    bonus_zl: Optional[float] = Field(default=0.0)
    driver_zl: Optional[float] = Field(default=0.0)
    other_plus_zl: Optional[float] = Field(default=0.0)
    # Legacy fields - tolerated but ignored in computation
    advances_hours: Optional[float] = Field(default=None)
    penalties_zl: Optional[float] = Field(default=None)
    housing_zl: Optional[float] = Field(default=None)


def _calc(hours: float, rec: dict, auto_advances_zl: float = 0.0, auto_penalties_zl: float = 0.0) -> dict:
    rate = float(rec.get("rate") or 0)
    is_fixed = bool(rec.get("is_fixed_salary") or False)
    fixed_amt = float(rec.get("fixed_salary_amount") or 0)
    o_minus = float(rec.get("other_minus_zl") or 0)
    bonus = float(rec.get("bonus_zl") or 0)
    driver = float(rec.get("driver_zl") or 0)
    o_plus = float(rec.get("other_plus_zl") or 0)
    if is_fixed:
        hours_amount = round(fixed_amt, 2)
        rate_eff = round(fixed_amt / hours, 2) if hours > 0 else 0.0
    else:
        hours_amount = round(hours * rate, 2)
        rate_eff = round(rate, 2)
    advances_zl = round(auto_advances_zl, 2)
    penalties_zl = round(auto_penalties_zl, 2)
    payout = round(hours_amount - advances_zl - penalties_zl - o_minus + bonus + driver + o_plus, 2)
    return {
        "hours_amount": hours_amount,
        "advances_zl": advances_zl,
        "penalties_zl": penalties_zl,
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

    # Payroll records dla biezacego miesiaca
    records = await db.payroll_records.find(
        {"year": year, "month": month},
        {"_id": 0},
    ).to_list(2000)
    rec_map = {r["employee_id"]: r for r in records}

    # AUTO-COPY: dla pracownikow ktorzy NIE maja jeszcze rekordu w tym miesiacu,
    # bierzemy DEFAULTS (rate, is_fixed_salary, fixed_salary_amount) z najnowszego
    # poprzedniego miesiaca. Nie zapisujemy - tylko prezentujemy w UI.
    missing_emp_ids = [e["id"] for e in emps if e["id"] not in rec_map]
    defaults_cache: dict = {}  # emp_id -> dict z polami defaultowymi
    if missing_emp_ids:
        # Pobierz wszystkie wczesniejsze rekordy tych pracownikow naraz, sortowane malejaco
        cursor = db.payroll_records.find(
            {
                "employee_id": {"$in": missing_emp_ids},
                "$or": [
                    {"year": {"$lt": year}},
                    {"year": year, "month": {"$lt": month}},
                ],
            },
            {"_id": 0, "employee_id": 1, "year": 1, "month": 1,
             "rate": 1, "is_fixed_salary": 1, "fixed_salary_amount": 1},
        ).sort([("year", -1), ("month", -1)])
        async for r in cursor:
            eid = r["employee_id"]
            if eid in defaults_cache:
                continue  # mamy juz najnowszy
            defaults_cache[eid] = {
                "rate": float(r.get("rate") or 0),
                "is_fixed_salary": bool(r.get("is_fixed_salary") or False),
                "fixed_salary_amount": float(r.get("fixed_salary_amount") or 0),
            }

    # Agregacja zaliczek (advances) i kar (penalties) per pracownik - auto z tabel
    adv_rows = await db.advances.find(
        {"year": year, "month": month}, {"_id": 0, "employee_id": 1, "amount": 1}
    ).to_list(5000)
    auto_adv: dict = {}
    for a in adv_rows:
        auto_adv[a["employee_id"]] = auto_adv.get(a["employee_id"], 0.0) + float(a.get("amount") or 0)
    pen_rows = await db.penalties.find(
        {"year": year, "month": month}, {"_id": 0, "employee_id": 1, "amount": 1}
    ).to_list(5000)
    auto_pen: dict = {}
    for p in pen_rows:
        auto_pen[p["employee_id"]] = auto_pen.get(p["employee_id"], 0.0) + float(p.get("amount") or 0)

    # Lock status biezacego miesiaca
    lock_doc = await db.payroll_locks.find_one(
        {"year": year, "month": month},
        {"_id": 0},
    )
    is_locked = bool(lock_doc)

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
        defaulted = False
        if not rec and emp_id in defaults_cache:
            rec = defaults_cache[emp_id]
            defaulted = True
        emp_adv = auto_adv.get(emp_id, 0.0)
        emp_pen = auto_pen.get(emp_id, 0.0)
        computed = _calc(total_hours, rec, auto_advances_zl=emp_adv, auto_penalties_zl=emp_pen)
        result.append({
            "employee_id": emp_id,
            "full_name": emp.get("full_name"),
            "total_hours": total_hours,
            "sites_breakdown": sites_breakdown,
            "record": {
                "rate": float(rec.get("rate") or 0),
                "is_fixed_salary": bool(rec.get("is_fixed_salary") or False),
                "fixed_salary_amount": float(rec.get("fixed_salary_amount") or 0),
                "other_minus_zl": float(rec.get("other_minus_zl") or 0),
                "bonus_zl": float(rec.get("bonus_zl") or 0),
                "driver_zl": float(rec.get("driver_zl") or 0),
                "other_plus_zl": float(rec.get("other_plus_zl") or 0),
            },
            "auto_advances_zl": round(emp_adv, 2),
            "auto_penalties_zl": round(emp_pen, 2),
            "defaulted_from_prev": defaulted,
            "computed": computed,
        })

    totals = {
        "total_hours": round(sum(r["total_hours"] for r in result), 2),
        "total_hours_amount": round(sum(r["computed"]["hours_amount"] for r in result), 2),
        "total_payout": round(sum(r["computed"]["payout"] for r in result), 2),
    }
    return {
        "year": year, "month": month,
        "rows": result, "totals": totals,
        "locked": is_locked,
        "lock_info": (lock_doc or None),
    }


async def _get_user_name(user_id: str) -> str:
    if not user_id:
        return "?"
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "full_name": 1, "email": 1})
    if u:
        return u.get("full_name") or u.get("email") or user_id[:8]
    return user_id[:8]


# ============= PUT zapis payroll fields =============
@router.put("/payroll/{employee_id}")
async def update_payroll(
    employee_id: str,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    payload: PayrollRecord = Body(...),
    current_user: dict = Depends(get_current_admin),
):
    # Lock check
    lock = await db.payroll_locks.find_one({"year": year, "month": month}, {"_id": 0, "locked_by_name": 1})
    if lock:
        raise HTTPException(
            status_code=423,
            detail=f"Wyplata za ten miesiac zostala zamknieta przez {lock.get('locked_by_name', 'admin')}. Najpierw odblokuj.",
        )

    raw = payload.model_dump(exclude_unset=True)
    update = {}
    for k, v in raw.items():
        if k == "is_fixed_salary":
            update[k] = bool(v)
        else:
            update[k] = float(v or 0)

    # Snapshot poprzednich wartosci do audytu
    prev = await db.payroll_records.find_one(
        {"employee_id": employee_id, "year": year, "month": month},
        {"_id": 0},
    ) or {}

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

    # Audit log: jeden wpis per zmienione pole (tylko gdy wartosc sie rozni)
    actor_name = await _get_user_name(current_user["sub"])
    audit_entries = []
    now_iso = datetime.now().isoformat()
    for k, v in raw.items():
        prev_v = prev.get(k)
        if k == "is_fixed_salary":
            prev_v_norm = bool(prev_v) if prev_v is not None else False
            new_v_norm = bool(v)
        else:
            prev_v_norm = float(prev_v or 0)
            new_v_norm = float(v or 0)
        if prev_v_norm != new_v_norm:
            audit_entries.append({
                "id": str(uuid.uuid4()),
                "employee_id": employee_id,
                "year": year,
                "month": month,
                "field": k,
                "old_value": prev_v_norm,
                "new_value": new_v_norm,
                "changed_at": now_iso,
                "changed_by": current_user["sub"],
                "changed_by_name": actor_name,
            })
    if audit_entries:
        await db.payroll_audit.insert_many(audit_entries)

    return {"message": "Zapisano", "employee_id": employee_id, "year": year, "month": month,
            "audit_changes": len(audit_entries)}


# ============= GET audit history =============
@router.get("/payroll/{employee_id}/audit")
async def get_payroll_audit(
    employee_id: str,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    current_user: dict = Depends(get_current_admin),
):
    entries = await db.payroll_audit.find(
        {"employee_id": employee_id, "year": year, "month": month},
        {"_id": 0},
    ).sort("changed_at", -1).to_list(500)
    return {"employee_id": employee_id, "year": year, "month": month, "entries": entries}


# ============= POST lock / unlock =============
@router.post("/payroll/lock")
async def lock_payroll_month(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    current_user: dict = Depends(get_current_admin),
):
    existing = await db.payroll_locks.find_one({"year": year, "month": month}, {"_id": 0})
    if existing:
        return {"message": "Juz zamkniety", "year": year, "month": month, "lock": existing}
    actor_name = await _get_user_name(current_user["sub"])
    doc = {
        "id": str(uuid.uuid4()),
        "year": year, "month": month,
        "locked_at": datetime.now().isoformat(),
        "locked_by": current_user["sub"],
        "locked_by_name": actor_name,
    }
    await db.payroll_locks.insert_one(doc)
    doc.pop("_id", None)
    return {"message": f"Zamknieto wyplate za {_POLISH_MONTHS[month]} {year}", "lock": doc}


@router.post("/payroll/unlock")
async def unlock_payroll_month(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    current_user: dict = Depends(get_current_admin),
):
    result = await db.payroll_locks.delete_one({"year": year, "month": month})
    if result.deleted_count == 0:
        raise HTTPException(status_code=400, detail="Miesiac nie byl zamkniety")
    return {"message": f"Odblokowano wyplate za {_POLISH_MONTHS[month]} {year}"}


_POLISH_MONTHS = [
    "", "styczen", "luty", "marzec", "kwiecien", "maj", "czerwiec",
    "lipiec", "sierpien", "wrzesien", "pazdziernik", "listopad", "grudzien"
]


# ============= POST PDF =============
class PdfRequest(BaseModel):
    employee_ids: Optional[List[str]] = None  # None = wszyscy


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
        ("Kary -", f"{comp.get('penalties_zl', 0):.2f} zl", ""),
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



# ============= POST PDF: pelny raport miesieczny (tabelaryczny) =============
@router.post("/payroll/pdf/report")
async def generate_payroll_report_pdf(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    payload: PdfRequest = Body(default_factory=PdfRequest),
    current_user: dict = Depends(get_current_admin),
):
    """Generuje PDF z pelna tabela miesiaca: imie, godziny, stawka, kwota, zal, kary,
    dodatki, kierowca, inne-, inne+, wyplata + suma na dole.
    Uklad A4 landscape, lista wszystkich w jednej tabeli (multi-strona).
    """
    from reportlab.lib.pagesizes import landscape
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    full = await list_payroll(year=year, month=month, current_user=current_user)
    rows = full["rows"]
    if payload.employee_ids is not None:
        wanted = set(payload.employee_ids)
        rows = [r for r in rows if r["employee_id"] in wanted]
    if not rows:
        raise HTTPException(status_code=400, detail="Brak pracownikow do wygenerowania")

    fonts = _try_register_font()
    f_reg, f_bold = fonts

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4),
                             leftMargin=10*mm, rightMargin=10*mm,
                             topMargin=10*mm, bottomMargin=10*mm,
                             title=f"Raport wyplat {_POLISH_MONTHS[month]} {year}")
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("t", parent=styles["Heading1"], fontName=f_bold,
                                  fontSize=14, alignment=1, spaceAfter=8)
    sub_style = ParagraphStyle("s", parent=styles["Normal"], fontName=f_reg, fontSize=9, alignment=1, spaceAfter=10)
    elements = []
    elements.append(Paragraph(
        f"FeGrro - Raport wyplat: {_POLISH_MONTHS[month].capitalize()} {year}",
        title_style,
    ))
    locked_info = ""
    if full.get("locked") and full.get("lock_info"):
        li = full["lock_info"]
        locked_info = f" | ZAMKNIETY {li.get('locked_at','')[:10]} przez {li.get('locked_by_name','admin')}"
    elements.append(Paragraph(
        f"Pracownikow: {len(rows)} | Suma godzin: {full['totals']['total_hours']:g} | "
        f"Suma wyplat: {full['totals']['total_payout']:.2f} zl{locked_info}",
        sub_style,
    ))

    # Build table data
    headers = [
        "#", "Pracownik", "Godz.", "Stala", "Stawka", "Kwota godz.",
        "Zaliczki", "Kary", "Dodatki+", "Kierowca+", "Inne-", "Inne+", "Wyplata",
    ]
    data = [headers]
    for i, r in enumerate(rows, 1):
        rec = r["record"]
        comp = r["computed"]
        rate_disp = comp.get("rate_effective") if rec.get("is_fixed_salary") else rec.get("rate")
        data.append([
            str(i),
            r["full_name"],
            f"{r['total_hours']:g}",
            "TAK" if rec.get("is_fixed_salary") else "",
            f"{float(rate_disp or 0):.2f}",
            f"{comp['hours_amount']:.2f}",
            f"{comp['advances_zl']:.2f}",
            f"{comp['penalties_zl']:.2f}",
            f"{rec['bonus_zl']:.2f}",
            f"{rec['driver_zl']:.2f}",
            f"{rec['other_minus_zl']:.2f}",
            f"{rec['other_plus_zl']:.2f}",
            f"{comp['payout']:.2f}",
        ])
    # Totals row
    data.append([
        "", "SUMA", f"{full['totals']['total_hours']:g}", "", "",
        f"{full['totals']['total_hours_amount']:.2f}", "", "", "", "", "", "",
        f"{full['totals']['total_payout']:.2f}",
    ])

    col_widths = [10*mm, 50*mm, 14*mm, 12*mm, 18*mm, 22*mm,
                  18*mm, 18*mm, 20*mm, 20*mm, 18*mm, 18*mm, 26*mm]
    tbl = Table(data, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), f_bold, 8),
        ("FONT", (0, 1), (-1, -2), f_reg, 8),
        ("FONT", (0, -1), (-1, -1), f_bold, 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#5F7151")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E8E8E8")),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("ALIGN", (3, 1), (3, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F4F4F4")]),
    ]))
    elements.append(tbl)
    elements.append(Spacer(1, 6*mm))
    # Stopka per-budowa per-pracownik (rozpiska godzin)
    breakdown_lines = []
    for r in rows:
        if r["sites_breakdown"]:
            parts = [f"{s['site_name']}: {s['hours']:g}h" for s in r["sites_breakdown"]]
            breakdown_lines.append(f"<b>{r['full_name']}</b> &mdash; " + ", ".join(parts))
    if breakdown_lines:
        sec_style = ParagraphStyle("sec", parent=styles["Normal"], fontName=f_bold, fontSize=10, spaceAfter=4)
        item_style = ParagraphStyle("itm", parent=styles["Normal"], fontName=f_reg, fontSize=8, spaceAfter=2)
        elements.append(Paragraph("Rozpiska godzin per budowa:", sec_style))
        for ln in breakdown_lines:
            elements.append(Paragraph(ln, item_style))

    doc.build(elements)
    buf.seek(0)
    filename = f"raport_wyplat_{_POLISH_MONTHS[month]}_{year}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
