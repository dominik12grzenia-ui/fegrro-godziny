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


### 2026-02 — iter95du — Koszty cykliczne: tylko bieżący miesiąc (P1 — DONE)

**Problem**: Przy zaznaczeniu "Koszt cykliczny" backend tworzył wszystkie N zapisów od razu (włącznie z przyszłymi miesiącami), co fałszowało SUMA KOSZTÓW i WYNIK NETTO w lipcu-grudniu.

**Fix backend** (`/app/backend/routes/finance.py`):
- Nowa kolekcja `finance_recurring_schedules` — przechowuje "obietnice" przyszłych miesięcy.
- `POST /api/finance/zapisy/recurring`:
  - Tworzy zapisy tylko dla miesięcy <= bieżący (created_count)
  - Resztę zapisuje jako schedule (scheduled_count) do późniejszej materializacji
- `POST /api/finance/zapisy/recurring/materialize-due` — cron-friendly: tworzy zaległe zapisy gdy ich miesiąc nastąpi; usuwa zakończone schedules
- `POST /api/finance/zapisy/recurring/cleanup-future` — soft-delete istniejących przyszłych zapisów (migracja danych)
- Wydzielone funkcje pomocnicze: `_recurring_iter_months`, `_materialize_recurring_month`, `_save_recurring_schedule`

**Frontend** (`/app/frontend/src/components/admin/ToolsTab.js`):
- Nowa sekcja "Koszty cykliczne" w karcie Fakturowni z 2 przyciskami:
  - "Materializuj zaległości" — manualne uruchomienie cron'a
  - "Usuń przyszłe zapisy" — cleanup migracyjny (jeden raz)

**Weryfikacja**:
- E2E test: 12-mc recurring od stycznia → `created:6, scheduled:6` w czerwcu 2026 ✓
- `cleanup-future` przeniósł istniejące przyszłe wpisy do schedules ✓
- Rachunek wyników 2026: Lip-Gru = 0,00 (wcześniej 22 942,06 zł błędnie) ✓



### 2026-02 — iter95dm — "Soft refresh" pattern globalny (P0 — DONE)

User feedback: "wszystkie strony po zatwierdzeniu czegoś lub dodaniu się przeładowują — zrób to raz a porządnie".

**Strategia**: usunięto `setLoading(true)` z fetcherów wywoływanych po akcjach. Initial `useState(true)` zostaje — pierwszy render pokazuje loader, ale kolejne refetche (po save/delete/approve) są ciche: dane zostają widoczne, aktualizują się w miejscu.

**Pliki zmienione** (15 fetcherów):
- `BhpEmployees.js`, `WarehouseAdmin.js`, `PayrollAdmin.js`
- `Wyceny.js` (list fetcher)
- `Forecast.js` (główny load — gate `loading && !data`)
- `wyceny/{LaborPriceBook,EquipmentPriceBook,MaterialsPriceBook,PriceBookPicker,PriceBook,SuppliersManagerDialog}.js`
- `finance/{AuditPanel,PeriodsPanel,PaymentSummaryPanel,KPIDashboard,SprzedazPanel,RachunekWynikowPanel,BudowyPanel}.js`
- `budget/{ProgressPanel,SchedulePanel}.js`
- `admin/ToolsTab.js` (`EmployeeLinksCard`)

**Bonus**: `BudowyPanel` — `archive/unarchive/remove/toggleHasBudget` teraz wołają `fetchData(true)` (silent), nie `fetchData()`. Podobnie `RachunekWynikowPanel` — `renameKod/deleteKod`.

**Pliki celowo POMINIĘTE** (spinner sensowny dla użytkownika):
- `AdminLogin.js`, `WorkerEntry.js`, `ForemanEntry.js` (submit logowania)
- `AiPolishButton.js` (generowanie AI), `ExcelImportDialog.js` (upload pliku)
- `LocationsButton.js` (otwarcie modala — świeżo pobiera lokalizacje)

**Weryfikacja**:
- Klik "Wyłącz z wyceny" → fetchData(true) → `Loader overlay after click: None` ✓
- Finanse dashboard → 4 KPI tile loadują się in-place bez splash screen ✓
- Lint: clean ✓



### 2026-02 — iter95dl — "Wyłącz z wyceny" toggle (P1 — DONE)

Przełącznik per pozycja główna pozwalający wyłączyć ją z wyceny bez usuwania (klient zrezygnował z prac).

**Backend** (`/app/backend/routes/wyceny.py`):
- `PositionUpdate.excluded: Optional[bool]` — nowy field w modelu update
- `_build_wycena_export()` — filtruje `positions` z `excluded=True` przed agregacją → XLSX, PDF (positions/full/client) automatycznie pomijają wyłączone
- `_build_bom()` — wyłącza lines z pozycji excluded (BOM/zamówienia materiałów)
- `apply_to_budget` (Zaciągnij do budżetu) — pomija pozycje excluded podczas kopii do `budget_positions`

