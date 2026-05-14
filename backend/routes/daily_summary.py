"""Codzienne podsumowanie zamowien i nieobecnosci.

Cron uruchamiany o 18:00 lokalnego czasu serwera kazdego dnia roboczego.
Wysyla jeden email do biuro@fegrro.pl z podsumowaniem aktywnosci dnia.
Mozna tez wywolac recznie z `/api/cron/daily-summary` (admin only) -
przydatne do testow i do "wymus".

Email zawiera:
- Zamowienia sprzetu zlozone dzisiaj (per kategoria)
- Zamowienia materialow zlozone dzisiaj
- Zamowienia odziezy zlozone dzisiaj
- Nieobecnosci zgloszone dzisiaj
- Prosby o uzupelnienie godzin wciaz oczekujace
- Co jest "do zrobienia" przez admina (pending + partial)

Cisza-friendly: jesli `summary["nothing"]` jest True (dzien bez zamowien)
i `SKIP_EMPTY_DAILY=true` w env, mail nie jest wysylany.
"""
import logging
import os
from datetime import datetime, timezone

from database import db

logger = logging.getLogger(__name__)


CATEGORY_LABELS_PL = {
    "electronics": "Elektronarzedzia",
    "accessories": "Akcesoria",
    "formwork": "Szalunki",
}


def _today_iso_range():
    """Returns (start_iso, end_iso) for the current local-server day."""
    now = datetime.now()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = now
    return start.isoformat(), end.isoformat()


async def _collect_daily_summary() -> dict:
    """Aggregate counters and headlines for today."""
    start, end = _today_iso_range()

    # --- New equipment orders today (per category) ---
    eq_today_by_cat = {"electronics": [], "accessories": [], "formwork": []}
    async for o in db.equipment_orders.find(
        {"created_at": {"$gte": start, "$lte": end}},
        {"_id": 0, "category": 1, "foreman_name": 1, "equipment_name": 1, "quantity_requested": 1, "status": 1},
    ):
        cat = o.get("category") or "electronics"
        if cat in eq_today_by_cat:
            eq_today_by_cat[cat].append(o)

    # --- Warehouse (Materialy) orders today ---
    wh_today = await db.warehouse_orders.find(
        {"created_at": {"$gte": start, "$lte": end}},
        {"_id": 0, "foreman_name": 1, "items": 1, "status": 1},
    ).to_list(200)

    # --- Clothing orders today ---
    cl_today = await db.clothing_orders.find(
        {"created_at": {"$gte": start, "$lte": end}},
        {"_id": 0, "employee_name": 1, "clothing_type_name": 1, "quantity": 1, "status": 1},
    ).to_list(200)

    # --- Absences reported today ---
    ab_today = await db.absences.find(
        {"created_at": {"$gte": start, "$lte": end}},
        {"_id": 0, "employee_name": 1, "dates": 1, "status": 1},
    ).to_list(200)

    # --- Pending hour requests (all-time, not just today) ---
    pending_reqs = await db.requests.count_documents({"status": "pending"})

    # --- Outstanding to-do (admin): pending+partial equipment orders, pending warehouse orders ---
    eq_open = await db.equipment_orders.count_documents({"status": {"$in": ["pending", "partial"]}})
    wh_open = await db.warehouse_orders.count_documents({"status": {"$in": ["pending", "partial"]}})
    cl_open = await db.clothing_orders.count_documents({"status": {"$ne": "issued"}})

    total_today = (
        sum(len(v) for v in eq_today_by_cat.values())
        + len(wh_today) + len(cl_today) + len(ab_today)
    )
    return {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "eq_today_by_cat": eq_today_by_cat,
        "wh_today": wh_today,
        "cl_today": cl_today,
        "ab_today": ab_today,
        "pending_reqs": pending_reqs,
        "eq_open": eq_open,
        "wh_open": wh_open,
        "cl_open": cl_open,
        "total_today": total_today,
        "nothing": total_today == 0 and pending_reqs == 0 and eq_open == 0 and wh_open == 0 and cl_open == 0,
    }


