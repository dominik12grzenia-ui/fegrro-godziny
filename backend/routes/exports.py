"""Eksporty ksiegowe CSV - dla biura rachunkowego.

iter95bs: Pakiet E.
Endpointy:
- GET /api/finance/export/csv?year=2026&month=5  - zapisy + faktury jako CSV
- GET /api/finance/export/budowy-summary?year=2026  - podsumowanie budow YTD
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
import csv
import io
from datetime import datetime
from typing import Optional

from database import db
from auth import get_current_finance_reader
from audit_log import soft_delete_filter

router = APIRouter()


@router.get("/finance/export/csv")
async def export_finance_csv(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    _user: dict = Depends(get_current_finance_reader),
):
    """Eksport zapisow + faktur do CSV (kodowanie windows-1250 / UTF-8 BOM dla Excela)."""
    if month:
        start = f"{year:04d}-{month:02d}-01"
        end = f"{year:04d}-{month:02d}-31"
        filename = f"finanse-{year:04d}-{month:02d}.csv"
    else:
        start = f"{year:04d}-01-01"
        end = f"{year:04d}-12-31"
        filename = f"finanse-{year:04d}.csv"

    q = {**soft_delete_filter(), "date": {"$gte": start, "$lte": end}}

    zapisy = await db.finance_zapisy.find(q, {"_id": 0}).sort([("date", 1)]).to_list(length=None)

    # Pobierz nazwy budow + kodow
    budowa_ids = list({z.get("budowa_id") for z in zapisy if z.get("budowa_id")})
    budowy_map = {}
    if budowa_ids:
        async for b in db.finance_budowy.find({"id": {"$in": budowa_ids}}, {"_id": 0, "id": 1, "name": 1, "code": 1}):
            budowy_map[b["id"]] = b

    kod_ids = list({z.get("kod_id") for z in zapisy if z.get("kod_id")})
    kody_map = {}
    if kod_ids:
        async for k in db.finance_kody.find({"id": {"$in": kod_ids}}, {"_id": 0, "id": 1, "name": 1, "category": 1}):
            kody_map[k["id"]] = k

    # Build CSV
    output = io.StringIO()
    output.write("\ufeff")  # BOM dla Excela
    writer = csv.writer(output, delimiter=";", lineterminator="\r\n")
    writer.writerow([
        "Data", "Nr faktury", "Kontrahent", "Kod ksiegowy", "Kategoria",
        "Pozycja", "Netto (zl)", "Brutto (zl)", "Budowa", "Kod budowy",
        "Notatka", "Status platnosci", "Utworzono", "Zmodyfikowano",
    ])
    total_netto = 0.0
    for z in zapisy:
        kod = kody_map.get(z.get("kod_id") or "", {})
        bud = budowy_map.get(z.get("budowa_id") or "", {})
        n = float(z.get("netto") or 0)
        total_netto += n
        writer.writerow([
            z.get("date") or "",
            z.get("nr_faktury") or "",
            z.get("kontrahent") or "",
            z.get("kod_id") or "",
            kod.get("name") or z.get("kod_category") or "",
            z.get("pozycja_nazwa") or "",
            f'{n:.2f}'.replace('.', ','),
            f'{float(z.get("brutto") or 0):.2f}'.replace('.', ','),
            bud.get("name") or "",
            bud.get("code") or "",
            (z.get("notes") or "").replace("\n", " ")[:200],
            z.get("payment_status") or "",
            (z.get("created_at") or "")[:19],
            (z.get("updated_at") or "")[:19],
        ])
    writer.writerow([])
    writer.writerow(["SUMA NETTO", "", "", "", "", "", f'{total_netto:.2f}'.replace('.', ',')])
    writer.writerow(["Wygenerowano", datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "przez", _user.get("full_name") or _user.get("email") or "admin"])

    output.seek(0)
    return StreamingResponse(
        iter([output.read()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/finance/export/budowy-summary")
async def export_budowy_summary_csv(
    year: int = Query(...),
    _user: dict = Depends(get_current_finance_reader),
):
    """Podsumowanie budow YTD: plan vs wykonanie + saldo."""
    budowy = await db.finance_budowy.find(
        {**soft_delete_filter()}, {"_id": 0, "id": 1, "name": 1, "code": 1, "is_archived": 1},
    ).sort([("name", 1)]).to_list(length=None)

    start = f"{year:04d}-01-01"
    end = f"{year:04d}-12-31"

    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output, delimiter=";", lineterminator="\r\n")
    writer.writerow([
        "Nazwa budowy", "Kod", "Status",
        "Plan koszty (zl)", "Wykonanie koszty (zl)", "Saldo (zl)", "% Wykorzystania",
        "Plan przychody (zl)", "Wykonanie przychody (zl)",
    ])

    for b in budowy:
        # Lines
        lines = await db.budget_lines.find({"budowa_id": b["id"]}, {"_id": 0}).to_list(length=None)
        parent_ids = {ln.get("parent_id") for ln in lines if ln.get("parent_id")}
        plan_costs = sum(
            (float(ln.get("plan_netto") or 0) if ln.get("plan_netto") is not None
             else float(ln.get("quantity") or 0) * float(ln.get("unit_price") or 0))
            for ln in lines if not ln.get("is_income") and ln.get("id") not in parent_ids
        )
        plan_income = sum(
            (float(ln.get("plan_netto") or 0) if ln.get("plan_netto") is not None
             else float(ln.get("quantity") or 0) * float(ln.get("unit_price") or 0))
            for ln in lines if ln.get("is_income") and ln.get("id") not in parent_ids
        )
        # Wykonanie
        line_ids = [ln["id"] for ln in lines]
        exec_costs = 0.0
        if line_ids:
            pipe = [
                {"$match": {**soft_delete_filter(), "budget_line_id": {"$in": line_ids},
                            "date": {"$gte": start, "$lte": end}}},
                {"$group": {"_id": None, "netto": {"$sum": "$netto"}}},
            ]
            async for r in db.finance_zapisy.aggregate(pipe):
                exec_costs = float(r.get("netto") or 0)
        # Wykonanie sprzedaz
        exec_income_pipe = [
            {"$match": {**soft_delete_filter(), "budowa_id": b["id"],
                        "kod_category": {"$in": ["PZS", "PRZ", "SPRZ"]},
                        "date": {"$gte": start, "$lte": end}}},
            {"$group": {"_id": None, "netto": {"$sum": "$netto"}}},
        ]
        exec_income = 0.0
        async for r in db.finance_zapisy.aggregate(exec_income_pipe):
            exec_income = float(r.get("netto") or 0)

        saldo = plan_costs - exec_costs
        usage = (exec_costs / plan_costs * 100) if plan_costs > 0 else 0

        writer.writerow([
            b.get("name") or "",
            b.get("code") or "",
            "Zarchiwizowana" if b.get("is_archived") else "Aktywna",
            f'{plan_costs:.2f}'.replace('.', ','),
            f'{exec_costs:.2f}'.replace('.', ','),
            f'{saldo:.2f}'.replace('.', ','),
            f'{usage:.1f}%'.replace('.', ','),
            f'{plan_income:.2f}'.replace('.', ','),
            f'{exec_income:.2f}'.replace('.', ','),
        ])
    writer.writerow([])
    writer.writerow(["Wygenerowano", datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "rok", str(year)])

    output.seek(0)
    return StreamingResponse(
        iter([output.read()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=budowy-summary-{year}.csv"},
    )
