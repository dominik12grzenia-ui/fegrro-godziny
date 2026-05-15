"""Hours forecast - przewidywana suma godzin firmy per miesiac.

Algorytm:
- Z ostatnich 3 zamknietych miesiecy wyliczamy srednia godzin na dzien roboczy firmy
  (suma godzin / dni robocze). Nieobecnosci NN/NU sa juz zerami w hour_entries
  wiec automatycznie obnizaja srednia.
- Prognoza dla miesiaca docelowego = srednia_dzienna_firmy x dni_robocze_w_tym_miesiacu.
- Faktyczne = suma godzin zapisanych w hour_entries dla tego miesiaca (do dzis).
"""
from fastapi import APIRouter, Depends, Query
from datetime import date, timedelta
import calendar

from database import db
from auth import get_current_admin

router = APIRouter()


def _polish_holidays(year: int) -> set:
    fixed = {
        f"{year}-01-01", f"{year}-01-06", f"{year}-05-01", f"{year}-05-03",
        f"{year}-08-15", f"{year}-11-01", f"{year}-11-11",
        f"{year}-12-25", f"{year}-12-26",
    }
    # Easter (Anonymous Gregorian)
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    easter = date(year, month, day)
    for delta in (1, 60, 49):  # Easter Mon, Corpus Christi, Pentecost
        fixed.add((easter + timedelta(days=delta)).strftime("%Y-%m-%d"))
    return fixed


def _workdays_in_month(year: int, month: int) -> int:
    """Pn-Pt minus polskie swieta."""
    holidays = _polish_holidays(year)
    last_day = calendar.monthrange(year, month)[1]
    count = 0
    for d in range(1, last_day + 1):
        dt = date(year, month, d)
        if dt.weekday() >= 5:  # 5=Sat 6=Sun
            continue
        if dt.strftime("%Y-%m-%d") in holidays:
            continue
        count += 1
    return count


async def _sum_hours_in_month(year: int, month: int) -> float:
    """Suma hour_entries.hours dla danego miesiaca."""
    start = f"{year:04d}-{month:02d}-01"
    last_day = calendar.monthrange(year, month)[1]
    end = f"{year:04d}-{month:02d}-{last_day:02d}"
    pipeline = [
        {"$match": {"work_date": {"$gte": start, "$lte": end}}},
        {"$group": {"_id": None, "total": {"$sum": "$hours"}}},
    ]
    async for row in db.hour_entries.aggregate(pipeline):
        return float(row.get("total") or 0)
    return 0.0


def _prev_month(year: int, month: int):
    if month == 1:
        return year - 1, 12
    return year, month - 1


@router.get("/forecast/hours")
async def forecast_hours(
    year: int = Query(default=None),
    current_user: dict = Depends(get_current_admin),
):
    """Zwraca 12 wierszy (Jan..Dec wskazanego roku) z prognoza i faktycznymi.

    Prognoza opiera sie na srednich z 3 zamknietych miesiecy POPRZEDZAJACYCH dany
    miesiac docelowy (tak zeby wczesniejsze miesiace tez mialy sensowna prognoze
    z perspektywy tego co bylo wczesniej).
    """
    today = date.today()
    y = year or today.year

    # Cache: srednie dzienne wyliczamy raz dla kazdego potrzebnego trio miesiecy
    monthly_totals = {}  # (y, m) -> total_hours
    monthly_workdays = {}  # (y, m) -> workdays

    async def _ensure(y_: int, m_: int):
        key = (y_, m_)
        if key not in monthly_totals:
            monthly_totals[key] = await _sum_hours_in_month(y_, m_)
            monthly_workdays[key] = _workdays_in_month(y_, m_) or 1
        return monthly_totals[key], monthly_workdays[key]

    rows = []
    for m in range(1, 13):
        # Bierzemy 3 miesiace poprzedzajace (m-1, m-2, m-3) z odpowiednich lat
        prev = (y, m)
        sum_h = 0.0
        sum_wd = 0
        considered = 0
        for _ in range(3):
            py, pm = _prev_month(*prev)
            prev = (py, pm)
            h, wd = await _ensure(py, pm)
            # Pomin miesiace ktore nie mialy zadnej zapisanej aktywnosci
            # (h=0 i wd>0) zeby nie zaniżyć średniej dla nowych firm
            if h > 0:
                sum_h += h
                sum_wd += wd
                considered += 1
        avg_daily = (sum_h / sum_wd) if sum_wd > 0 else 0.0
        target_wd = _workdays_in_month(y, m)
        forecast = round(avg_daily * target_wd, 1)
        actual_h, _ = await _ensure(y, m)
        actual = round(actual_h, 1)

        # Status: miesiac juz zamkniety, biezacy, czy przyszly
        if (y, m) < (today.year, today.month):
            status = "past"
        elif (y, m) == (today.year, today.month):
            status = "current"
        else:
            status = "future"

        rows.append({
            "year": y,
            "month": m,
            "workdays": target_wd,
            "forecast_hours": forecast,
            "actual_hours": actual,
            "difference": round(actual - forecast, 1),
            "status": status,
            "based_on_months": considered,  # ile faktycznie historycznych miesiecy miało dane
        })

    # Sumy roczne
    total_forecast = round(sum(r["forecast_hours"] for r in rows), 1)
    total_actual = round(sum(r["actual_hours"] for r in rows), 1)

    return {
        "year": y,
        "rows": rows,
        "total_forecast": total_forecast,
        "total_actual": total_actual,
        "today": today.isoformat(),
    }