**Frontend**:
- `PosRow.js` — przycisk EyeOff/Eye obok kosza (`data-testid="pos-exclude-{id}"`), tło pozycji `bg-[#3a2c1c] text-[#94A3B8]` + badge `WYŁ.` w kolumnie KOD gdy excluded
- `SubRow.js` — prop `parentExcluded` → `opacity-40 line-through` na wszystkich podpozycjach + tooltip
- `Wyceny.js` — `grandTotal`, `wskazniki` (PC/PUM), `grandTotalOriginal` (negocjacje) pomijają `p.excluded`

**Weryfikacja**:
- Curl PATCH `excluded:true` → XLSX export 12324→12160 bytes (pozycja wycięta z dokumentu) ✓
- UI: kliknięcie EyeOff → row className zmienia się na "bg-[#3a2c1c] text-[#94A3B8]", badge `WYŁ.` widoczny ✓
- Klik ponownie → przywraca pozycję ✓



### 2026-02 — Mobile overflow fixes (Forecast tables + DetailsModal) (P0 — DONE)

**Plik**: `/app/frontend/src/components/Forecast.js`
- 3 główne tabele (`company-costs-table`, `building-costs-table`, `balance-table`) — wrapper zmieniony z `overflow-hidden` → `overflow-x-auto w-full`, do tabel dodane `min-w-[640px]` / `min-w-[820px]` / `min-w-[640px]`
- `DetailsModal` `DialogContent`: dodane `w-[95vw] max-h-[90vh] overflow-hidden flex flex-col`, wewnętrzny scroll zmieniony z `overflow-y-auto` → `overflow-auto` (oba osie), tabele dostały `min-w-[700px]` / `min-w-[900px]`

**Weryfikacja** screenshotem na viewport 375×800:
- Body scrollWidth = 375px (brak horyzontalnego rozsuwania strony) ✓
- Tabele scrollowalne wewnątrz kart (parent overflowX='auto', scrollW > clientW) ✓
- `NegotiationPanel` scrollW = clientW = 289 (brak overflow w panelu negocjacji) ✓
- `ZapisyPanel` parent scrollW=827, clientW=341 (działa horyzontalny scroll) ✓


## Recent changelog (most recent first)

### 2026-02 — iter95dj — Soft Dark redesign UI (design tokens + AdminDashboard + tabela wyceny + HoursTable + modale) (P1)

**Design blueprint**: `/app/design_guidelines.json` (wygenerowane przez agenta UX/UI z full kontekstem).

**Design tokens w `:root`** (`index.css`):
- `--bg-app: #181F30`, `--bg-surface-1: #222B40`, `--bg-surface-2: #2D3850`
- `--border-subtle: rgba(255,255,255,.05)`, `--border-default: rgba(255,255,255,.12)`, `--border-strong: rgba(255,255,255,.20)`
- `--text-primary: #F8FAFC`, `--text-secondary: #94A3B8`, `--text-muted: #64748B`
- `--brand-sage: #9DBC85`, `--brand-olive: #5F7552`, `--accent-gold: #FCD34D`, `--accent-orange: #F59E0B`, `--accent-red: #FCA5A5`, `--accent-blue: #60A5FA`
- Cienie: `--shadow-sm/md/lg/glow` (oparte na czarnej alfie + glow oliwkowy)
- Font body: `IBM Plex Sans` (zamiast Manrope, bardziej business)
- Body bg + html bg używają teraz tokenów

**AdminDashboard.js**:
- Header: logo czarne na białej pigułce `rounded-md p-1.5 bg-slate-100`, sticky `bg-[#181F30]/80 backdrop-blur`
- KPI cards: `bg-[#222B40] border-l-4 border-l-[brand color]` — lewy akcent na typie informacji (oliwka/złoto/niebieski/CTA)
- Karta „+ Dodaj zapis" jako wyróżniony call-to-action z `bg-[#9DBC85]/10` + glow hover + rotate ikony
- Karta „Tabela Godzin": jednolite tło zamiast gradientu, button `bg-[#9DBC85] text-slate-900`
- Tabs: **pigułki** zamiast bocznego paska — aktywna `bg-[#9DBC85] text-slate-900`, nieaktywne `bg-white/5 text-slate-400`
- Liczby KPI z `font-family: 'Cabinet Grotesk'` + `tabular-nums`

**HoursTable.js**: header `bg-[#222B40] border-b border-white/10`, button „Linki" zielona oliwka, miesiąc font Cabinet Grotesk

**Tabela wyceny** (`_shared.js`):
- `Th`: gradient `from-[#2D3850] to-[#222B40]`, border `white/10`, padding `py-2.5`, tracking-wider
- `Td`: border `white/5` (subtle), padding `py-1.5`

