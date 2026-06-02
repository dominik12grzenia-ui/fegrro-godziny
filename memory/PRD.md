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

### 2026-02 — iter95dd — Tryb negocjacji: marża/narzut override wymusza wartość na liniach materiałów (P0)
- **Bug**: w trybie negocjacji zmiana „Marża materiał" 8%→0% obniżała budżet tylko o ~2680 zł zamiast spodziewanego znacznego spadku.
- **Przyczyna**: `marzaOverride` zmieniał tylko `default_marza_pct` wyceny. W `computeSubRow` per-line `sub.marza_pct ?? default` — jeśli linia ma własną wartość 8, default 0 jest ignorowany. Ten sam problem dla `narzut_zapas_pct`.
- **Fix UI** (`Wyceny.js` displayData): gdy negocjacja ON i ustawiono override, wymuszamy wartość override na `s.marza_pct` / `s.narzut_zapas_pct` dla wszystkich linii `type=materials`. Robocizna/sprzęt nie używają marży, więc nie ruszamy.
- **Fix backend** (`apply_negotiation`): po „Przyjmij na stałe" tę samą wartość zapisujemy do bazy (`update_many` na `wyceny_lines` typu `materials`) — spójność UI ↔ trwały zapis.
- Lint clean ✅.

### 2026-02 — iter95dc — Naprawa pobierania wyceny w Excelu (P0)
- `GET /api/wyceny/{id}/export.xlsx` zwracał `404 Not Found` na produkcji — funkcja `export_wycena_xlsx` istniała w kodzie, ale **brakowało dekoratora `@router.get(...)`** (regresja z poprzedniego refactoru).
- Dodany dekorator. Endpoint teraz działa dla wszystkich 3 wariantów: `positions`, `full`, `client`.
- Tested ✅: HTTP 200, openpyxl load OK, sheety „Wycena"/„Oferta" z poprawną strukturą.

### 2026-02 — iter95db — "Aktualizuj ceny" przelicza ceny materiałów na jednostkę wyrobu (P1)
- W endpointcie `POST /wyceny/{id}/refresh-prices` dla `type=materials` zamiast surowego `unit_price_netto` (np. cena worka cementu) liczona jest cena per jednostka wyrobu w wycenie wg wzoru:
  ```
  cena = (unit_price_netto + koszty_inne_do_jd) × zapotrzebowanie / pkg_qty
  ```
- Wymaga aby `zap_unit` w cenniku kończył się na `/{line.unit}` (np. `kg/m³` dla linii w m³).
- Inaczej: fallback do bazowego `unit_price_netto`.
- Wzór identyczny z frontendowym `computeMaterialPerWorkUnit` w `_shared.js` (spójność UI ↔ refresh).
- Tested curl ✅: beton 1.19 zł/kg, pkg=25, zap=300 kg/m³, koszt_inne=0.50 → m³=`20.28 zł`, kg=`1.19 zł` (fallback).

### 2026-02 — iter95da — "Aktualizuj ceny" + auto-link po nazwie/typie (P1)
- Endpoint `POST /wyceny/{id}/refresh-prices` rozszerzony: dla linii BEZ `price_book_id` (np. dodanych ręcznie lub przez import Excela) automatycznie szuka dopasowania w cenniku po (`type`, `name`) — case-insensitive + normalizacja whitespace.
- Po dopasowaniu: zapisuje `price_book_id` na linii i propaguje cenę + `koszt_wykonania` + nazwę (znormalizowaną).
- Response: dodano pole `auto_linked` z liczbą nowych powiązań.
- Frontend toast pokazuje: „Zaktualizowano N pozycji z cennika (auto-powiązano z cennikiem: M)".
- Tested curl ✅ (3/4 linii auto-zlinkowane i zsynchronizowane, 1 pominięta jako "nieznana pozycja").

