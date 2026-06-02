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

### 2026-02 — iter95ct — Globalny spell-check (PL) w całej aplikacji (P1)
- `/app/frontend/src/lib/spellcheck.js`: globalny moduł włączający `spellcheck="true"` + `lang="pl"` na wszystkich `input` (typu text/email/search/url/""), `textarea` i `[contenteditable]` w całej aplikacji.
- `MutationObserver` aktualizuje pola dynamicznie dodawane przez React (formularze wycen, klientów, opisy pozycji, maile, treści ofert).
- Heurystyczne wykluczenia: pola password/pin/code/token, NIP/PESEL/REGON/IBAN/KRS, kwoty/ceny/VAT, telefony, URL-e, JSON-y (po `name`/`id`/`placeholder`/`aria-label`).
- Indywidualne wyłączenie per-pole: `data-spellcheck="off"` lub `spellcheck="false"`.
- `<html lang="en">` → `<html lang="pl">` w `index.html` (Chrome/Firefox/Safari używają polskiego słownika OS).
- Weryfikacja: ekran logowania → 2/3 inputów ze `spellcheck=true + lang=pl`, password pominięty.

### 2026-02 — iter95cs — Wyceny logo branding cleanup (P0)
- Przetworzono dostarczony PNG (`white logo on navy box`) przez PIL: usunięto granatowe tło, wyizolowano sygnetę "F" + napis "FeGrro" w czystej czerni na transparentnym tle (208×158, 5477 B, sprawdzone przez analizator obrazów: "logo is entirely black, background is white, proportions natural").
- Zaktualizowano `_TEMPLATE_CONFIGS["premium"].logo_mm` 42 → 22 (mniejsze, profesjonalne nagłówki biznesowe).
- Wszystkie 3 PDF generatory (`_generate_wycena_client_pdf_bytes`, `_generate_wycena_pdf_bytes`, BOM/zapytanie) + `_xlsx_add_logo` teraz **zachowują proporcje obrazu** odczytane z pliku PNG zamiast wymuszać kwadrat (208/158 ≈ 1.32:1).
- Source-of-truth: `/app/backend/assets/logo/logo.png`.

### 2026-02 — iter95cr — Wyceny PDF/XLSX logo fix (P0)
- Zbundlowano logo w `/app/backend/assets/logo/` (analogicznie do `assets/fonts/`) — działa na każdym deployu (Render: osobne frontend/backend).
- `_get_logo_path()` priorytetuje bundled backend path; `/app/frontend/public/` fallback dla dev.
- Usunięto duplikat hardcoded paths z `_generate_wycena_client_pdf_bytes`.

### Wcześniejsze (sesja poprzednia)
- iter95cq HoursTable/WorkerDashboard kolory kropek z DB.
- iter95co Wyceny list: Total Netto live.
- iter95ci–cn finance_budowy↔construction_sites bi-dir sync + APScheduler.
- iter95cf–cg Kaucja GIR default 5% + bulk button.
- iter95ce Budget formula UI/PDF parity.
- iter95ca–cd, cp Math precision 2 decimals.
- iter95by–bz Cosmetic PDF (title, alignment, KeepTogether).
- iter95bv–bx PDF download Network Error + 500 errors.

## Backlog (priority order)
- 🟡 P2 — "Wymagane zatwierdzenie kierownika": workflow blokady gdy cena < `price_min`.
- 🟢 P3 — Refactor `routes/wyceny.py` (3282 linii) → `wyceny_exports.py`, `wyceny_pricebooks.py`, etc.
- 🟢 P3 — Centralizacja `getSiteColorHex` (hooks/_shared.js) — duplikat w HoursTable + WorkerDashboard.
- 🟢 P3 — Google Maps Marker → AdvancedMarkerElement.

## Critical notes for next agent
- Render: frontend i backend deployowane osobno — wszystko co backend ma renderować w PDF/XLSX musi siedzieć w `/app/backend/assets/`.
- Zawsze używaj `_pdf_text()` / `_pdf_safe()` / `_safe_content_disposition()` w `routes/wyceny.py` dla polskich znaków.
- Standard zaokrąglania: `round(val, 2)` w UI i backendzie.
- Logo source-of-truth: `/app/backend/assets/logo/logo.png` (resolver: `_get_logo_path()`). Aktualnie 208×158, ratio 1.32:1, czarne na transparentnym.
- Przy modyfikowaniu rozmiarów loga w PDF zawsze używaj `width=N*mm, height=N*ratio*mm` (ratio z PIL.Image.size) zamiast wymuszać kwadrat.