**Modale** (`ui/dialog.jsx`):
- Overlay: `bg-[#181F30]/85 backdrop-blur-sm` (zamiast `bg-black/80`) — łagodniejsze tło, klimat zachowany
- DialogContent: już responsive (iter95di) — `w-[95vw] max-h-[90vh] p-4 sm:p-6`

**Tested** mobile 375px + desktop 1440px ✅:
- Karty 1-kol mobile, 5-kol desktop, lewy akcent widoczny
- Header skompaktowany na telefonie, logo czytelne
- Tabs scrollują się jako pigułki
- Zero overflow

### 2026-02 — iter95di — Responsive iteracja 2: HoursTable, NegotiationPanel, Modale, ZapisyPanel (P1)

**Co poprawione w tej iteracji**:

1. **`HoursTable.js` header**:
   - `p-2 sm:p-4`, `flex-wrap`, `gap-2 sm:gap-4`
   - Nawigacja miesiąca: `gap-1 sm:gap-3`, `text-base sm:text-xl lg:text-2xl`
   - „Widok administratora" ukryty na mobile (`hidden sm:block`)
   - Button „Linki pracownikow" - tekst tylko na sm+, ikona zawsze widoczna
   - Container padding `p-2 sm:p-4`

2. **`NegotiationPanel.js`**:
   - Grid 3 kategorii: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` (było `grid-cols-2 lg:grid-cols-5`)
   - Karta „🎯 CAŁA WYCENA": `flex-wrap`, opis przejście na nową linię na mobile
   - Akcje: `flex-wrap` żeby Wyzeruj/Anuluj/Przyjmij się układały

3. **`ZapisyPanel.js`**:
   - Tabela `min-w-[800px]` + już ma `overflow-x-auto`
   - Modal: `w-[95vw] max-h-[90vh] overflow-y-auto`
   - Grid w modalu: `grid-cols-1 sm:grid-cols-2`

4. **`ui/dialog.jsx` (BAZOWY KOMPONENT — naprawia wszystkie modale w aplikacji)**:
   - `w-[95vw]` (zamiast `w-full`)
   - `max-h-[90vh] overflow-y-auto`
   - `p-4 sm:p-6` (responsive padding)
   - Skutek: każdy DialogContent w aplikacji jest teraz automatycznie mobile-friendly, niezależnie od własnego `max-w-*`

5. **Indywidualne modale Wyceny** (`ExportWycenaDialog`, `BomDialog`, `ConvertToBudgetDialog`, `SuppliersManagerDialog`, `PriceBookPicker`): dodano `w-[95vw] max-h-[90vh] overflow-y-auto`.

**Test mobile 375px ✅**:
- AdminDashboard, HoursTable: `body.scrollWidth == 375 == viewport`, **zero overflow**
- Header się układa, karty kpi 1-kol na mobile (bez wcześniejszego 2-kol), 2-kol na sm, 5-kol na md+
- Tabela HoursTable: sticky kolumny + scroll poziomy działa
- Mapa pełna szerokość, zakładki scrollują się

### 2026-02 — iter95dh — Responsive foundation: mobile-first base, sticky header, breakpoints (P1)

**Problemy znalezione w aplikacji**:
1. `html`/`body` nie miały `overflow-x: hidden` — sztywne tabele wyceny powodowały horizontal scroll całej strony.
2. Header `AdminDashboard`: `gap-4`, `text-xl` zbyt duże na mobile, brak `truncate` na emailu — wychodził poza ekran.
3. Tabela listy wycen (`wyceny-list`): `w-full` bez `scroll-x-wrap` — kolizja z `min-w-[2400px]` tabeli edytora.
4. Typografia: fixed `text-xl sm:text-2xl` skacze nieliniowo między breakpointami → użyto `clamp()` w `--fs-*`.
5. Brak globalnej klasy `.scroll-x-wrap` do owijania szerokich tabel.

**Co zostało poprawione**:
- **`/app/frontend/src/index.css`** (iter95dh sekcja na końcu):
  - `html, body { overflow-x: hidden; max-width: 100vw }`
  - `#root { overflow-x: clip }` (nowoczesna alternatywa, nie tnie sticky)
  - CSS variables `--fs-h1/h2/h3/body` z `clamp()` — responsywna typografia
  - Klasa `.scroll-x-wrap` z `overflow-x:auto` + `-webkit-overflow-scrolling: touch` + custom scrollbar
  - Breakpoint `< 768px`: większe touch-targety (`min-height: 36px`), forms `grid-template-columns: 1fr`, modale `max-h: 95vh`
  - Breakpoint 768-1024: utility `lg-only` ukrywanie
  - Touch device (`pointer: coarse`): checkboxy/radio min 18×18px