def _render_html(summary: dict) -> str:
    parts = [f"<h2>FeGrro - podsumowanie dnia {summary['date']}</h2>"]

    # Today's headlines first
    if summary["total_today"] == 0:
        parts.append("<p><em>Dzisiaj zero nowych zamowien i zero nowych nieobecnosci.</em></p>")
    else:
        parts.append("<h3>Co sie wydarzylo dzisiaj</h3>")
        # Equipment per category
        for cat_key, items in summary["eq_today_by_cat"].items():
            if not items:
                continue
            lbl = CATEGORY_LABELS_PL.get(cat_key, cat_key)
            parts.append(f"<h4>{lbl} ({len(items)})</h4><ul>")
            for it in items:
                parts.append(
                    f"<li>{it.get('foreman_name','?')}: {it.get('equipment_name','?')} "
                    f"x{it.get('quantity_requested', '?')} "
                    f"<small>[{it.get('status','?')}]</small></li>"
                )
            parts.append("</ul>")
        if summary["wh_today"]:
            parts.append(f"<h4>Materialy ({len(summary['wh_today'])})</h4><ul>")
            for it in summary["wh_today"]:
                names = ", ".join(
                    f"{i.get('material_name','?')} ({i.get('quantity','?')} {i.get('unit','')})"
                    for i in (it.get("items") or [])[:4]
                )
                parts.append(
                    f"<li>{it.get('foreman_name','?')}: {names} <small>[{it.get('status','?')}]</small></li>"
                )
            parts.append("</ul>")
        if summary["cl_today"]:
            parts.append(f"<h4>Odziez ({len(summary['cl_today'])})</h4><ul>")
            for it in summary["cl_today"]:
                parts.append(
                    f"<li>{it.get('employee_name','?')}: {it.get('quantity','?')} x "
                    f"{it.get('clothing_type_name','?')} <small>[{it.get('status','?')}]</small></li>"
                )
            parts.append("</ul>")
        if summary["ab_today"]:
            parts.append(f"<h4>Nieobecnosci ({len(summary['ab_today'])})</h4><ul>")
            for it in summary["ab_today"]:
                dates = ", ".join(it.get("dates") or [])
                parts.append(
                    f"<li>{it.get('employee_name','?')}: {dates} <small>[{it.get('status','?')}]</small></li>"
                )
            parts.append("</ul>")

    # Outstanding to-do
    parts.append("<h3>Do zrobienia</h3>")
    pending_lines = []
    if summary["eq_open"]:
        pending_lines.append(f"<li>Zamowien sprzetu czeka na wydanie: <strong>{summary['eq_open']}</strong></li>")
    if summary["wh_open"]:
        pending_lines.append(f"<li>Zamowien materialow czeka na wydanie: <strong>{summary['wh_open']}</strong></li>")
    if summary["cl_open"]:
        pending_lines.append(f"<li>Zamowien odziezy czeka na wydanie: <strong>{summary['cl_open']}</strong></li>")
    if summary["pending_reqs"]:
        pending_lines.append(f"<li>Prosb o uzupelnienie godzin: <strong>{summary['pending_reqs']}</strong></li>")
    if pending_lines:
        parts.append("<ul>" + "".join(pending_lines) + "</ul>")
    else:
        parts.append("<p><em>Nic - panel admina jest czysty.</em></p>")

    parts.append(
        f"<hr><p style='color:#888;font-size:11px'>Automatyczna wiadomosc z FeGrro. "
        f"Wygenerowano {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}.</p>"
    )
    return "\n".join(parts)


async def _send_summary_email(html: str, date_str: str) -> bool:
    """Send via Resend. Returns True if sent or skipped intentionally."""
    api_key = os.environ.get("RESEND_API_KEY")
    to_addr = os.environ.get("WAREHOUSE_NOTIFY_EMAIL", "biuro@fegrro.pl")
    from_addr = os.environ.get("RESEND_FROM_EMAIL", "noreply@fegrro.pl")
    if not api_key:
        logger.info("RESEND_API_KEY not configured - skip daily summary email")
        return False
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "from": from_addr,
                    "to": [to_addr],
                    "reply_to": ["biuro@fegrro.pl"],
                    "subject": f"FeGrro - podsumowanie {date_str}",
                    "html": html,
                },
            )
            if resp.status_code >= 300:
                logger.warning(f"Resend daily summary failed {resp.status_code}: {resp.text}")
                return False
        return True
    except Exception as e:
        logger.warning(f"Daily summary email exception: {e}")
        return False


async def cron_daily_summary() -> dict:
    """Entrypoint called by APScheduler at 18:00 every day."""
    try:
        summary = await _collect_daily_summary()
        skip_empty = os.environ.get("SKIP_EMPTY_DAILY", "").lower() in ("1", "true", "yes")
        if summary["nothing"] and skip_empty:
            logger.info("[CRON] daily-summary: nothing to report, skipping email")
            return {"sent": False, "reason": "empty_day"}
        html = _render_html(summary)
        ok = await _send_summary_email(html, summary["date"])
        # Also store a copy in DB so admin can re-open from UI later
        await db.daily_summaries.insert_one({
            "id": f"summary-{summary['date']}-{datetime.now().strftime('%H%M')}",
            "date": summary["date"],
            "html": html,
            "total_today": summary["total_today"],
            "sent": bool(ok),
            "created_at": datetime.now().isoformat(),
        })
        logger.info(f"[CRON] daily-summary: total_today={summary['total_today']}, sent={ok}")
        return {"sent": bool(ok), "total_today": summary["total_today"]}
    except Exception as e:
        logger.exception(f"[CRON] daily-summary failed: {e}")
        return {"sent": False, "error": str(e)}
