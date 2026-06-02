# Construction ERP — FeGrro (PRD)

## Problem statement
Construction ERP for FeGrro (PL): Equipment, Timesheets, Payroll, Finance, Budgeting, Estimates (Wyceny). Tech: React PWA + FastAPI + MongoDB. Production hosted on Render with separate frontend/backend deploys.

## User language
Polish (PL).

## Architecture
- Backend: `/app/backend` FastAPI + APScheduler.
- Frontend: `/app/frontend` React PWA.
- DB: MongoDB.
- 3rd party: Fakturownia, VAPID push, MS Graph, Resend, GUS, Google Maps.

## Recent changelog (most recent first)

### 2026-02 — iter95cr — Wyceny PDF/XLSX logo fix (P0)
- Skopiowano `icon-512x512.png` → `/app/backend/assets/logo/logo.png` (plus 192 i apple-touch wariant) — logo jest teraz częścią deployu backendu (analogicznie do `assets/fonts/`).
- `_get_logo_path()` w `routes/wyceny.py` priorytetuje bundled backend path; `/app/frontend/public/` zostaje jako fallback dla dev.
- Usunięto zahardkodowaną listę ścieżek frontendowych z `_generate_wycena_client_pdf_bytes` (linie ok. 1903–1909). Cała generacja PDF/XLSX teraz centralnie używa `_get_logo_path()`.
- Weryfikacja: `GET /api/wyceny/{id}/export.pdf` zwraca 200, PDF zawiera embedded image (24089 B = dokładnie nasz `logo.png`).

### Wcześniejsze (sesja poprzednia)
- iter95cq HoursTable/WorkerDashboard kolory kropek z DB.
- iter95co Wyceny list: Total Netto live.
- iter95ci–cn finance_budowy↔construction_sites bi-dir sync + APScheduler.
- iter95cf–cg Kaucja GIR default 5% + bulk button.
- iter95ce Budget formula UI/PDF parity.
- iter95ca–cd, cp Math precision 2 decimals.
- iter95by–bz Cosmetic PDF (title, alignment, KeepTogether).
- iter95bv–bx PDF download Network Error + 500 errors (HTML escape, Content-Disposition, fonty PL).

## Backlog (priority order)
- 🟡 P2 — "Wymagane zatwierdzenie kierownika": workflow blokady gdy cena < `price_min`.
- 🟢 P3 — Refactor `routes/wyceny.py` (3257 linii) → `wyceny_exports.py`, `wyceny_pricebooks.py`, etc.
- 🟢 P3 — Centralizacja `getSiteColorHex` (hooks/_shared.js) — duplikat w HoursTable + WorkerDashboard.
- 🟢 P3 — Google Maps Marker → AdvancedMarkerElement.

## Critical notes for next agent
- Render: frontend i backend deployowane osobno — **NIGDY** nie linkuj zasobów backendu do `/app/frontend/public/`. Wszystko co backend ma renderować w PDF/XLSX musi siedzieć w `/app/backend/assets/`.
- Zawsze używaj `_pdf_text()` / `_pdf_safe()` / `_safe_content_disposition()` w `routes/wyceny.py` dla polskich znaków.
- Standard zaokrąglania: `round(val, 2)` w UI i backendzie.
- Logo source-of-truth: `/app/backend/assets/logo/logo.png` (resolver: `_get_logo_path()`).