- **`AdminDashboard.js` header**:
  - `p-2 sm:p-4` (mniejsze paddingi mobile)
  - `flex-wrap` + `gap-2 sm:gap-4`
  - Logo `h-8 sm:h-10 lg:h-12` (skalowanie)
  - `truncate min-w-0` na heading/email
  - `text-base sm:text-xl lg:text-2xl` (3-stopniowa skala)
- **`Wyceny.js` lista wycen**: owinięta w `.scroll-x-wrap` + `min-w-[600px]` na tabeli (czytelność)
- **`Wyceny.js` tabela edytora** (już w iter95dg): `tableLayout: fixed`, `width: 1565px`, zwężone kolumny
- **`_shared.js Th`** (już w iter95dg): konwersja `w` na `"NNpx"` żeby przeglądarka respektowała szerokość

**Test mobile 375px / tablet 768px ✅**:
- `body.scrollWidth == window.innerWidth` (brak horizontal overflow)
- `html_overflow_x: hidden`, `body_overflow_x: hidden`
- Header się układa, karty kpi 2-kolumnowe, zakładki scroll poziomy
- Mapa pełna szerokość, formularze pełna szerokość

### 2026-02 — iter95dg — Wąskie czytelne kolumny w tabeli wyceny (P1)
- **Bug**: tabela miała `min-w-[2400px]` + tylko `minWidth` na `<th>` → kolumny rozciągały się proporcjonalnie do ~250px każda, wymuszając poziome przewijanie.
- **Fix `Th` w `_shared.js`**: zamiast `minWidth` ustawia `width + minWidth + maxWidth` w pikselach (konwersja `w` z numeru/stringa na `"NNpx"`).
- **Fix `<table>` w `Wyceny.js`**: `table-layout: fixed` + `width: 1565px` (suma szerokości kolumn) zamiast `min-w-[2400px]`.
- **Zredukowane szerokości**: KOD 60→50, RODZAJ 110→95, NAZWA 320→260, ILOŚĆ 80→70, JEDN 85→65, CENA 70→80, NARZUT/MARŻA 80→70, KAUCJA 90→85, KOSZT BUDOWY 100→90, BUDŻET 100→95, BUDŻET ZWOLNIONY 110→100, etykiety skrócone (BUDŻET ZWOL., KOSZT PROG., ZYSK PROG., ZYSK+KAUCJA DW).
- `Td`: padding zmniejszony `px-2 py-1.5` → `px-1.5 py-1` + `overflow-hidden` dla długiej treści.
- Tested ✅: tabela 1566px (vs 2400+ wcześniej), wszystkie kolumny respektują własną szerokość, brak poziomego scrolla na ekranie 1920px.

### 2026-02 — iter95df — Globalny slider „Cała wycena -X%" w trybie negocjacji (P1)
- Nowy slider w panelu negocjacji nad gridiem 3 kategorii: pomarańczowa karta „🎯 CAŁA WYCENA" z dużym inputem + 5 szybkimi przyciskami (-2, -3, -5, -7, -10%) + przyciskiem `×` (clear).
- Logika: `negFactors[type] = (1 + neg[type]/100) × (1 + neg.overall/100)` — multiplikatywnie z per-kategorią. Dzięki temu można łączyć np. „cała wycena -3% + robocizna dodatkowo -2% = -4.94% na robociźnie".
- Reset/wyzeruj/applyNegotiation: uwzględniają nowy `neg.overall`.
- Sprawdzenie matematyczne: budżet 898 922, slider `-4%` → spadek dokładnie 4.00% (-35 957 zł).

### 2026-02 — iter95de — Marża/narzut materiał: globalne domyślne + przełącznik 🔒/🔓 per pozycja (P1)
- **Default**: nowe materiały nie mają wpisanych `marza_pct`/`narzut_zapas_pct` → używają globalnych wartości z pól „Marża materiał" / „Narzut materiał" wyceny.
- **UI**: w komórkach narzut% i marża% dla materiałów wyświetla się globalna wartość (np. „8% 🔒"). Klik kłódki → zamienia się w edytowalny input (📝 + 🔓). Klik 🔓 → przywraca null (back to global).
- **Backend**: nowy endpoint `POST /wyceny/{id}/reset-material-margins` ustawia `marza_pct=null, narzut_zapas_pct=null` na wszystkich liniach typu `materials`. Nie rusza robocizny/sprzętu.
- **UI button**: „🔓 Wyczyść indywidualne marże materiałów" w panelu defaults wyceny — jeden klik czyści wszystkie indywidualne marże/narzuty materiałów, wracając do globalnej.
- Tested curl ✅: 2 materials (8/10 + null) → po reset oba `None/None`, labor z marza=99 nieruszony.

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