### 2026-02 — iter95cz — "Aktualizuj ceny" synchronizuje też `koszt_wykonania` (P1)
- Endpoint `POST /wyceny/{id}/refresh-prices` (przycisk „🔄 Aktualizuj ceny" w UI) teraz dla każdej linii typu `labor` z `price_book_id` nadpisuje `koszt_wykonania` wartością z cennika.
- Logika: gdy w cenniku jest `koszt_wykonania` różny od bieżącej linii — aktualizuj. Nie kasujemy ręcznie ustawionych wartości jeśli cennik ma `null` (nie dotykamy pola).
- Tested curl: linia `kw=150, price=40` + cennik zmieniony na `kw=200, price=75` → po refresh-prices → `kw=200, price=75` ✅.

### 2026-02 — iter95cy — Diagnostyczny endpoint `/api/wyceny/ai/health` (P0 debug)
- Publiczny (bez auth) endpoint zwracający `{ ok, configured, length, prefix, expected_prefix, matches_expected_prefix }`.
- NIE ujawnia samego klucza — tylko length + 11 pierwszych znaków + flagi.
- Pozwala użytkownikowi zweryfikować w przeglądarce czy `EMERGENT_LLM_KEY` jest faktycznie podpięty na produkcji Render.

### 2026-02 — iter95cx — Widoczny input `kw` (koszt wykonania) w SubRow + AI Polish dla scope (P1)
- **SubRow.js**: pod inputem ceny pojawia się drugi input `kw:` z czerwoną stawką firmową — **TYLKO dla `sub.type === 'labor'`**. Daje to widoczność pola i możliwość ręcznej korekty (poprzednio koszt_wykonania trafiał do podpozycji tylko z cennika).
- **Wyceny.js**: AI Polish (✨) obok labeli „✓ Oferta obejmuje" i „✗ Oferta nie obejmuje". Obsługa pól uncontrolled przez `useRef` (zachowuje istniejące `defaultValue`/`onBlur`).
- **AiPolishButton.js**: nowy prop `getText` (callback) — pozwala czytać tekst z uncontrolled inputu przez ref bez refaktoru.
- **Tooltip kolumny KOSZT PROGNOZOWANY**: zaktualizowany żeby pokazywał aktualne wzory per type.

### 2026-02 — iter95cw — Per-type wzory kosztPrognozowany + auto-copy z cennika (P1)
- **Wzory** w `_shared.js computeSubRow`:
  - `labor`: `qty × (sub.koszt_wykonania ?? cena)` — fallback do ceny gdy brak kosztu.
  - `materials`: `qty × cena × (1 + narzut/100)` (bez zmian).
  - `equipment`: `qty × cena` (bez narzutu).
- **Backend** `LineCreate`/`LineUpdate`: pole `koszt_wykonania`. `POST /wyceny/lines` auto-kopiuje z `wyceny_price_book.koszt_wykonania` gdy `type=labor` + `price_book_id`. `PATCH` z nowym `price_book_id` auto-kopiuje gdy linia ma `koszt_wykonania=null`. Round-to-2dp.
- **Frontend** `pickFromBook`: przy wyborze pozycji `labor` z cennika kopiuje `koszt_wykonania` do podpozycji. `save` payload przesyła pole na backend.
- Tested 3/3 UI formuł + auto-copy via Playwright (iteration_57).

### 2026-02 — iter95cv — Cennik robocizny: kolumna „koszt wykonania elementu" (P1)
- **Backend**: nowe pole `koszt_wykonania` (Optional[float]) w `PriceBookCreate` + `PriceBookUpdate` + `create_price_book` doc dict + history tracking dla `labor`. Zmiany trafiają do `price_history`.
- **Frontend**: nowy `<th>` „koszt wykonania" w `LaborPriceBook.js` (między „cena za inną jedn." a „cena min"); `<td><input>` w `LaborRow.js` z testidem `labor-koszt-wykonania-{id}` (czerwony tabularnums #F87171).
- Semantyka: wewnętrzny koszt firmowy per jednostka pracy (robocizna + narzuty firmowe). Po pomnożeniu przez ilość → prognozowany koszt robocizny do kalkulacji marży/zysku. Cena sprzedaży nadal w `price_m2/m3/other`.
- Tested: 5/5 frontend e2e (iteration_56) — kolumna widoczna, wartość persystuje, historia loguje zmiany, regresje czyste.

### 2026-02 — iter95cu — AI text polish dla wycen (Claude Haiku 4.5) (P1)
- **Backend**: `POST /api/wyceny/ai/polish` w `/app/backend/routes/wyceny_ai.py` (3 trybie: `name`, `description`, `notes`) — Claude Haiku 4.5 przez `emergentintegrations` + `EMERGENT_LLM_KEY`. Lazy import biblioteki, system prompts po polsku zachowujące jednostki/wymiary/normy.
- **Frontend**: `AiPolishButton.js` — mała ikonka ✨ obok nazw pozycji w `PosRow.js` i `SubRow.js`. Klik → AI poprawia ortografię, terminologię budowlaną i stylistykę, zachowując liczby i jednostki. Loading spinner, toasty (sukces/info/błąd).
- Przykład: `rurka pcv 110 plus studnia rewizyjna fi 400` → `Rurka PVC Ø 110 plus studnia rewizyjna Ø 400`. Czas ~2-3s.
- Tested 9/9 pytest + e2e Playwright (iteration_55).

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
