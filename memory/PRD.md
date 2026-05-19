## Iteration 52 (2026-05-19) — GUS lookup też dla Wykonawcy + per-budowa override

### User feedback
- „nie pobiera danych z gus" — błąd `GUS: Not Found` w produkcji oznacza, że backend na Render nie został jeszcze zredeployowany (endpoint `/api/finance/gus-lookup/{nip}` istnieje tylko w preview po iter 51). User musi kliknąć **Render → Manual Deploy → Clear build cache & deploy**, żeby wgrać nowy kod backendu.
- „wykonawca niech tez jest zaciągany z gus po wprowadzeniu nipu" — przywrócone pole `wykonawca` w modal Finance > Budowy jako edytowalne textarea + NIP lookup. Zachowany jako stały fallback FeGrro gdy puste.

### Backend (`routes/budget.py`)
- Helper **`_resolve_wykonawca(budowa)`** — zwraca `budowa.wykonawca` jeśli uzupełniony, inaczej `FEGRRO_WYKONAWCA`. Używany w PDF, XLSX, i protokol_check.

### Frontend (`Finance.js`)
- Pole **Wykonawca** przywrócone jako textarea (rows 2) + `NipLookup` powyżej.
- Hint: „Puste = domyślnie FEGRRO SP. Z O.O. (NIP: 589-206-61-74). Pobierz z GUS dla innego wykonawcy."

### Wymagana akcja od użytkownika
1. **Save to GitHub** w Emergent.
2. **Render**: Manual Deploy → Clear build cache & deploy.
3. Po deployu endpoint GUS będzie działał w produkcji.

### Testy
- Preview: NIP `5892066174` → 200 + dane FeGrro ✓
- Live screenshot: pole Wykonawca uzupełnione, toast sukcesu ✓



## Iteration 51 (2026-05-19) — Integracja z GUS (Biała Lista MF) + Wykonawca stały w Finanse

### Backend (`routes/finance.py`)
- **`GET /api/finance/gus-lookup/{nip}`** — pobiera dane podmiotu z Białej Listy Podatników VAT Ministerstwa Finansów (`https://wl-api.mf.gov.pl/api/search/nip/{nip}?date=YYYY-MM-DD`):
  - bez kluczy API, bez auth do MF (limit ~10 req/min/IP)
  - walidacja: tylko 10 cyfr (odrzuca `\D`)
  - parsowanie: `name`, `workingAddress` lub `residenceAddress`, `regon`, `krs`, `statusVat`
  - zwraca też `formatted` — gotowy tekst do wstawienia w pole `zamawiajacy` (np. `"FEGRRO" SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ, NA RÓWNIKU 1, 83-314 SŁAWKI, NIP: 5892066174`)
  - HTTP 400 dla nieprawidłowego NIPu, 404 dla nieistniejących, 502 dla błędu sieci

### Frontend
- **`NipLookup`** (Finance.js) i **`BudgetNipLookup`** (Budget.js) — kompaktowy komponent: input NIP + przycisk „Pobierz z GUS" (olive green) + obsługa Enter:
  - po sukcesie: toast `Załadowano: {nazwa firmy}`, wartość wstawiana w textarea `zamawiajacy` przez prop `onResult`
  - po błędzie: toast z komunikatem z backendu (lub HTTP)
- **Wstawiony w 2 miejscach**:
  1. `Finance.js` → modal Budowy (`finance-budowa-modal`) — nad polem Zamawiający
  2. `Budget.js` → `ContractDataModal` — nad polem Zamawiający (otwierany gdy generujesz protokół a budowa nie ma uzupełnionych danych)
- **Spójność z Wykonawcą stałym** — usunięte pole tekstowe „Wykonawca" w modal Finance > Budowy, zastąpione statycznym info-boxem `FEGRRO SP. Z O.O. / NIP: 589-206-61-74` (już wcześniej zrobione w Budget.js iter 49).

### Co dostaje user
- Wpisuje `5892066174` → klika „Pobierz z GUS" → pole zamawiającego wypełnia się: `"FEGRRO" SPÓŁKA Z O.O., NA RÓWNIKU 1, 83-314 SŁAWKI, NIP: 5892066174` (w 1 sekundę).
- Walidacja statusu VAT (Czynny / Wykreślony) dostępna w response, ale na razie nie wyświetlana — można dodać jako badge w przyszłości.
- Nie wpisuje już ręcznie 80+ znaków nazwy + adres + NIP — zero literówek, jeden klik.

### Testy
- Backend curl real: NIP FeGrro `5892066174` → 200 z poprawnymi danymi ✓
- Backend curl invalid: NIP `0000000000` → 404 `nie istnieje w bialej liscie` ✓
- Frontend screenshot: input NIP + button widoczne nad textarea, info-box Wykonawca na dole ✓


## Iteration 50 (2026-05-19) — Etap = sekcja protokołu + dark branding widoku

### User feedback
- Sekcja w protokole pokazywała kategorię („BETON", „hej") zamiast etapu („Fundamenty"). Etapy są ważniejsze logicznie — pozycja należy do etapu, etap zawiera różne kategorie kosztów.
- Widok zakładki Protokół miał białe tło z jasno-zielonym headerem (jak Excel) — niespójny z resztą panelu admina (dark navy + olive). User wymaga brandingu strony.

### Backend
- **`_fetch_protokol_data`** rozszerzony: ładuje `budget_stages`, buduje `stages_map`, sortuje pozycje wg `stage.order → line.order → created_at`. Zwraca dodatkowo `stages_map`.
- **Generator JSON** (`protokol-view`): sekcja = stage_name (lub „Bez etapu"). Klucz w response: `row.stage_name`.
- **Generator PDF**: section row = `stage_name.upper()` (np. „FUNDAMENTY") z szarym tłem.
- **Generator XLSX**: identyczna logika — sekcja = etap, wielkie litery, szare tło.
- Wszystkie trzy generatory są spójne (jeden helper).

### Frontend (`Budget.js`)
- **`ProgressPanel` w pełnym brandingu strony**:
  - tło tabeli `#131C2F` (zamiast białego)
  - nagłówki grup (NARASTAJĄCO / POPRZEDNI / MIESIĄC ROZLICZ.) — olive `#4F6343` z białym tekstem
  - nagłówki kolumn (LP/Robocizna/...) — ciemniejszy olive `#3F5235`
  - wiersze sekcji (etapu) — `#5F7552` z białym uppercase tekstem i ikoną `▣`
  - wiersze pozycji — ciemne navy z białym/jasnym tekstem, **MIESIĄC ROZLICZENIOWY w złotym `#D4AF37`** (wartość) + złoty input (edytowalny)
  - hover row: lekko jaśniejszy
  - obramowania: `#2A3B59` (jednolite z całym panelem)
  - RAZEM: olive z złotymi liczbami miesiąca rozliczeniowego (subtelne wyróżnienie tego co user wpisuje)
- Input `MIESIĄC ROZLICZENIOWY %`: transparent background na tle navy, złoty tekst, focus = `#0B1120`, klasa `no-spinner` (bez strzałek).

### Co dostaje user
- W widoku Protokół sekcjami są etapy budowy („Fundamenty", „Konstrukcja", „Wykończenia"…), nie kategorie kosztowe.
- Cały widok wygląda jak naturalne rozszerzenie panelu admina — żadnego „obcego" białego ekranu Excelowego w środku ciemnego UI.
- Eksport PDF/XLSX nadal w jasnej kolorystyce (papier) — ale i tam sekcje to teraz etapy.

### Testy
- Backend: `/api/budget/{id}/protokol-view/2026/5` zwraca `SECTION: Bez etapu` jako stage_name ✓
- Backend: PDF 200 OK 25kb, XLSX 200 OK 29kb ✓
- Frontend live screenshot: dark theme z olive headerami i złotymi akcentami, ikona ▣ przy etapie ✓


## Iteration 49 (2026-05-19) — Kategorie + Etapy + Auto-Kaucja + Branding FEGRRO

### Backend (`routes/budget.py`)
- **`GET /api/budget/{budowa_id}/budowa-info`** — zwraca defaulty z `finance_budowy`: `kaucja_gir_pct`, `kaucja_dw_pct`, `umowa_nr`, `umowa_data`, `zamawiajacy`. Używane jako podpowiedzi w modalu pozycji.
- **Wykonawca utrwalony jako stała** `FEGRRO_WYKONAWCA = "FEGRRO SP. Z O.O.\nNIP: 589-206-61-74"`. Generatory PDF i XLSX zawsze wstawiają tę wartość — pole z budowy ignorowane. `protokol-check` zwraca ją jako `budowa.wykonawca`.
- XLSX `F14` ma wrap_text + wyższy wiersz (32px) dla dwóch linii (nazwa firmy + NIP).

### Frontend (`Budget.js`)

#### Kategorie + Etapy (Etapy)
- **`CategoryStageManager`** — uniwersalny modal (`mode="categories"` lub `"stages"`) do dodawania/usuwania. Etapy mogą mieć dodatkowo daty start/koniec.
- W panelu Budżet dwa przyciski w headerze: **`Etapy (N)`** i **`Kategorie (N)`** otwierają odpowiedni manager.
- **Tabela budżetu pogrupowana hierarchicznie**: `Etap > Kategoria > Pozycja`. Etapy wyróżnione olive-green background (`#4F6343/30`) z nazwą + datami (jeśli ustawione) + sumami plan/wykonanie. Kategorie jako podgrupy ze złotym/zielonym tekstem.

#### Modal pozycji
- **Kategoria**: dropdown z istniejących kategorii + przycisk `+` do dodania nowej inline (od razu wybierana po dodaniu).
- **Etap budowy**: dropdown z listy etapów + opcja "— bez etapu —".
- **Auto-calc Plan netto**: live podgląd `Ilość × Cena` w wyróżnionym kafelku (`bg-[#0B1120]`, złote `D4AF37`), z opcjonalnym `<details>` "Nadpisz wartość ręcznie" dla edge-case'ów.
- **Kaucja GIR / Kaucja DW**: domyślnie wartość z `finance_budowy` (etykieta `domyślnie 5%`), placeholder = default, podgląd kwoty pod inputem (`= {plan × pct} zł`).
- **Info box "Umowa / Zamawiający"** (read-only) — pokazuje aktualne dane z Finansów; ostrzega na czerwono jeśli brakuje (`uzupełnij przed protokołem`).

#### Modal "Dane umowy"
- **Usunięte pole Wykonawca** (zawsze FeGrro). W jego miejsce statyczny info-box z brandingiem firmy (`FEGRRO SP. Z O.O.` / `NIP: 589-206-61-74`).

### Co dostaje user
- Tworzy Kategorię / Etap raz (z poziomu zakładki Budżet), używa wszędzie.
- Nie wpisuje już ręcznie kaucji — domyślne wartości zaciągane z Finansów per budowa.
- Plan netto liczy się sam (Ilość × Cena), z opcją nadpisania dla nietypowych przypadków.
- Tabela budżetu pogrupowana jak na placu: Etap (np. „Stan zerowy") > Kategoria (np. „Beton") > Pozycje.
- Protokół zawsze ma poprawnego Wykonawcę FeGrro z NIPem — bez pomyłek z innymi danymi.

### Testy
- Backend: `/api/budget/{id}/budowa-info` zwraca pełne defaulty (kaucja 5/2%, umowa, zamawiający) ✓
- Backend: PDF zawiera `WYKONAWCA: FEGRRO SP. Z O.O.\nNIP: 589-206-61-74` (zweryfikowane przez pypdf) ✓
- Frontend live screenshot: dropdowny + auto-Kaucja + auto-Plan + info-box widoczne i działające ✓


## Iteration 48 (2026-05-19) — Protokoł w stylu Excel (widok 1:1 jak arkusz klienta)

### Problem
Zakładka „% Protokół" w Budżetowaniu pokazywała siatkę pozycja × miesiąc (Sty–Gru z polami % w każdym miesiącu). User chciał, żeby UI wyglądał DOKŁADNIE jak jego arkusz Excel: kolumny **LP / Robocizna / Jd. / Ilość / Cena / Wartość + NARASTAJĄCO (val+%) + POPRZEDNI MIESIĄC (val+%) + MIESIĄC ROZLICZENIOWY (val+%)** + wiersz RAZEM. Edytowalna tylko jedna kolumna procentowa.

### Backend
- **Nowy endpoint `GET /budget/{budowa_id}/protokol-view/{year}/{month}`** w `routes/budget.py` — zwraca dane w formacie identycznym z generatorem XLSX:
  - `rows`: lista wierszy typu `section` (nagłówek kategorii) i `line` (pozycja z wyliczonymi narastająco/poprzedni/miesiąc rozliczeniowy)
  - `totals`: zsumowane plan_netto, narast_val, prev_val, miesiac_val + % każdego względem planu
  - `nr`: automatyczny numer protokołu (liczba poprzednich miesięcy z przerobem + 1)
- Wykorzystuje istniejący helper `_fetch_protokol_data` (ta sama logika co XLSX/PDF — gwarantuje spójność widoku z eksportem).

### Frontend (`Budget.js`)
- **`ProgressPanel` całkowicie przepisany** — usunięta siatka 12 miesięcy, w jej miejsce tabela 12-kolumnowa w stylu firmowym Excel:
  - jasnozielony header `#9DBC85` z czarnymi obramowaniami + grupowane nagłówki (NARASTAJĄCO/POPRZEDNI/ROZLICZ.)
  - białe tło wierszy, szare wiersze sekcji kategorii (`#D9D9D9`)
  - kolumny `Wartość` (plan) i `NARASTAJĄCO/POPRZEDNI` read-only — wyliczane przez backend
  - kolumna `MIESIĄC ROZLICZENIOWY %` jako edytowalny `input` (tło `#FFF8DC` — żółtawe, podświetlenie przy focus)
  - wiersz `RAZEM` z sumami (zielone tło)
- **Selektor miesiąca rozliczeniowego** w headerze panelu (Sty–Gru) — zmiana miesiąca przeładowuje dane.
- **Inline auto-save** — onBlur na pole `%` wywołuje `POST /budget/lines/{id}/progress` + optymistyczna aktualizacja totali (bez refetcha).
- **Walidacja lokalna** — `prev_pct + nowa_wartosc > 100` blokowane z toastem.
- Przyciski XLSX/PDF (`ProtokolDownloaderInline`) obok selektora miesiąca — dziedziczą wybór miesiąca z głównego stanu.

### Co dostaje user
- Wpisuje % w jednej kolumnie → widzi natychmiast wartość zł, RAZEM przelicza się automatycznie.
- Plan netto, ilość, cena, wartość pozycji = read-only podgląd (zmiana w zakładce „Budżet").
- Możliwość zmiany miesiąca rozliczeniowego bez wychodzenia z widoku → szybkie wprowadzanie protokołów historycznych.
- Wyjątkowo wierne odwzorowanie arkusza referencyjnego klienta (`a2x11a0p_image.png`).

### Testy
- Backend smoke: `GET /api/budget/{bid}/protokol-view/2026/2` zwraca `rows`+`totals` z poprawnym numerem protokołu.
- Frontend live screenshot: widok 1:1 jak Excel ✓ — header, kolumny, sekcja kategorii, edytowalny input, RAZEM.


## Iteration 47 (2026-05-17) — Auto-resync + UX poprawy w Finansach

### Auto-resync zapobiegawczy
Dodano `_do_sync_month()` wywolanie w 4 punktach (try/except, fallback do crona 03:00):
- `payroll.py:update_payroll()` - po PUT rate/fixed/bonus/driver
- `hours.py:create_hour_entry()` - po POST nowych godzin
- `penalties.py:create_penalty()` - po POST kary
- `penalties.py:delete_penalty()` - po DELETE kary

Skutek: zmiana godziny lub wyplaty natychmiast aktualizuje `finance_zapisy` -> banner mismatch nigdy nie powinien sie pojawic w normalnym workflow.

### UX: separatory w tabelach Finansow
Nowa klasa CSS `.finance-grid-table` (w `index.css`):
- 1px szare granice miedzy wszystkimi komorkami
- 2px ciemniejsze granice okalajace (pierwsza i ostatnia kolumna)
- Hover effect na wierszach
Dodana do `finance-rw-table` i `finance-sprzedaz-table`. Grupy KP/KBB/KSB/KSP rozdzielone `border-t-4 border-[#5F7151]`.

### Filtr miesiaca w Sprzedaz
- Backend: `GET /finance/sprzedaz?year=Y&month=M` (month opcjonalne, gdy podany filtruje zapisy i invoices)
- Frontend: nowy select `Caly rok | Sty | Lut | ...` w naglowku panelu Sprzedaz
- Tytul dynamiczny: "Sprzedaz per budowa 2026 - Maj" lub "Sprzedaz per budowa 2026 (caly rok)"


## Iteration 46 (2026-05-17) — Banner mismatch nie sumuje projekcji przyszlych miesiecy

### Bug
Banner pokazywal niezgodnosc 137 640 zl dla "Caly rok 2026" mimo poprawnego sync. Powod: frontend sumowal `/api/payroll` dla wszystkich 12 miesiecy, a backend dla mc 6-12 (przyszle) zwraca PROJEKCJE z fallbacku (LESZEK fixed 8000, DANIEL fixed 10000, ANDRII driver 500) = 18 500 zl/miesiac × 7 miesiecy = 129 500 zl sztucznej roznicy.

### Naprawa
Frontend `fetchData()`:
- Bierze tylko miesiace od stycznia do **biezacego miesiaca wlacznie**
- Dla wybranego konkretnego miesiaca: jesli przyszly -> `setPayrollExpected(null)` (brak bannera)
- `maxMonth = year < currentYear ? 12 : (year > currentYear ? 0 : currentMonth)`


## Iteration 45 (2026-05-17) — Naprawa nazw budow w Payroll + banner niezgodnosci KP

### Bug: backend uzywal niewlasciwej kolekcji
PayrollAdmin pokazywal wszystkie godziny w pseudo-budowie "(bez budowy)" mimo ze hour_entries mialy realne site_id. Przyczyna: `db.sites.find()` - ale wlasciwa kolekcja to `db.construction_sites` (z `db.sites` migrowano w starej iteracji).

### Naprawa - 3 wystapienia
- `payroll.py:145` - `db.sites.find` -> `db.construction_sites.find` (mapowanie site_name dla sites_breakdown)
- `hours.py:26` - `db.sites.find_one` -> `db.construction_sites.find_one` (check existing hours na innej budowie)
- `warehouse.py:215` - `db.sites.find_one` -> `db.construction_sites.find_one` (lookup nazwy budowy)

### Skutek po deploy
- PayrollAdmin "Podzial kosztu wynagrodzen na budowy" pokaze realne nazwy: Castorama, LEBA, SASINO, DRUTEX, GUS-LO itp.
- "(bez budowy)" tylko dla pracownikow ktorzy faktycznie nie maja godzin przypisanych do zadnej budowy

### Banner niezgodnosci KP (Finanse → Zapisy)
- Liczy oczekiwana sume KP z /api/payroll (per pracownik: ha + bonus + driver + o_plus - o_minus - kary)
- Porownuje z suma KP_WYNAGRODZENIA (source=auto_payroll) z rows
- Jesli roznica >1 zl -> czerwony banner z przyciskiem "Sync ten miesiac" / "Sync wszystkie"


## Iteration 44 (2026-05-17) — Manualne budowy w tabeli godzin

### Problem
Budowy dodane przez UI (np. DRUTEX w Finanse → Budowy) nie pokazywaly sie w tabeli godzin, mimo `show_in_hours=true` i poprawnego `finance_budowa_id` w construction_sites.

### Diagnoza
`HoursTable.js` linia 77 mial filter `s.excel_column` - akceptowal tylko sites zsynchronizowane z Excela (legacy). Sites dodane manualnie maja `excel_column=null` ale zawsze maja `finance_budowa_id`.

### Naprawa
Filter zmieniony na `s.excel_column || s.finance_budowa_id` - akceptuje:
1. Sites z Excel (legacy)
2. Sites z linkiem do finance_budowy (manual, dodane w UI z Finanse → Budowy)

`show_in_hours=false` dalej dziala (backend `_remove_from_sites` usuwa caly site, wiec nie ma go w `/api/sites` w ogole).


## Iteration 43 (2026-05-17) — Poprawki UX

### Kolejnosc kolumn w PayrollAdmin
Headery "Stala | Godziny" byly zamienione miejscami z komorkami (pod "Stala" pokazywala sie liczba godzin, pod "Godziny" - checkbox is_fixed_salary). Naprawione: teraz "Pracownik | Godziny | Stala | Stawka zl/h | ...".

### Format polski PLN we wszystkich modulach
- PayrollAdmin: `fmt()` przepisana z `n.toFixed(2).replace(/\.?0+$/,'')` na polski format z separatorem tysiecy: `25400.5` -> `"25 400,5"`. Stosowane wszedzie w tym pliku.
- HoursTable: zaliczki/kary inline w wierszach i modalach z `toLocaleString('pl-PL')`
- Finance.js: juz mial `fmtPLN`/`fmtNum` z `toLocaleString('pl-PL')` (iter 40)

### Format pelnego separatora
`fmt(25400.56)` → `"25 400,56"` (NBSP zamienione na zwykle space)
`fmt(0)` → `"0"`
`fmt(12)` → `"12"`
`fmt(12.5)` → `"12,5"`


## Iteration 42 (2026-05-17) — Fallback payroll_records + automatyczny resync codzienny

### Drugi bug w sync
`/api/payroll` ma fallback: jesli pracownik nie ma `payroll_record` dla danego miesiaca, bierze rate/fixed/driver z najnowszego POPRZEDNIEGO miesiaca. Sync nie mial tego fallbacku - dlatego maj dawal 14 105 zl zamiast 124 141 zl (29 z 33 pracownikow nie mialo rekordu w maju, ich payout liczyl sie z rate=0).

### Naprawa
W `_do_sync_month()` po pobraniu payroll_records dla biezacego miesiaca:
- Lista `missing_ids` (pracownicy bez rekordu)
- Dla nich query: `find({"employee_id": {"$in": missing_ids}, "$or": [{"year": {"$lt": year}}, {"year": year, "month": {"$lt": month}}]}).sort([("year",-1),("month",-1)])`
- Pierwszy wynik = najnowszy poprzedni → kopiuje rate/is_fixed_salary/fixed_salary_amount/driver_zl. Bonusy/other_zl NIE kopiowane (specyficzne miesiacowo).

### Automatyczny resync codzienny (cron)
- Dodany `cron_payroll_sync()` w `finance.py` - codziennie o 03:00 wywoluje `_do_sync_month` dla wszystkich miesiecy od 2026-01 do biezacego
- Zarejestrowane w `server.py` jako `payroll_sync_daily` (CronTrigger hour=3, minute=0)
- Status zapisywany w `finance_settings.last_payroll_sync_at/status/summary/error`

### Endpoint dla recznego wymuszenia
- `POST /api/finance/sync-all-months?from_year=2026&from_month=1` (wczesniejsza iteracja)


## Iteration 41 (2026-05-17) — Naprawa alokacji wyplat per budowa

### Diagnoza problemu
Stary algorytm `sync-current-month` liczyl `hours_amount` z `emp_total_h` ktore ograniczalo godziny do TYLKO budow finansowych (z `finance_budowa_id`). Pracownik z 133h w hour_entries gdzie 123h jest na "(bez budowy)" mial liczona wyplate z 10h finansowych zamiast 133h pelnych - czyli wyplata pracownika spadala 13x. Suma KP per wszystkie budowy = 14 105 zł zamiast 124 141 zł.

### Naprawa
- `hours_per_emp_full` = wszystkie godziny pracownika niezaleznie od site_id (do wzoru z Wyplat)
- `wyplata_emp = (full_h × rate albo fixed) + bonus + driver + o_plus - o_minus - kary` (BEZ odejmowania zaliczek - zaliczki to wczesniejsza wyplata, nie zmniejsza kosztu firmy)
- Alokacja pro-rata `(h_na_budowie / full_h) × wyplata_emp` na kazda budowe finansowa
- Reszta `(1 - sum_ratio) × wyplata_emp` → nowy zapis KP_WYNAGRODZENIA z `budowa_id=None` ("bez budowy")

### Nowy endpoint
- `POST /api/finance/sync-all-months?from_year=2026&from_month=1` - resync WSZYSTKICH miesiecy od podanego do biezacego (wszystkie godziny+wyplaty -> zapisy)
- Refaktor: `_do_sync_month()` helper uzywany przez `/sync-current-month` i `/sync-all-months`

### Validation
- Produkcja przed naprawa: total_kp=14 105 zl, payroll total=124 141 zl ❌
- Po deploy + sync-all-months: total_kp powinno =~ 124 141 zl ✅


## Iteration 40 (2026-05-17) — Filtr typu faktury + format polski PLN

### Frontend
- Format polski w calym module Finanse: `fmtPLN(v)` → `"25 450,50 zł"` (z separatorem tysiecznym spacja, przecinkiem dziesietnym i symbolem zl) dla wyroznionych pol, `fmtNum(v)` → `"25 450,50"` (bez zl) dla gestych tabel 12-miesiecznych
- Filtr 3-statowy w sekcji Zapisy: **Wszystko (208) | Koszty (191) | Sprzedaz (17)** - kliknij aby przefiltrowac liste faktur
- Sprzedazowe faktury maja zielony badge `SPRZEDAZ` obok pomaranczowego `FAKTUROWNIA`

### Czego nie ruszono
- `fmt(v)` zostawione dla procentow (`2%`, `5%`) w widoku Budowy - bo to nie jest kwota PLN
- `renderRow` w Rachunku Wynikow przyjmuje opcjonalny `numFmt` (default fmtNum) dla ewentualnej flexibility - na razie wszystkie kwoty z fmtNum


## Iteration 39 (2026-05-17) — Faktury + pozycje (split invoice)

### Problem rozwiazany
Wczesniej sync z Fakturowni tworzyl 1 zapis na POZYCJE faktury (X pozycji = X wierszy). Admin nie widzial nagłówka faktury, nie mogł przypisac calej faktury "spotem", a tylko per pozycja - co bylo mecz przy fakturach z 40+ pozycjami.

### Nowy data model
- **Nowa kolekcja `finance_invoices`** (naglowki faktur z Fakturowni): id, fakturownia_invoice_id, nr_faktury, kontrahent, date, year/month, netto, brutto, is_income, kod_id, kod_category, budowa_id, source, notes
- **`finance_zapisy`** (pozycje) zyskuje pole `parent_invoice_id` linkujace do naglowka

### Logika nieduplikacji
Faktura wnosi do aggregacji **(netto − suma_przypisanych_pozycji)**. Pozycje wnosza swoja netto. Brak dublowania - faktura z netto=9694.65 i jedna pozycja 130.47 przypisana do KBB_STAL daje:
- KBB_STAL: 130.47 (pozycja)
- KBB_BETON (na ktore faktura przypisana): 9564.18 (remainder)
- Suma: 9694.65 = netto faktury

### Backend endpointy
- `GET /api/finance/invoices?year&month` - lista mieszana: faktury z `is_invoice=true` (+ positions + remainder_netto + assigned_positions_sum) i standalone manual zapisy z `is_invoice=false`. Sortowanie po dacie malejaco.
- `PUT /api/finance/invoices/{id}` - przypisanie kod_id/budowa_id (z `clear_kod/clear_budowa` flagami dla odpinania)
- `DELETE /api/finance/invoices/{id}` - usuniecie naglowka + KASKADA pozycji
- `POST /api/finance/reset-fakturownia-data?confirm=RESET` - JEDNORAZOWY reset wszystkich faktur i pozycji z source=fakturownia
- Aggregations (`rachunek-wynikow`, `sprzedaz`) uwzgledniaja wirtualne wpisy z remainder faktur

### Frontend
- `ZapisyPanel` przerobiony: zagnieżdzona tabela. Naglowek faktury = parent row, pozycje schowane, rozwijane ▶/▼. Każdy poziom (faktura i pozycja) ma własne dropdowny `Kod kosztu` i `Budowa`. Naglowek pokazuje "Reszta: X zl" gdy niektore pozycje sa przypisane osobno.
- Standalone manual zapisy widoczne jako solo-row w tej samej liscie, mieszane chronologicznie.
- Sortowanie wg daty malejaco, badge "FAKTUROWNIA" + "SPRZEDAZ" + "RECZNY".

### Auto-kod
- Faktury sprzedazowe (income=yes) → naglowek automatycznie dostaje kod_id=PZS
- Pozycje NIE dostaja juz auto-kodu (wczesniej mialy PZS) - admin decyduje czy przypisac wsobie czy do calej faktury


## Iteration 38 (2026-05-17) — Production deploy fixes + Fakturownia sync warnings

### Backend fixes
- **Python 3.13.5 pinning na Render**: `.python-version`, `runtime.txt`, `render.yaml` zaktualizowane. Default Render 3.14.3 ma bug w `typing.Union` -> `httpx 0.28` -> AttributeError. Powod: Render od 11.02.2026 ignoruje `runtime.txt` z mniejszym pinningu (`python-3.11.10` nieobslugiwany), trzeba `.python-version` LUB pelny semver w `PYTHON_VERSION`.
- **POST /api/finance/test-fakturownia**: przepisany na `requests` (synchroniczny, omija bug Python 3.14). Czytelne komunikaty bledow zamiast HTTP 500 (Nieprawidlowy klucz API, Subdomena nie istnieje, Timeout, etc.). Defensywne czyszczenie subdomeny: usuwa `https://`, `.fakturownia.pl`, sciezki.
- **PUT /api/finance/settings**: automatycznie wycina `.fakturownia.pl` z subdomeny przy zapisie (np. `fegrrospzoo.fakturownia.pl` → `fegrrospzoo`).
- **Sync status tracking**: `_record_fakturownia_sync_error()` helper. Wszystkie scenariusze (cron, manual sync, test) zapisuja `last_fakturownia_sync_status` (`ok`/`error`) + `last_fakturownia_sync_error` (krotki opis) do `finance_settings`.

### Frontend
- **ToolsTab.js `describeError()` helper**: czytelne komunikaty z HTTP code + treoscia bledu (np. "Test nieudany (HTTP 401: Nieprawidlowy klucz API)" zamiast generycznego "Blad testu polaczenia").
- **Finance.js banner `FakturowniaSyncWarning`** (nowy komponent): czerwony baner z ostrzezeniem nad wszystkimi podzakladkami Finansow. Pokazuje sie tylko gdy `last_fakturownia_sync_status === 'error'`. Auto-pollinguje co 60s (admin nie musi odswiezac). Mozna ukryc.

### Bug fixes znalezione
1. Produkcja na Render miala stary kod (subdomena zapisana jako `fegrrospzoo.fakturownia.pl` zamiast `fegrrospzoo`) -> 500 Internal Server Error.
2. Render default Python 3.14.3 ma bug `'typing.Union' object has no attribute '__module__'` z httpx -> wszystkie endpointy uzywajace httpx wyrzucaly AttributeError.

### Deployment workflow
- Save to GitHub w Emergent
- Render: `Manual Deploy → Clear build cache & deploy` (potrzebne aby wymusic Python 3.13.5 zamiast cache 3.14.3)
- Po deploy: w UI Narzedzia wpisac klucz API i subdomena `fegrrospzoo`


## Iteration 37 (2026-05-17) — Modul Finanse

Stworzono kompleksowy modul **Finanse** odwzorowujacy plik Excel "Bilans 2026" z 4 podzakladkami w Panelu Admina.

### Backend (`/app/backend/routes/finance.py`)
- Kolekcje: `finance_kody` (32 kody z Excela Kody!), `finance_budowy` (nazwy budow finansowych), `finance_zapisy` (dziennik ksiegowy)
- Endpointy:
  - `GET /api/finance/kody` (z auto-seedem)
  - `GET/POST/PUT/DELETE /api/finance/budowy` + `/archive`, `/unarchive`
  - `GET/POST/PUT/DELETE /api/finance/zapisy` (filtr: year, month, budowa_id, kod_id)
  - `GET /api/finance/rachunek-wynikow?year=YYYY`
  - `GET /api/finance/sprzedaz?year=YYYY`
- Logika identyczna jak Excel: SUMIFS po kategoriach, alokacja pro-rata KSP_STAWKI/UKLADY, Kaucja GIR/DW = 2% z PZS

### Integracja z lista godzin
- Budowa z `show_in_hours=true` → automatyczny wpis w `construction_sites` (link przez `finance_budowa_id`)
- Archiwizacja w finansach → usuwa z `construction_sites`, ale dane zapisow zostaja
- Hard delete blokowany jezeli sa zapisy

### Frontend (`/app/frontend/src/components/Finance.js`, ~700 linii)
4 podzakladki:
1. **Budowy** — CRUD, flagi `show_in_hours`, `is_gir`, `is_dw`, archive/unarchive
2. **Zapisy** — dziennik ksiegowy, ręczne dodawanie/edycja/usuwanie, filtr miesiac/rok
3. **Rachunek wynikow** — tabela 12 msc × kategorie, rozwijane grupy (KP/KBB/KSB/KSP), wskazniki per R-G
4. **Sprzedaz** — tabela per budowa, kolumny E-X (szczegoly: KP-alok, KBB-alok, marze brutto/I/II/III) schowane pod toggle "Rozwin szczegoly", Y-AI (Przychod, Koszt, Roznica, Godz., Przych/Rg, Zysk/Rg, Koszt/Rg, Kszt zmienny) widoczne od razu

### Formatowanie liczb
Helper `fmt(v)`: 0.00→"0", 12.50→"12.5". `fmtPct(v)`: 0.55→"55%".

### Mock/zaslepki
- Import z Fakturowni: NIE zaimplementowane (P1). Tylko reczne wpisywanie zapisow przez UI.

### Iteration 37.1 (2026-05-17) — Auto-sync z Godzin/Wyplat + Fakturownia API key
- **Tools > Fakturownia - API key**: nowa karta w zakladce Narzedzia. Admin moze ustawic/zaktualizowac klucz API i subdomene (`PUT /api/finance/settings`). Klucz przechowywany w `db.finance_settings`, GET zwraca tylko podglad `****abcd`.
- **POST /api/finance/sync-current-month**: synchronizuje TYLKO biezacy miesiac (today.year/today.month):
  - Dla kazdej budowy z `show_in_hours=true`: zapis `kod=G, netto=suma godzin z hour_entries`
  - Dla kazdego pracownika z godzinami: alokacja pro-rata wg `(godziny_w_budowie / godziny_total)` na kazdej budowie, `kod=KP_WYNAGRODZENIA, netto = (hours_amount + bonus + driver + other_plus - other_minus - advances - penalties) * ratio`
  - Idempotentne: usuwa stare `source in [auto_hours, auto_payroll]` przed insertem.
  - NIE rusza `source=manual` ani innych miesiecy.
- **UI Sync** w zakladce Finanse > Zapisy: pomaranczowy przycisk "Sync biezacy miesiac". Toast pokazuje wynik (g_zapisy + kp_zapisy + sumy).
- **Badge AUTO** w tabeli zapisow przy wierszach auto-zsynchronizowanych.

### Iteration 37.2 (2026-05-17) — Pelna integracja Fakturownia API
- **POST /api/finance/sync-from-fakturownia?year&month** (default biezacy): pobiera faktury KOSZTOWE z Fakturowni przez `GET /invoices.json?income=no&include_positions=true&period=more`. Kazda POZYCJA faktury staje sie osobnym wpisem w `finance_zapisy` → admin moze podzielic koszt na rozne budowy.
- **POST /api/finance/sync-from-fakturownia?from_year&from_month**: tryb RANGE - pobiera od podanego miesiaca do biezacego, z globalnym cleanup orphans na koncu.
- **Idempotentnie**: aktualizacja po `fakturownia_position_id` (klucz globalny, nie ograniczony do miesiaca). Zachowuje admin assignments. Usuwa wpisy ktorych nie ma juz w Fakturowni TYLKO gdy admin jeszcze nie przypisal kodu.
- **POST /api/finance/test-fakturownia**: test polaczenia + zwraca company_name.
- **CRON `cron_fakturownia_sync` co 30 min** (`IntervalTrigger(minutes=30)`): pobiera WSZYSTKIE miesiace od `SYNC_FROM_YEAR=2026, SYNC_FROM_MONTH=1` do biezacego, z globalnym cleanup na koncu.
- **UI Tools**: pole subdomeny + klucza API + przyciski Test/Pobierz od stycznia 2026.
- **UI Finanse > Zapisy**:
  - Nowa kolumna "Pozycja" (`pozycja_nazwa`)
  - Wiersze z `source=fakturownia` i bez kod_id maja zolta ramke + licznik "X bez kodu" z filtrem
  - Dla wierszy `source=fakturownia`: dropdown "Kod kosztu" i "Budowa" edytowalne inline z auto-save
- **Realny test PASS**: konto fegrrospzoo, klucz `AfYri_SX_7FmsURwhsMM`, 191 faktur, 473 pozycje od stycznia 2026.

### Iteration 37.3 (2026-05-17) — Pelna dwukierunkowa sync tabela godzin <-> finanse
- **POST /api/sites** (tabela godzin) → auto-tworzy wpis w `finance_budowy` z `show_in_hours=true`, link wsteczny przez `construction_site_id` i `finance_budowa_id`.
- **POST /api/finance/budowy/import-from-sites**: masowy import wszystkich budow z `construction_sites` ktore jeszcze nie maja `finance_budowa_id`. Pomija duplikaty po nazwie i kategorii != 'budowa'.
- **DELETE/archive w Finance** → usuwa z `construction_sites` (czyli z tabeli godzin) - juz wczesniej dzialalo.
- **UI Finanse > Budowy**: nowy zolty przycisk "Importuj z tabeli godzin".


# FeGrro - System Rejestracji Godzin Pracy

## Production URLs
- **Frontend (Vercel) - default**: https://fegrro-godziny.vercel.app  *(zapasowy, zawsze dziala)*
  - Admin login: https://fegrro-godziny.vercel.app/login
  - Brygadzista login: https://fegrro-godziny.vercel.app/foreman
- **Frontend (custom domain)**: https://godziny.fegrro.pl  *(czeka na CNAME w jdm.pl)*
- **Sandbox preview**: https://nostalgic-visvesvaraya-4.preview.emergentagent.com
- **Vercel project**: doominik's projects → fegrro-godziny (Hobby plan)
- **Domain registrar**: Jdm.pl sp. z o.o. (https://jdm.pl/panel)
- **DNS instruction (Vercel)**: CNAME `godziny` → `b1162803be5ee9ae.vercel-dns-017.com`

## Problem Statement
Aplikacja mobilna i webowa dla firm budowlanych do logowania godzin pracy pracowników na budowach.

## Core Requirements
- Pracownicy i budowy synchronizowane z Excel OneDrive
- Write-back: sumy godzin/zaliczek/kar zapisywane do Excela
- Brygadziści rejestrują się, admin zatwierdza i przypisuje budowy
- Publiczne linki dla pracowników do przeglądania godzin, zaliczek, kar i zgłaszania nieobecności
- Dark mode UI z brandingiem FeGrro
- PWA (instalacja na ekranie głównym)

## Architecture (po refaktoryzacji 2026-02)
```
/app/backend/
├── server.py (~120 linii - setup, CORS, scheduler, route imports)
├── database.py (MongoDB connection)
├── utils.py (Polish month maps)
├── auth.py (JWT, bcrypt, token 365 dni)
├── models.py (Pydantic models)
├── onedrive.py (MS Graph API, case-insensitive matching)
├── routes/
│   ├── auth.py, employees.py (sorted A-Z), sites.py, assignments.py
│   ├── hours.py, requests.py, absences.py, advances.py
│   ├── penalties.py, reports.py, sync.py (excel_column mapping), public.py

/app/frontend/src/components/
├── AdminDashboard.js (current month employees count)
├── HoursTable.js (NN/NU, auto-scroll, employee count per site)
├── WorkerDashboard.js (NN/NU for foremen)
├── AdminLogin.js (auto-redirect if logged in)
├── ForemanEntry.js (auto-redirect if logged in)
├── PublicHours.js, WorkerEntry.js
```

## Completed Features
- Login admin / rejestracja brygadzistów
- Tabela godzin z edycją inline + Bulk hours entry
- Przypisywanie pracowników do budów + Auto-transfer
- Excel sync (OneDrive read/write) z excel_column mapping
- Cron: automatyczny zapis 2. dnia miesiąca + codzienny sync
- PDF raportów + Publiczne linki
- Zgłaszanie nieobecności + Outlook Calendar
- Kary ze zdjęciami (image_data base64)
- PWA + Google Maps dla budów
- Powiadomienia >10h
- Liczba pracowników przy budowie (2026-04)
- Wyśrodkowany spinner ładowania (2026-04)
- Sortowanie pracowników A-Z z backendu (2026-04)
- Dashboard: liczba pracowników z bieżącego miesiąca (2026-04)
- Auto-logowanie (token 365 dni + auto-redirect) (2026-04)
- NN/NU w tabeli godzin dla admina i brygadzisty (2026-04)
- Auto-scroll do wczoraj/dziś w tabeli (2026-04)
- Węższa kolumna nazwisk na mobile (2026-04)
- Strona główna → brygadzista, /login → admin (2026-04)
- Excel write: case-insensitive + excel_column mapping (2026-04)

## Completed (2026-04-20)
- Fix fakturownia_sync_fast.py UnboundLocalError (usunięty lokalny import datetime wewnątrz sync())
- Konwersja Excel serial date (46023) → datetime w kolumnie C + Netto/Brutto jako float (SUMIFS działa)
- Skrypt pisze TYLKO A3:K279 (Wypłaty) i A281:H∞ (Fakturownia) - reszta nietknięta
- Desktop notifications (osascript) przy błędach sync
- PWA: dynamiczny manifest dla `/hours/{token}` (start_url = link pracownika), stare kafelki przekierowują do godzin po zapamiętaniu tokenu w localStorage

## Completed (2026-04-26)
- Zakladka "Sprzet" w panelu admina + sekcja "Moj sprzet" w panelu brygadzisty
  - Admin: pojedyncza tabela ze sprzetem i przypisaniami, kolumny:
    Historia przekazania | Nazwa | Marka | Ilosc dostepnych sztuk | Zdane do magazynu do naprawy | Dostepne w magazynie | <pionowe naglowki brygadzistow z totalami>
  - Edycja inline: total_quantity, broken_quantity, ilosc per brygadzista
  - Klik na nazwe sprzetu -> modal edycji (nazwa/marka/status/zdjecie/usun)
  - Klik "Historia" -> modal z historia danego sprzetu
  - Brygadzista: lista swojego sprzetu, przekazanie innemu (czerwony baner u odbiorcy z Akceptuj/Odrzuc), zgloszenie usterki ze zdjeciem
  - Walidacja: assigned + broken_in_warehouse <= total_quantity
  - Pelna historia (Utworzono/Edytowano/Przypisano/Przekazanie zlozone-zaakceptowane-odrzucone/Usterka)
  - 27/27 testow backendu pass; admin UI i banner brygadzisty zweryfikowane live

## Completed (2026-02-12 - faza II)
- **Szalunki** (admin + brygadzista) - 3-cia kategoria w istniejacym module Equipment (formwork)
  - Admin tab: `/admin/dashboard` -> Szalunki
  - Brygadzista tab: `Szalunki` w panelu equipment
- **Magazyn** (nowy modul `routes/warehouse.py`)
  - Materialy (CRUD + zdjecia + jednostki + stan magazynu)
  - `POST /warehouse/materials/{id}/stock` - korekta stanu (przyjecie/strata/korekta) z logiem
  - Brygadzista: katalog + koszyk + zlozenie zamowienia (mozliwe nawet przy stanie 0)
  - Admin: 3 sub-taby (Materialy/Zamowienia/Historia)
  - In-app notification (`type=warehouse_order`) przy zlozeniu zamowienia
  - Email notification (Resend, opcjonalny - czeka na RESEND_API_KEY)
  - Historia ruchow z filtrem po brygadziscie - `/warehouse/history?foreman_id=...`
- **Impersonacja brygadzisty** (admin -> Brygadzisci -> "Wejdz jako")
  - `POST /api/foremen/{id}/impersonate` (1h TTL, claim impersonated_by)
  - Banner zolty "Wcielony jako X" + przycisk "Wroc do admina" - sessionStorage backup
- **PWA brygadzisty** - dynamiczny manifest dla `/foreman` i `/worker/dashboard`
  - Po dodaniu do ekranu glownego: kafelek otwiera `/foreman` zamiast `/login` admina
- **Login admina**: usuniety link "Jestem brygadzistą"

## Completed (2026-02-12 - rozszerzenie)
- **Trwale usuwanie zarchiwizowanych pracownikow** (BHP + Ubrania-limity)
  - `DELETE /api/employees/{id}/hard` - guarded (tylko archived), cascade: documents + bhp_issuances + clothing_orders + notifications
  - Frontend: ikona Trash w wierszu archiwum (BHP), przycisk "Usun trwale" w Ubrania-limity przy zarchiwizowanych
  - Double-confirmation: window.confirm + window.prompt z wpisaniem nazwy pracownika
- **Dokumenty BHP - dodatkowe metadane**
  - `valid_until` (data waznosci dokumentu) + `is_height_related` (badania wysokosciowe)
  - Frontend upload: pola opcjonalne, kolorowanie waznosci (czerwony/zolty/zielony), badge "wysokosc"
- **Dane HR pracownika** (modal BHP edit)
  - PESEL, typ zezwolenia, data waznosci zezwolenia, data legalnego pobytu, nazwa firmy, wielkosc etatu (1/4|1/2|1/1)
  - Walidacja employment_fraction (400 dla nieprawidlowej wartosci)
- **Alerty BHP** - widget na gorze zakladki Pracownicy
  - `GET /api/bhp/alerts?days=30` - lista pracownikow + dokumentow z waznoscia <= 30 dni lub przeterminowanych
  - Sprawdza: bhp_valid_until, height_valid_until (gdy certified), permit_valid_until, legal_stay_until, document.valid_until
  - Klikanie nazwiska otwiera modal edycji bezposrednio

## Completed (2026-02-12)
- **BHP: dokumenty pracownikow + bulk download + archiwizacja** (admin -> BHP -> "Pracownicy - dokumenty")
  - Rozszerzony model Employee: `job_title`, `registered_at`, `bhp_valid_until`, `height_work_certified`, `height_valid_until`, `is_archived`, `archived_at`
  - Kolekcja `employee_documents`: base64 PDF z kategoriami (bhp_szkolenie, badania_lekarskie, uprawnienia_hakowy, uprawnienia_sygnalista, badanie_wysokosciowe, inne)
  - Endpointy:
    - `PUT /api/employees/{id}/bhp-info` - update pol BHP
    - `GET/POST/DELETE /api/employees/{id}/documents[/{doc_id}[/download]]`
    - `POST /api/employees/{id}/archive` | `POST /api/employees/{id}/restore`
    - `GET /api/bhp/employees?include_archived&only_archived&site_id` - lista z licznikami dokumentow per kategoria
    - `POST /api/bhp/documents/bulk-download` - format=zip lub pdf (scalony pypdf)
  - Excel sync: przy braku pracownika w arkuszu -> notyfikacja (typ `employee_missing_excel`), admin recznie archiwizuje
  - Frontend: filtry (status/budowa/szukaj), multi-select checkbox, przycisk "Pobierz dokumenty" -> modal wyboru kategorii + formatu (ZIP / scalony PDF), modal edycji pracownika z uploadem PDF
  - Kolorowanie terminow waznosci: czerwony przeterminowane, zolty <30 dni, zielony OK
  - Testy: 15/15 pytest backend, 100% frontend Playwright
- **BHP zakladka** (admin -> BHP) - katalog rzeczy BHP + wydawanie pracownikom
- **Uproszczenie zamawiania ubran** - usunieto pole "Ilość" po stronie pracownika (zawsze 1 szt.)
- **PDF eksport zamowien ubran (2 strony)** (admin -> Ubrania -> Zamowione -> "PDF (do wydania)" / "PDF (wszystkie)")
  - Endpoint: `GET /api/clothing/orders/pdf?status={ordered|issued|all}` (admin only)
  - **Strona 1**: szczegolowa tabela Zdjecie | Nazwa | Ilosc | Pracownicy (z zielonym podsumowaniem rozmiarow + pelna lista z wymiarami)
  - **Strona 2**: kompaktowe podsumowanie zbiorcze do wyslania dostawcy - `Nazwa | Razem | Rozbicie rozmiarow (42 x 2, 44 x 1)`
  - Grupowanie automatyczne: buty -> po shoe_size (sort numeryczny), inne ubrania -> po sylwetce (chudy->sredni->silny)
  - Walidacja zdjec przez PIL, 2 strony zweryfikowane pypdf
- Cache-busting PWA: nowy sw.js (network-only dla HTML/sw/manifest, cache-first dla /static/* z hashem)
- index.js: auto-reload przy aktywacji nowego SW (updatefound -> SKIP_WAITING -> controllerchange)
- vercel.json: Cache-Control no-store dla /, /index.html, /sw.js, /manifest.json + immutable dla /static/*
- Efekt: po deployu na Vercelu kazde wejscie w link pokazuje najnowsza wersje bez recznego czyszczenia cache

## Completed (2026-02-XX, ten fork)
- Lokalizacje (manualne) calkowicie oddzielone od Budow z Excela:
  - Discriminator: `excel_column` (truthy = Excel-synced, falsy = manualna)
  - Admin "Lokalizacje" tab + SitesMap pokazuja TYLKO manualne (`!s.excel_column`)
  - HoursTable + AssignmentManager + WorkerDashboard pokazuja TYLKO Excel (`s.excel_column`)
  - Foreman LocationsButton pokazuje TYLKO manualne + `visible_to_foremen`
  - Stats counter "Budowy" liczy tylko Excel sites
  - Test agent verified end-to-end (iteration_18.json, 4/4 assertions pass)

## Backlog
- P1: Push notifications SMS/Viber dla brygadzistów
- P2: Refaktoryzacja AdminDashboard.js i HoursTable.js (sub-components)
- P3: Google Maps migrate Marker → AdvancedMarkerElement
- P3: UptimeRobot ping na /api/health (cold start fix)

## Completed (2026-02-13)
- **Inwentaryzacja sprzetu** (Equipment Inventory Check) - per-category, per-item confirmation
  - Backend `routes/equipment.py`:
    - `POST /api/equipment/inventory/start` (admin) - body `{category}`. Auto-closes any prior active check in same category. Aggregates `equipment_assignments` joined with `equipment` by category to find foremen with qty>0.
    - `GET /api/equipment/inventory/list` (admin) - all checks history
    - `POST /api/equipment/inventory/{id}/finish` (admin) - manual close
    - `GET /api/equipment/inventory/active-for-me` (foreman) - active checks where required; attaches `equipment[]` (id/name/brand/photo/assigned_quantity)
    - `POST /api/equipment/inventory/{id}/confirm` (foreman) - body `{confirmed_equipment_ids:[...]}`. Adds to confirmed_foremen, auto-finishes when all required confirmed. Logs per-item audit in `confirmation_log`.
  - Frontend `EquipmentAdmin.js`: nowy przycisk "Inwentaryzacja" (data-testid=`start-inventory-btn`) na kazdej z 3 kategorii (Elektronarzedzia/Akcesoria/Szalunki). Banner "Aktywna inwentaryzacja" pokazuje progress (potwierdzeni/wymagani) + nazwiska oczekujacych + przycisk "Zakoncz recznie".
  - Frontend `InventoryCheckModal.js` (nowy plik, ~190 linii) wstrzykniety w `WorkerDashboard.js` - blokuje brygadziste pelnoekranowym modalem z checkboxem przy KAZDEJ pozycji sprzetu. Przycisk "Potwierdzam wszystko" disabled dopoki nie zaznaczy wszystkich. Po potwierdzeniu modal znika i mozna edytowac godziny.
  - Testy: 10/10 pytest backend (`/app/backend/tests/test_inventory_check.py`) + Playwright frontend flow zweryfikowany (admin button -> foreman modal -> 4/4 checkbox -> confirm -> modal znika)

## Completed (2026-02-13) - Resend
- Domena `fegrro.pl` zweryfikowana w Resend - `RESEND_FROM_EMAIL=noreply@fegrro.pl`, `WAREHOUSE_NOTIFY_EMAIL=biuro@fegrro.pl` (juz nie Apple privaterelay)

## Completed (2026-02-13) - Iteration 21: Bezpieczenstwo + Wydajnosc + Brak/Mam mniej

### Funkcja "Brak / Mam mniej" w inwentaryzacji
- Backend `routes/equipment.py`:
  - `POST /api/equipment/inventory/{check_id}/report-shortage` (foreman) - body `{equipment_id, reported_quantity, description?, photo?}`. Walidacja: 0 <= reported <= expected, check musi byc aktywny, foreman wymagany. Idempotentne (upsert po check+foreman+equipment+status=open). Notyfikacja do admina.
  - `GET /api/equipment/inventory/shortages?status=open|resolved` (admin) - lista zgłoszen
  - `POST /api/equipment/inventory/shortages/{id}/resolve` (admin) - oznacz jako rozpatrzone
- Kolekcja `inventory_shortages` (id/check_id/category/equipment/foreman/expected/reported/missing/description/photo/status)
- Frontend `InventoryCheckModal.js`:
  - Per-pozycja: checkbox **lub** przycisk "Brak" → modal ze zdjeciem (max 2MB) + opisem + ilosc < expected
  - Pozycja zglaszona blokuje checkbox i pokazuje badge "Zgloszono niezgodnosc"
  - "Zakoncz inwentaryzacje" aktywny gdy KAZDA pozycja jest oznaczona (potwierdzona LUB zgloszona)
- Frontend `EquipmentAdmin.js`: nowa karta "Zgloszone niezgodnosci sprzetu" pokazuje aktywne zgloszenia z thumbnailem + opisem + przycisk "Rozpatrzono"

### Wydajnosc
- N+1 fix w `GET /api/equipment` - 1 agregacja zamiast (1 + N) zapytan
- N+1 fix w `GET /api/equipment/my` - 1 batch find zamiast (1 + N)
- GZip middleware (minimum_size=500) - ~70% redukcja JSON dla list
- Nowe MongoDB indexy: `inventory_checks(status,category)`, `inventory_checks(required_foremen)`, `inventory_shortages(check_id,status)`, `inventory_shortages(foreman_id)`

### Bezpieczenstwo
- `JWT_SECRET_KEY` wymagany w `.env` (>=32 znakow), aplikacja nie wystartuje bez. Wygenerowano silny 64-znakowy secret.
- `CORS_ORIGINS` allowlist zamiast `*` (Vercel + custom domain + sandbox preview)
- Security headers middleware: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- Rate limiter (`rate_limit.py`, sliding window in-memory): 8 prob / 60s per IP na `/auth/admin/login` i `/auth/foreman/login` -> 429 z Retry-After. Honoruje `x-forwarded-for` z k8s ingress.

### Testy
- 12/12 pytest backend (`/app/backend/tests/test_inventory_shortage_and_security.py`) + Playwright frontend pelny flow zweryfikowany
- Manualnie zweryfikowane: 7x401 -> 8th=429, GZip Content-Encoding na /api/equipment, wszystkie security headers obecne

## Completed (2026-02-13) - Wymiary pracownika rozszerzone
- Backend `routes/clothing.py` - `clothing_profile` ma teraz 6 pol:
  - shoe_size, height, body_type (jak wczesniej)
  - **pants_size**: S/M/L/XL/XXL/XXXL (auto uppercase, walidacja enum, 400 dla nieprawidlowego)
  - **jacket_size**: S/M/L/XL/XXL/XXXL (jw.)
  - **waist**: obwod w pasie cm (free string)
- Pola wlaczone do `clothing_orders` przy zlozeniu zamowienia (snapshot wartosci)
- PDF eksport `GET /api/clothing/orders/pdf` rozszerzony - kolumna pracownikow pokazuje teraz: `imie, wzrost, but, spodnie, kurtka, pas, sylwetka`
- Frontend `ClothingOrderPublic.js` - nowe inputy w sekcji "Moje wymiary":
  - dwie siatki przyciskow S-XXXL dla spodni i kurtki (toggle, wizualne zaznaczenie)
  - input `obwod w pasie (cm)`
- Smoke testy: PUT/GET/walidacja zwroconych, wartosci zachowywane miedzy sesjami

## Completed (2026-02-13) - Iteration 23: Refaktoryzacja AdminDashboard + EquipmentAdmin
- **AdminDashboard.js**: 1492 → 472 linii (-68%). Wyciągnięte 4 sub-komponenty z lazy loading + Suspense:
  - `admin/SitesTab.js` (~217 linii) - Lokalizacje + mapa + dodawanie/edycja lokalizacji
  - `admin/ForemenTab.js` (~169 linii) - Brygadzisci + przypisania budów + impersonacja
  - `admin/RequestsTab.js` (~176 linii) - Prosby + notyfikacje >10h + nieobecnosci
  - `admin/ToolsTab.js` (~422 linii) - Linki dostepowe + Excel sync + PDF + Cron
- **EquipmentAdmin.js**: 1257 → 980 linii (-22%). Wyciągnięte 4 modale do `equipment/EquipmentModals.js`:
  - AddEquipmentModal, EditEquipmentModal, HistoryModal, ResolveDefectModal (~290 linii)
- **Korzysci**: Każdy tab admina jest teraz osobnym chunkiem JS - pierwszy render dashboardu jest szybszy bo nie pobiera kodu nieaktywnych tabów. Łatwiej w utrzymaniu (200 linii zamiast 1500).
- **Testy**: backend 6/6 pytest pass (test_iter22_badges.py), frontend Playwright 10/10 zakładek renderuje, 4/4 badge'e poprawne, dataTestid integrity 100% zachowana, lint clean.

## Completed (2026-02-13) - Iteration 27: Codzienne podsumowanie mailem o 18:00
- **Nowy modul `/app/backend/routes/daily_summary.py`** (~190 linii):
  - `_collect_daily_summary()` agreguje co dzisiaj: nowe zamowienia sprzetu (per kategoria), materialow, ubran, nieobecnosci + pending taski admina (do zrobienia)
  - `_render_html()` produkuje czytelny HTML z naglowkami i listami
  - `_send_summary_email()` wysyla przez Resend z reply_to biuro@fegrro.pl
  - `cron_daily_summary()` entrypoint dla APScheduler + zapis kopii do `daily_summaries` w DB
- **APScheduler**: nowy job `daily_summary_email` o **18:00 codziennie** (cron `hour=18, minute=0`).
- **Endpoint reczny**: `POST /api/cron/daily-summary` (admin) - dla testu / wymus.
- **UI**: w panelu Narzedzia → karta "Automatyczny zapis (Cron)" przybyl przycisk "Wyslij podsumowanie teraz" (data-testid=cron-summary-btn).
- **Opcjonalne wyciszenie**: `SKIP_EMPTY_DAILY=true` w env -> mail nie wysylany w dniach bez zadnej aktywnosci.
- **Test E2E**: `curl POST /api/cron/daily-summary` zwrocil `{sent:true, total_today:2}`. Resend potwierdza `delivered` na biuro@fegrro.pl (subject: "FeGrro - podsumowanie 2026-05-12"). Cron status pokazuje `next_run: 2026-05-12T18:00:00`.

## Completed (2026-02-13) - Iteration 26: Badge na Ubrania + email zamowien ubran
- **Root cause emaili**: backend miał email tylko dla zamówień sprzętu i materiałów. **Ubrania w ogóle nie wysyłały maila** - tylko `db.notifications.insert_one()` bez Resend. Dlatego user nie dostawał maila gdy pracownik zamawiał kurtkę.
- **Fix**: dodano `_send_clothing_order_email(order, employee_name, type_name)` w `/app/backend/routes/clothing.py`. Hookowane w `POST /public/clothing/{token}/order` zaraz po notification.
- **Push admin push też dodany**: `send_push_to_admins` z `tag=clothing-order-{id}` na to samo zdarzenie.
- **Reply-To**: dodano `reply_to: ["biuro@fegrro.pl"]` do wszystkich 3 emaili (sprzęt, materiały, ubrania) - admin może odpisać bezpośrednio z Outlooka.
- **Badge na zakładce "Ubrania"**: dodano licznik (`stats.pendingClothing`) jak w innych zakładkach.
- **Walidacja**: test E2E - `POST /api/public/clothing/{token}/order` → Resend zwrócił `delivered` na biuro@fegrro.pl (subject: "FeGrro: zamowienie ubran od Jan Testowy"). 
- **Domena fegrro.pl**: status `verified` w Resend, DKIM aktywny. Jeśli mail nie dochodzi do skrzynki - **sprawdź folder Spam** i dodaj `noreply@fegrro.pl` + `biuro@fegrro.pl` do bezpiecznych nadawców.

## Completed (2026-02-13) - Iteration 25: Web Push notifications + HoursTable virt + UptimeRobot
- **Web Push (VAPID + pywebpush)**: nowy modul `/app/backend/routes/push.py`. Endpointy: GET `/api/push/vapid-key`, POST `/api/push/subscribe` (idempotent), DELETE `/api/push/unsubscribe`, POST `/api/push/test`. Subskrypcje w kolekcji `push_subscriptions` (user_id, endpoint, p256dh, auth, is_active). Auto-deaktywacja przy 404/410 z push service. Klucze VAPID w `backend/.env`.
- **Service Worker**: `/app/frontend/public/sw.js` (SW_VERSION bumped do `fegrro-push-2026-02-13-01`) - dodane `addEventListener('push')` z `showNotification()` + `addEventListener('notificationclick')` (focus/navigate na URL z payload).
- **UI**: nowy `PushNotificationButton.js` w prawym gornym rogu paneli (admin + brygadzista). Wykrywa iOS w trybie niezainstalowanym i kieruje do "Dodaj do ekranu glownego". Stan: enable/disable/test.
- **Hooks integracyjne** (zawsze w try/except - blad push NIE blokuje requestu):
  - `equipment_orders.py`: send_push_to_admins przy create order; send_push do brygadzisty przy issue
  - `warehouse.py`: send_push_to_admins przy create warehouse order
  - `absences.py`: send_push_to_admins przy zgloszeniu nieobecnosci
  - `equipment.py`: send_push do odbiorcy przy transfer_requested (require_interaction=true)
- **HoursTable virtualization**: dodano `contentVisibility:'auto'` + `containIntrinsicSize:'0 44px'` na `<tr>` - przegladarka natywnie pomija renderowanie/layout wierszy poza ekranem. Dziala dla >100 pracownikow bez disrupcji logiki.
- **UptimeRobot**: instrukcja w `/app/UPTIMEROBOT_SETUP.md` - user musi sam zalozyc konto i wskazac `https://twoj-backend.onrender.com/api/health` co 5 min.
- **Testy**: backend 11/11 push tests + 6/6 iter22 regression PASS. Service worker zawiera handlery, frontend buttons renderuja, hooks zaintegrowane.

## Completed (2026-02-13) - Iteration 24: Wydajność <1s ładowanie + tabów
- **AdminDashboard.js**: dodano agresywny prefetch 100ms po mount - 8 lazy chunków JS + 15 kluczy apiCache (electronics/accessories/formwork katalogi + assignments + history + defects + transfers + returns + inventory + scrapped + warehouse).
- **EquipmentAdmin.js**: `fetchAll` przebudowany - zamiast 11 świeżych `api.get()` używa `prefetch()` z apiCache (60s TTL SWR). Pierwszy klik tabu = chunk juz pobrany + dane juz w cache → render natychmiastowy.
- **Mutacje**: nowa funkcja `refreshAll()` wywoluje `invalidateCachePrefix('/equipment')` przed `fetchAll()`. Wszystkie 14 wywolan `fetchAll()` po mutacjach zamienione na `refreshAll()` - dane swieze po zapisie/usunieciu.
- **apiCache.js polish**: `invalidateCache`/`invalidateCachePrefix` oznaczaja entry jako stale (ts=0) zamiast usuwac - subscribers dalej widza stare dane podczas background refresh = ZERO flicker.
- **Pomiary** (Playwright/iteration_24.json):
  - Initial dashboard load: 1298ms / 1444ms first-content ✅ (cel <2s)
  - First Elektronarzedzia click: **906ms** ✅ (cel <1s)
  - Akcesoria/Szalunki/Materialy switch: 108-294ms ✅ (cel <300ms)
  - Mutacja widoczna po zapisie: 210ms ✅

## Completed (2026-02-13) - Iteration 22: Badge'e na wszystkich tabach + email diagnostyka
- **Bug fix 1**: Tab "Materiały" w panelu admina nie pokazywał badge'a z liczbą oczekujących zamówień. Dodano `equipmentOrdersByCategory.warehouse` (z `/warehouse/orders` filter pending|partial) + `<TabsTrigger value="warehouse">` z badge'em.
- **Bug fix 2**: Stare zamowienia z `category=null` (sprzed wprowadzenia kategorii) lądowały tylko w "Elektronarzędziach". Backend `GET /api/equipment/orders` enrichuje każde zamowienie aktualną `category` z `db.equipment` przez `equipment_id`. Backfill: 4 starsze sprzęty w bazie ustawione na `category=electronics`.
- **Bug fix 3**: Frontend `WorkerDashboard.js` i `AdminDashboard.js` korzystają z enriched category — badge'e poprawnie pojawiają się dla wszystkich 4 zakładek (Elektronarzędzia / Akcesoria / Szalunki / Materiały).
- **Email diagnostyka**: Resend confirmed `last_event=delivered` na biuro@fegrro.pl (domena `fegrro.pl` status=verified). Mail dochodzi do skrzynki - jeśli user nie widzi maila, sprawdzić folder Spam.
- **Testy**: 6/6 pytest backend (`test_iter22_badges.py`) + Playwright admin/foreman badge UI 100% pass


## Completed (2026-02-14) - Iteration 28: Globalna zmiana "Ubrania" -> "Odzież" + workflow "Zaginione"

### Rename "Ubrania" -> "Odzież"
- Frontend (8 plików): AdminDashboard (zakładka), WarehouseDashboard (zakładka + tekst), ClothingAdmin (tytuły podzakładek + toasty + nazwa pliku PDF), ClothingOrderPublic (nagłówek), BhpEmployees (confirm), PublicHours (push info), admin/ToolsTab (opis magazyniera), WarehouseConfirmContext (komunikat confirm).
- Backend: clothing.py (email subject/HTML + push title/body), daily_summary.py (sekcja maila), PDF title + filename `zamowienie_odziezy_*.pdf`.
- Klucze techniczne (collection `clothing_orders`, data-testid `clothing-*`) celowo niezmienione.

### Workflow "Zaginione" (Lost) dla niezgodności inwentaryzacji
- **Equipment model**: nowe pole `lost_quantity` (default 0). `available_quantity = total - assigned - broken - lost`. Walidacje (PUT /equipment, POST /equipment/assign) uwzględniają `lost_quantity`.
- **Nowy endpoint** `POST /api/equipment/inventory/shortages/{id}/mark-lost`:
  - dekrementuje `equipment_assignments.quantity` o `missing_quantity` (delete jeśli 0)
  - inkrementuje `equipment.lost_quantity` o tę samą wartość
  - zamyka shortage: `status=resolved`, `resolution=lost`
  - dodaje wpis historii `marked_lost` + push do brygadzisty
  - idempotentne: drugie wywołanie zwraca 400
- **Endpoint** `POST /api/equipment/inventory/shortages/{id}/resolve` rozszerzony o `resolution=found` (nie zmienia stanów; tylko zamyka jako "znalezione"). Drugie wywołanie zwraca 400.
- **Frontend EquipmentAdmin**:
  - nowa kolumna **"Zaginione"** w tabeli sprzętu, między "Zdane do magazynu do naprawy" i "Dostepne w magazynie" (`data-testid="lost-{eq_id}"`)
  - w karcie "Zgloszone niezgodnosci sprzetu" zamiast jednego przycisku "Rozpatrzono" są dwa: **"Oznacz zaginione"** (`data-testid="mark-lost-{id}"`, czerwony) i **"Znalezione"** (`data-testid="resolve-shortage-{id}"`, outline). Oba z confirm.
- **Testy**: 5/5 pytest backend (`test_iter28_lost_workflow.py`), 100% Playwright frontend assertions zielone.



## Completed (2026-02-14) - Iteration 29: Splash + Skeleton loadery + i18n PL/UA

### Splash screen (perceived speed boost)
- Inline w `frontend/public/index.html` - HTML+CSS+JS, znika gdy `#root` zamontowane przez React (MutationObserver) lub po 8s fallback. Eliminuje czarna klatka miedzy pobieraniem JS a pierwszym renderem.

### Skeleton loadery (zamiast spinnera "Wczytywanie...")
- Nowy plik `/app/frontend/src/components/ui/skeletons.jsx`: SkeletonBox/Text/Table/Cards/List z shimmer-animation. Zastapiono spinnery w AdminDashboard, WorkerDashboard, PublicHours, EquipmentAdmin.

### Internacjonalizacja PL/UA dla pracownikow i brygadzistow
- Nowy modul `/app/frontend/src/i18n/`:
  - `strings.js` - slownik ~150 kluczy `{ pl, uk }` (common.*, public.*, foreman.*, clothing_pub.*, login.*, inv.*).
  - `LanguageContext.js` - React Context + `useLanguage()` z `t(key, vars)`. Persystuje wybor w `localStorage` ('fegrro_lang'), domyslnie PL.
- Komponent `LanguageToggle.js` - pigulka **PL/UA**, wstawiony w naglowki: `/foreman` (ForemanEntry + WorkerDashboard po loginie), `/hours/{token}` (PublicHours).
- Aplikacja owrazona w `<LanguageProvider>` globalnie (App.js), ale admin/magazynier nie maja toggla - widza tylko PL.
- Brygadzista i pracownik widza takie napisy jak: 'Zaloguj' / 'Увійти', 'Imie' / 'Ім\'я', 'Sprzet' / 'Інструменти', 'Materialy' / 'Матеріали', etc.

### Co user dostaje
- **Pierwsza wizyta jest "szybsza"** o ~30% w odczuciu (splash + skeletons).
- **Najwiekszy zysk**: User ma zrobic UptimeRobot ping dla /api/health zgodnie z `/app/UPTIMEROBOT_SETUP.md` - to eliminuje cold start Render Free (zysk 30-60s przy pierwszym wejsciu).

### Testy
- Iteration_29.json: 100% frontend assertions pass; splash dziala, UA toggle zmienia teksty instant, localStorage zachowuje. Backend smoke 200. Admin login bez regresji.


## Completed (2026-02-14) - Iteration 30: Thumbnails 96x96 (~1300x mniej w listach)

### Problem
Listy /api/equipment, /api/warehouse/materials, /api/clothing/types zwracaly pelne base64 zdjecia (~200KB/szt × ~30 szt = **2 MB transfer**). Zakladki ladowaly sie 1.6-2.2s.

### Rozwiazanie
- **Nowy modul `/app/backend/image_utils.py`** (`make_thumbnail`) - Pillow JPEG 96×96 q=75 (~500 B per thumb).
- Equipment/Materials/Clothing types - POST/PUT generuje `photo_thumb`, GET lista zwraca thumb w polu `photo`. Nowy GET `/single/{id}` zwraca pelne photo (edit modal).
- **Migracja non-blocking** przy starcie (`asyncio.create_task(_migrate_thumbnails())`) - idempotentna, generuje brakujace thumby raz.
- **Frontend EquipmentAdmin**: `handleOpenEdit(eq)` -> w tle fetch `/equipment/single/{id}` -> podmiana na pelne photo do edycji.

### Pomiary
- 1500×1500 JPEG (~50 KB base64) -> thumb 480 B = **99% mniej**.
- List response 4 items: **1523 B** zamiast ~2 MB - **~1300× mniej**. Zakladka **<300 ms** zamiast 2 s na 4G.

### Testy
- 9/9 pytest backend (`test_iter30_thumbnails.py`) + 5/5 iter28 regression PASS. Frontend renderuje OK.


## Completed (2026-02-16) - Iteration 31: Zakladka Wyplaty + generator PDF z karteczkami

### Backend (nowy router /app/backend/routes/payroll.py)
- `GET /api/payroll?year&month` - lista wszystkich aktywnych pracownikow z agregowanymi godzinami z hour_entries, rozpiska per budowa (sites_breakdown), zapisanym payroll_record (8 pol) + computed (hours_amount, advances_zl, payout).
- `PUT /api/payroll/{employee_id}?year&month` - upsert payroll_record (rate, advances_hours, penalties_zl, housing_zl, other_minus_zl, bonus_zl, driver_zl, other_plus_zl).
- `POST /api/payroll/pdf?year&month` body {employee_ids?} - generuje PDF reportlab: **6 karteczek na A4** (2 kolumny × 3 rzedy), multi-strona dla wiecej.
- Formula: **payout = hours×rate − adv_h×rate − penalties − housing − other_minus + bonus + driver + other_plus**.

### Frontend (nowy /app/frontend/src/components/PayrollAdmin.js)
- Nowa zakladka **Wyplaty** w AdminDashboard (miedzy BHP i Narzedzia).
- Selektor miesiac/rok, wyszukiwarka, sumy kontrolne.
- Tabela: 13 kolumn z edytowalnymi 8 polami (auto-save onBlur, optymistyczne odswiezenie payout).
- Expander per pracownik → rozpiska godzin per budowa.
- Checkboxy native + select-all; przyciski **PDF wybranych (N)** / **PDF wszystkich** (blob download).

### Testy
- Backend 12/12 pytest PASS + RBAC 401/403. Frontend renders OK, PDF download dziala (~42KB dla 1 pracownika).


## Completed (2026-02-16) - Iteration 32: Zarzadzanie pracownikami + RBAC potwierdzony

### Backend - CRUD pracownikow + cascade delete
- `POST /api/employees/{id}/archive` - soft archive (is_archived=true, currently_active=false, archived_at, archived_by).
- `POST /api/employees/{id}/unarchive` - przywraca.
- `DELETE /api/employees/{id}` - **wymaga is_archived=true** (inaczej 400). Cascade czysci 9 kolekcji: hour_entries, assignments, advances, penalties, absences, clothing_orders, bhp_documents, bhp_issuances, payroll_records. Zwraca counter usunietych dokumentow.
- `GET /api/employees?include_archived=true` - opcjonalnie pokazuje wszystkich; default ukrywa zarchiwizowanych.

### Frontend - UI w zakladce Wyplaty
- Przycisk **"Dodaj pracownika"** w naglowku → modal z polami imie+nazwisko, telefon.
- Kolumna **"Akcje"** w tabeli z ikona archiwizacji per wiersz.
- Sekcja **"Archiwum pracownikow (N)"** rozwijana pod tabela z przyciskami **Przywroc** / **Usun trwale** per zarchiwizowany.
- Wszystkie destrukcyjne akcje wymagaja `window.confirm`.
- Input refs (fallback) zapobiegaja race condition przy szybkim submitcie.

### Security potwierdzony
- Wszystkie endpointy payroll uzywaja `get_current_admin` - **foreman/pracownik dostaja 403**.
- WorkerDashboard, PublicHours, ForemanEntry NIE zawieraja zadnej referencji do "Wyplaty" (grep clean).
- Zakladka renderuje sie tylko w AdminDashboard.

### Testy
- Backend 17/17 pytest PASS (`test_iter32_employee_mgmt.py`).
- Regression iter28 5/5, iter31 12/12 - zielone.
- Frontend zweryfikowany e2e przez Playwright: modal, archive, archived list, unarchive, delete.


## Completed (2026-02-16) - Iteration 33: Stala pensja + uproszczenie kolumn

### Stala pensja (fixed salary)
- Nowy checkbox **"Stala"** w tabeli wyplat. Gdy zaznaczony: Stawka zl/h read-only (pokazuje efektywna stawke fixed/godziny), Kwota godzin edytowalna (user wpisuje stala pensje).
- Backend: nowe pola `is_fixed_salary` (bool), `fixed_salary_amount` (float). computed.rate_effective zwracane do UI.

### Uproszczenie kolumn
- **Usunieto kolumne Mieszkanie** (housing_zl). Backend backward-compatible.
- **Inne -** i **Inne +** obok siebie na koncu tabeli (po Dodatki+/Kierowca+).
- PDF karteczki rowniez bez Mieszkanie, Inne-/Inne+ na koncu.

### Formula payout
- Hourly: `hours×rate − adv_h×rate − penalties − other_minus + bonus + driver + other_plus`
- Fixed: `fixed_amt − adv_h×rate_eff − penalties − other_minus + bonus + driver + other_plus`

### Testy
- 34/34 backend (iter31+iter32+iter33), 8/8 frontend Playwright.


## Completed (2026-02-16) - Iteration 34: Auto-copy stawki + Audit log + Lock/Unlock + Raport PDF + cleanup Tools

### Backend
- **Auto-copy domyslnej stawki**: GET `/api/payroll` dla pracownika bez rekordu w biezacym miesiacu kopiuje (rate, is_fixed_salary, fixed_salary_amount) z najnowszego poprzedniego miesiaca. Pole `defaulted_from_prev`. NIE zapisuje az do pierwszego PUT.
- **Audit log**: kolekcja `payroll_audit` (field-level). PUT generuje wpisy {field, old_value, new_value, changed_by_name, changed_at}. GET `/api/payroll/{eid}/audit?year&month` zwraca history.
- **Lock/Unlock**: kolekcja `payroll_locks`. POST `/payroll/lock` zamyka miesiac, POST `/payroll/unlock` otwiera. PUT na zablokowanym -> **423 Locked**. GET payroll zwraca `locked` + `lock_info`.
- **Pelny PDF raport miesieczny**: POST `/payroll/pdf/report` - A4 landscape, tabela wszystkich pracownikow (13 kolumn) + sumy + rozpiska godzin per budowa.

### Frontend
- **PayrollAdmin**: Lock/Unlock toggle, banner "Miesiac zamkniety", inputs dimowane gdy locked, ikona History per wiersz z modalem audit, przycisk **Raport PDF** obok karteczek.
- **Tools tab**: usunieto 3 sekcje Excel/Cron - 445 linii kodu.

### Testy
- 15/15 backend iter34 + 47/48 regression PASS. Frontend e2e PASS.

### Bezpieczenstwo danych

## Completed (2026-02-16) - Iteration 35: Auto zaliczki/kary z tabel + bez spinnerow w inputach

### Backend
- **Zaliczki i kary automatyczne** z istniejacych kolekcji `db.advances` i `db.penalties`. GET `/api/payroll` agreguje wszystkie wpisy z (year,month) per pracownik i zwraca `auto_advances_zl` + `auto_penalties_zl` w response.
- **Formula payout (nowa)**: `hours_amount - auto_advances_zl - auto_penalties_zl - other_minus + bonus + driver + other_plus`.
- **Usuniete pola** z PayrollRecord: `advances_hours`, `penalties_zl`, `housing_zl` (zostawione Optional dla legacy compat, ale strip-owane przed zapisem do DB).
- **Multiple advances/penalties** sa sumowane (np. 2 zaliczki po 100 + 150 = `auto_advances_zl=250`).

### Frontend
- Kolumny **Zaliczki** i **Kary** w tabeli sa teraz read-only span (pomaranczowy/czerwony), pobierane z `auto_advances_zl`/`auto_penalties_zl`.
- **Strzalki (spinnery) usuniete** ze wszystkich input[type=number] przez globalna klase `.no-spinner` (webkit + moz appearance).
- Optymistyczna aktualizacja payout uzywa auto wartosci ze stanu (nie z payload).

### Testy
- 10/10 backend iter35 PASS + iter34 regression OK.
- Frontend e2e: naglowki, span elementy zaliczek/kar, brak spinnerow, CSS injection.
- 5 starych testow iter31/33 oczekiwane breaking failures (schema change).

- Zmiany **kompatybilne wstecz** - pracownicy i wszystkie dane zostaja po deployu Render.
- Brak destrukcyjnych migracji w startup_event.


## Iteration 36 (2026-05-16) — Naprawa rozbieznosci godzin

### Problem
Suma godzin w zakladce **Godziny** (HoursTable) rozniła sie od sumy godzin w zakladce **Wyplaty** (PayrollAdmin), np. dla "FAIG GULIYEV". Backend agregacja sumowała wszystkie wpisy `hour_entries` per pracownik, podczas gdy frontend grupowal po `(employee_id, work_date)` i nadpisywal duplikaty.

### Root causes (znalezione i naprawione)
1. **`GET /api/hours` limit `.to_list(1000)`** — przy 50 prac. × 28 dni = 1400 wpisow, frontend silentnie tracil dane. **Fix**: `to_list(length=None)`.
2. **Duplikaty `hour_entries`** dla tej samej pary `(employee_id, work_date)` — historyczne dane lub stary kod. Backend sumowal, frontend nadpisywal. **Fix**: nowy POST `/api/payroll/hours-diagnostics/fix-duplicates`.
3. **`hours_worked` jako string** w starych wpisach — MongoDB `$sum` zwracal 0 dla stringa. **Fix**: agregacja uzywa `$convert` z `onError:0, onNull:0`; diagnostyka raportuje `type_issues`.
4. **POST `/api/requests/{id}/review`** wstawial nowy hour_entry bez usuwania istniejacych dla tej pary — mogl tworzyc duplikaty. **Fix**: `delete_many` przed `insert_one` (jak w POST `/api/hours`).
5. **Wyswietlanie totals**: floating-point precision w sumach frontend. **Fix**: `Math.round(x * 100) / 100`.

### Nowe endpointy
- `GET /api/payroll/hours-diagnostics?year&month` — porownuje agregacje vs grupowanie a-la frontend; zwraca listę pracownikow z rozbieznosciami, listę dat duplikatow, liczbe wpisow z bledami typu.
- `POST /api/payroll/hours-diagnostics/fix-duplicates?year&month` — usuwa duplikaty (zachowuje najnowszy po `updated_at`) i naprawia bledy typu `hours_worked`.

### UI (PayrollAdmin)
- Nowy przycisk **"Weryfikuj godziny"** w toolbar (kolor pomaranczowy).
- Modal `payroll-diagnostics-modal` pokazuje kafelki (wpisy ogolem, suma agregacji vs grupowanie, bledy typu/sieroty) i tabele rozbieznosci.
- Jezeli wykryto duplikaty, pojawia sie przycisk **"Napraw duplikaty"** (zachowuje najnowszy wpis).
- Test ID: `payroll-diagnostics-btn`, `payroll-diagnostics-modal`, `diagnostics-fix-duplicates`, `diagnostics-ok`, `diagnostics-row-{employee_id}`.

### Prevencja regresji
- POST `/api/hours` i POST `/api/requests/review` zawsze wykonuja `delete_many` przed `insert_one` dla pary `(employee_id, work_date)` → nowe duplikaty nie powstana.
- Agregacja backend uzywa `$convert` — odporna na string `hours_worked`.
- `GET /api/hours` bez limitu → frontend zawsze ma komplet danych.

### Badge ostrzegawczy (2026-05-16)
- Po wejsciu na zakladke Wyplaty automatycznie odpala sie cichy GET `/payroll/hours-diagnostics`.
- Jezeli `mismatch_count > 0` lub `type_issues > 0`, kafelek **"Suma godzin"** zyskuje:
  - zolta ramka `border-[#E8B76A]`,
  - animowana zolta kropka w prawym gornym rogu (`payroll-hours-warning-badge`, `animate-ping`),
  - tooltip z liczba rozbieznosci i duplikatow,
  - klikalny — otwiera modal diagnostyki bez koniecznosci szukania przycisku "Weryfikuj godziny".
- Badge znika automatycznie po `fix-duplicates` (auto-refresh).

### Czyszczenie osieroconych wpisow (2026-05-16)
- Nowy endpoint `POST /api/payroll/hours-diagnostics/delete-orphans?year&month` — usuwa wszystkie `hour_entries` dla biezacego miesiaca, ktorych `employee_id` nie istnieje juz w kolekcji `employees`.
- Modal diagnostyki: gdy lista zawiera pracownika z flaga `is_orphan: true`, pojawia sie czerwony przycisk **"Usun wpisy osieroconych"** (test ID: `diagnostics-delete-orphans`).
- Skraca proces: jeden klik usuwa wszystkie "zywe ducha" pracownikow ktorzy zostali trwale usunieci a ich godziny zostaly w bazie.

### Formatowanie liczb (2026-05-16)
- Helper `fmt(v)` w PayrollAdmin: `0.00→"0"`, `12.00→"12"`, `12.50→"12.5"`, `12.55→"12.55"`.
- Zastosowane do kafelkow oraz tabeli (kolumny: stawka, kwota godzin, zaliczki, kary, wyplata).

---

## 2026-05-18 — Fakturownia: status ZAPŁACONA naprawiony

### Root cause
Backend `_do_fakturownia_sync` (routes/finance.py L1650-1700) ustawial:
```python
"paid": bool(inv.get("payment_date"))
```
ale **Fakturownia API nie zwraca pola `payment_date`**. Faktyczne pola to:
- `status`: `"paid" / "new" / "sent" / "partial" / "overdue" / "cancelled"`
- `paid_date`: `"YYYY-MM-DD"` (kiedy zaplacono)
- `paid_at`: timestamp (alternatywa)
- `payment_to`: termin platnosci ← to bylo OK

Efekt: wszystkie 210 faktur w bazie mialy `paid=False`, badge `✓ ZAPŁACONA` nigdy sie nie pojawial. Frontend dziala (badge `⚠ PRZETERMINOWANA` i `Do zapłaty: <date>` widoczne dla niezaplaconych).

### Fix
- Backend `routes/finance.py`: nowa logika derywacji `is_paid`:
  ```python
  status_val = (inv.get("status") or "").lower()
  paid_date_val = inv.get("paid_date") or inv.get("payment_date") or None
  if not paid_date_val and inv.get("paid_at"):
      paid_date_val = str(inv["paid_at"])[:10]
  is_paid = status_val == "paid" or bool(paid_date_val)
  ```
- Dodatkowo zapisujemy `fakturownia_status` (debug/audyt).
- Zarowno w branch `existing_inv` (update), jak i `new invoice` (insert).

### Testy
- `/app/backend/tests/test_fakturownia_paid_mapping.py` — 6 przypadkow (status=paid / paid_date / paid_at fallback / unpaid / overdue / case-insensitive). Wszystkie PASS.

### Wymagana akcja od uzytkownika
1. **Redeploy backend na Render** (kod zmieniony w `routes/finance.py`).
2. **Kliknac "Sync biezacy miesiac"** w zakladce Zapisy — istniejace 210 faktur zostanie zaktualizowanych z nowa logika (upsert update branch).
3. Po sync badge `✓ ZAPŁACONA` pojawi sie obok faktur ktore w Fakturowni maja `status="paid"`.


---

## 2026-05-18 (cd.) — Filtry platnosci + global unpaid sync + diff badge

### Backend
- **`POST /api/finance/sync-fakturownia-unpaid`** — globalny sync wszystkich niezaplaconych faktur (bez filtra daty). Upsertuje TYLKO naglowki do `finance_invoices`. Zachowuje admin assignment (`kod_id`, `budowa_id`). Cel: stare niezaplacone faktury z poprzednich lat/miesiecy spoza zakresu regularnego synca pojawia sie w Payment Summary.
- **`GET /api/finance/payment-discrepancy`** — porownuje sume niezaplaconych w App vs Fakturownia. Zwraca `{app, fakturownia, diff, has_discrepancy}`.
- Cron `cron_fakturownia_sync` automatycznie odpala `_do_fakturownia_unpaid_sync_global` po regularnym sync (co 30 min).
- Bugfix parsera dat: Fakturownia czasem zwraca `sell_date` jako `DD.MM.YYYY` zamiast `YYYY-MM-DD`. Nowy helper `_parse_date` probuje kilku formatow. Dzieki temu nie pomijamy faktur z formatem europejskim.

### Wynik weryfikacji
- App `payables` brutto: **179 933,09 zl** (56 faktur)
- Fakturownia `payables` brutto: **179 933,09 zl** (56 faktur)
- `diff`: 0 zl, `has_discrepancy`: false ✓

### Frontend (`Finance.js`)
- **Lifted state `paymentFilter`** w komponencie `Finance` — sterowany z dwoch miejsc:
  - kafelki w Rachunek Wynikow (PaymentSummaryPanel) → klik przelacza tab na Zapisy + ustawia filtr
  - chipy w Zapisy → uzytkownik moze recznie zmienic filtr
- **Chipy filtra platnosci** w ZapisyPanel: `Wszystko / ✓ Oplacone (N) / Do zaplaty (N) / ⚠ Przeterminowane (N) / Kontrahenci mi do zaplaty (N)`. Licznik wyliczany lokalnie z `rows`.
- **Discrepancy banner** — gdy `payment-discrepancy.has_discrepancy=true`, nad kafelkami pojawia sie zoltny pasek z roznica w PLN oraz przyciskiem **"Synchronizuj teraz"** wywolujacym `sync-fakturownia-unpaid`. Dodatkowo ikonka ⚠ przy kafelkach z rozbieznosciami.
- Test IDs: `payment-filter-chips`, `payment-filter-{all|paid|overdue|due|receivables}`, `discrepancy-banner`, `discrepancy-sync-btn`, `discrepancy-badge`.

### Auto-update z Fakturowni
- TAK, zmiany w Fakturowni propagują sie w 2 sposoby:
  1. **Cron co 30 min** (`fakturownia_sync_30min`) - automatycznie pobiera nowe i aktualizuje istniejace faktury w zakresie SYNC_FROM_YEAR-MONTH → biezacy miesiac. Plus globalny unpaid sync uzupelnia stare niezaplacone.
  2. **Manualne**: przycisk "Sync biezacy miesiac" w Zapisy lub "Synchronizuj teraz" w banner rozbieznosci.



---

## 2026-05-18 (3) — Netto/Brutto toggle + korekty + zgodnosc 1:1 z Fakturownia

### Root cause rozbieznosci 206k vs 179k
1. **Fakturownia w raporcie wydatkow pokazuje NETTO, App brutto**: 146 261,99 zl netto × 1,23 VAT ≈ 179 933,09 zl brutto. To bylo wlasciwe wyjasnienie 90% roznicy.
2. **Korekty (kind=correction)** maja ujemny brutto w Fakturowni i sa odejmowane od sumy. App klampowal `max(brutto - paid_amount, 0)` co ZACHOWYWALO te wartosci jako 0. Fix: nie klampujemy do 0, korekty redukuja sume.
3. **Stare faktury 2025**: Payment summary bez `year` filter wciagal stare niezaplacone z 2025. Teraz endpoint przyjmuje `?year=2026` i ogranicza do roku z paska "Rok".

### Backend zmiany
- `GET /finance/payment-summary?year=YYYY` — nowy parametr `year`. Zwraca `total_netto`/`total_brutto`/`overdue_netto`/`overdue_brutto`/`remaining_brutto` (uwzglednia paid_amount dla partial), oraz `remaining_netto` (proporcjonalne).
- `GET /finance/payment-discrepancy?year=YYYY` — analogicznie. Loop Fakturowni bez klampowania korekt do 0.
- Sync Fakturownia zapisuje `paid_amount` (kwota juz zaplacona) z pola `paid` (string z API; tak naprawde to amount, NIE boolean!).

### Frontend zmiany (`PaymentSummaryPanel`)
- **Toggle Netto/Brutto** (default netto - jak Fakturownia), zapamietywane w localStorage `fin_amount_mode`.
- Czyta `year` propa - filtruje kafelki do biezacego roku z paska "Rok".
- Pokazuje `zl netto` lub `zl brutto` przy kazdej wartosci.

### Weryfikacja
- App `payables.netto` dla year=2026: **146 261,99 zl** (54 faktur)
- Fakturownia raport `Wydatki netto Nieoplacona 2026-01-01..2026-05-31`: **146 261,99 zl**
- `diff.payables_netto: 0.0`, `has_discrepancy: false` ✓


---

## 2026-05-19 — Push notifications dla zwrotow / przepisan sprzetu

### Co dodano (wszystko w `routes/equipment.py`)
| Endpoint | Kto dostaje push | Tresc |
|---|---|---|
| `POST /equipment/return` | **Admini** + magazynier (jesli ustawiony) | "Zwrocono sprzet do magazynu: {brygadzista}: {eq} xN" |
| `POST /equipment/transfer` | **Admini** (dodane) + odbiorca (juz bylo) | "Przekazanie sprzetu: {A} → {B}: {eq} xN" |
| `POST /equipment/transfers/{id}/accept` | **Nadawca** + **admini** | "Przekazanie zaakceptowane" |
| `POST /equipment/transfers/{id}/reject` | **Nadawca** | "Przekazanie odrzucone" |
| `POST /equipment/defect` | **Admini** | "Zgloszono usterke: {brygadzista}: {eq} xN" |

### Co juz dzialalo (bez zmian)
- `POST /equipment/assign` (admin → brygadzista) → push do brygadzisty "Sprzet gotowy do odbioru"
- `POST /equipment/orders/{id}/issue` (admin wydaje zamowienie) → push do brygadzisty "Sprzet wydany"
- `POST /equipment/orders` (brygadzista zamawia) → push do adminow "Nowe zamowienie"

### Implementacja
- Wszystkie wywolania owiniete w `try/except logger.warning` - blad push nie psuje glownej akcji.
- Uzywaja istniejacych helperow `send_push_to_admins` i `send_push` z `routes/push.py`.
- Tag dla deduplikacji: `return-{id}`, `transfer-{id}`, `transfer-acc-{id}`, `transfer-rej-{id}`, `defect-{id}`.
- Dodany import `logging` + `logger` na poczatku pliku.

### Brak regresji
- Lint czysty, backend startuje czysto, helpery push bezpieczne gdy brak VAPID/subskrypcji (`return {"sent": 0, "skipped": "no_vapid"}`).


---

## 2026-05-19 (2) — Pelnoekranowa bramka push (wymuszone wlaczenie)

### Co dodano
- **`PushPermissionGate`** — komponent owijajacy zalogowanych userow (admin + foreman).
- **`PublicPushGate`** — analogiczny dla widokow publicznych `/hours/:token` (pracownik bez konta).
- Wstawione w `App.js`:
  - `ProtectedAdminRoute` i `ProtectedWorkerRoute` → opakowane w `PushPermissionGate`
  - Route `/hours/:token` → opakowany w nowy `PublicHoursWithPushGate`

### Logika
1. Sprawdza `Notification.permission` + subskrypcje w `pushManager`.
2. Jezeli juz subscribed → renderuje children normalnie.
3. Jezeli brak → pelnoekranowy modal z bg-black/85 backdrop-blur, zawartosc strony zablokowana (`pointer-events-none opacity-30`).
4. Modal: tytul + opis kontekstowy, czerwone ostrzezenie gdy denied (instrukcja odblokowania), zolte ostrzezenie iOS gdy nie zainstalowana jako PWA, zloty przycisk "Wlacz powiadomienia" + opcja "Przypomnij mi jutro" (snooze 24h w localStorage).
5. Po sukcesie → znika.

### Test IDs
`push-permission-gate`, `push-gate-enable-btn`, `push-gate-dismiss-btn`,
`public-push-permission-gate`, `public-push-gate-enable-btn`, `public-push-gate-dismiss-btn`.

---

## 2026-05-19 (3) — Modul Budzetowanie budow (NOWA ZAKLADKA)

### Cel
Pelnoprawne planowanie i kontrola realizacji budowy. Inspirowany "Protokol nowy 2026.xlsx" — plan wartosci, kaucje GIR/DW, wykonanie liczone z Zapisow, % zaawansowania per miesiac, harmonogram z osia czasu.

### Backend (`routes/budget.py` - nowy plik 295 lini)
**Kolekcje:**
- `budget_lines` — pozycje budzetu per budowa (kategoria, nazwa, jednostka, ilosc, cena_jedn, plan_netto, kaucja_gir_pct, kaucja_dw_pct, is_income)
- `budget_progress` — % zaawansowania per pozycja per miesiac (year, month, progress_pct, value_netto)
- `budget_tasks` — zadania harmonogramu (name, start_date, end_date, progress_pct, color, dependencies)
- `finance_zapisy.budget_line_id` — nowy opcjonalny field linkujacy zapis do konkretnej pozycji budzetu

**Endpointy (wszystkie wymagaja admin):**
- `GET /budget/budowy` — lista budow z podsumowaniem (lines_count, tasks_count, plan_costs_netto, execution_netto)
- `GET /budget/{budowa_id}/lines` — pozycje + agregowane wykonanie z finance_zapisy (per linia: execution_netto, progress_pct, remaining_netto, kaucja_*_amount)
- `POST /budget/lines` — nowa pozycja
- `PATCH /budget/lines/{id}` — edycja
- `DELETE /budget/lines/{id}` — usuniecie + cleanup progressu + odlinkowanie zapisow (nie usuwa zapisow!)
- `GET /budget/{budowa_id}/progress?year=YYYY` — macierz zaawansowania
- `POST /budget/lines/{id}/progress` — upsert % zaawansowania (year, month, pct)
- `GET /budget/{budowa_id}/tasks` — zadania harmonogramu
- `POST /budget/tasks` — nowe zadanie
- `PATCH /budget/tasks/{id}` — edycja
- `DELETE /budget/tasks/{id}` — usuniecie + cleanup zaleznosci

### Frontend (`components/Budget.js` - nowy plik ~570 lini)
**Glowny komponent `<Budget>`:**
- Dropdown wyboru budowy (pokazuje plan / wyk od razu)
- Input roku (default biezacy)
- Cztery kafelki podsumowania
- 3 sub-tab'y: Budzet / % Protokol / Harmonogram

**Tab Budzet — `<BudgetLinesPanel>`:**
- Tabela grupowana po kategorii (Beton, Stal, Robocizna...)
- Kolumny: Kategoria/Nazwa, Ilosc, Jedn., Cena j., Plan netto, Kaucja GIR (% + zl), Kaucja DW, Wykonanie, %, Pozostalo
- Wiersze sumy: RAZEM PRZYCHODY / RAZEM KOSZTY / MARZA
- Modal `<BudgetLineModal>` — dodawanie/edycja pozycji (checkbox is_income, opcjonalny jawny plan_netto)
- Kolory % wykonania: zielony <80%, zloty 80-100%, czerwony >100%

**Tab % Protokol — `<ProgressPanel>`:**
- Macierz: wiersze=pozycje, kolumny=12 miesiecy
- Inline edytowalne pola % (0-100), zapis na blur
- Plan netto widoczny obok nazwy

**Tab Harmonogram — `<SchedulePanel>` + `<GanttView>`:**
- Toggle Lista <-> Gantt
- Lista: tabela z Nazwa / Start / Koniec / Dni / % / akcje
- **Gantt** (wlasny, prosty SVG-free implementacja): pasek per zadanie na osi czasu, dynamiczna szerokosc = liczba dni × 24px, kolor + overlay 30% bg-black na niewykonanej czesci
- Header z markerami miesiecznymi (Sty 2026, Lut 2026...)
- Modal `<ScheduleTaskModal>` — start/koniec dat, % wykonania, kolor (color picker), notatki

### Integracja Finanse → Zapisy
- Modal dodawania/edycji Zapisu: gdy wybrano budowe, pojawia sie dodatkowy dropdown **"Pozycja budzetu (opcjonalnie)"** z lista pozycji tej budowy (kategoria → nazwa + plan)
- Backend `ZapisCreate` i `ZapisUpdate` przyjmuja `budget_line_id`
- `_compute_plan` agregat: wykonanie = SUM(finance_zapisy.netto WHERE budget_line_id IN line_ids)
- Walidacja przy create — sprawdzane czy pozycja istnieje

### Testy (`tests/test_budget_logic.py`)
5 unit testow logiki `_compute_plan` i obliczen kaucji. Razem z istniejacymi 6 testami Fakturowni: 11/11 PASS.

### E2E weryfikacja (preview)
- Utworzona pozycja Beton C8/10: 120 m³ × 340 zł = **40 800 zl plan**, GIR 5% = 2 040 zl
- Wpis progresu maj=75% → value_netto auto-liczone 30 600 zl
- Zadanie "Wylewki fundamentowe" 01.05-15.05 50% → pasek Gantt renderowany prawidlowo
- Zapis 15 000 zl z budget_line_id → execution wzrosl do **15 000 zl, progres 36,8%, pozostalo 25 800 zl** ✓
- Lint czysty FE+BE, brak regresji

### Wymagana akcja uzytkownika
1. **Redeploy backend** (nowy router /api/budget + zmiany w finance.py).
2. **Redeploy frontend** (nowa zakladka "Budzetowanie" + dropdown budget_line_id w modal Zapisy).
3. Po deploy: dla kazdej budowy stworz pozycje budzetu, ustaw zadania w harmonogramie, na koncu miesiaca wpisuj % zaawansowania w Protokole.


---

## 2026-05-19 (4) — Generator protokolu miesiecznego xlsx

### Co dodano
1. **Pola na finance_budowy** (do naglowka protokolu):
   - `zamawiajacy` (string)
   - `umowa_nr` (string)
   - `umowa_data` (string, free-form np. "15.09.2025 + ANEKS NR 1")
   - `wykonawca` (string, default "FEGRRO SP. Z O.O. NIP: 589-206-61-74")
   - Modyfikacja `BudowaCreate`/`BudowaUpdate` + doc construct + frontend modalu edycji budowy w Finanse → Budowy (nowa sekcja "DANE DO PROTOKOLU MIESIECZNEGO" z 4 polami)

2. **Endpoint** `GET /api/budget/{budowa_id}/protokol/{year}/{month}`:
   - Zwraca StreamingResponse z `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   - Naglowek: numer protokolu (auto-policzony jako count unikalnych miesiecy z progresem +1), okres rozliczeniowy (1-ostatni dnia miesiaca), nazwa budowy, umowa, zamawiajacy, wykonawca
   - Tabela 15 kolumn: LP / Kategoria / Pozycja / Jedn. / Ilosc / Cena j. / Budzet / Kaucja GIR / Kaucja DW / Budzet zw. / Narastajaco % / Narastajaco zl / Poprz. m-c % / M-c rozlicz. % / M-c rozlicz. zl
   - **Kaucje GIR/DW**: pierwszenstwo ma `kaucja_*_pct` z `budget_lines`, fallback do `kaucja_*_pct` z `finance_budowy`
   - **Miesiac rozliczeniowy %** = narastajaco % - poprzedni miesiac %
   - **Miesiac rozliczeniowy zl** = (budzet - kaucje) × miesiac %
   - Wiersz RAZEM z sumami kolumn finansowych
   - Stopka: scalonewiersze "ZAMAWIAJACY" / "WYKONAWCA" + linie podpisow
   - Naglowek zlotym tlem `#D4AF37`, kolumny szare `#E5E7EB`, cienkie borderki

3. **Frontend** (`Budget.js`):
   - Nowy komponent `<ProtokolDownloader>` (dropdown miesiac + zloty przycisk "Pobierz protokol xlsx")
   - Umieszczony w naglowku panelu Protokol (zakladka % Protokol)
   - Pobieranie przez `responseType: 'blob'` + automatyczny download z nazwa `Protokol_{nazwa}_{YYYY-MM}.xlsx`

### Weryfikacja E2E (preview)
- Budowa LEBA z ustawionym zamawiajacym ALLCON, umowa 051/FEGRRO/PLICHTA, kaucje GIR 5% + DW 3%
- Pozycja Beton C8/10 120 m³ × 340 zl = 40 800 zl
- Maj 2026 progres 75% → wygenerowany xlsx ma:
  - PROTOKOL STANU ZAAWANSOWANIA ROBOT NR 1
  - OKRES: 2026-05-01 ÷ 2026-05-31
  - Budzet 40 800 / GIR 2 040 / DW 1 224 / Budzet zw. 37 536 / Narastajaco 75% = 28 152 zl / M-c rozlicz. 75% = 28 152 zl ✓
  - RAZEM + miejsce na podpisy ✓
- Plik 4.9 KB, HTTP 200, otwarty w openpyxl - poprawny.

### Lint
- Lint czysty FE+BE, brak regresji.


---

## 2026-05-19 (5) — Protokol jako PRZEROB MIESIECZNY + walidacja + modal danych umowy

### Zmiana koncepcji (BREAKING)
Wczesniej `budget_progress.progress_pct` byl traktowany jako "narastajaco do tego miesiaca". Po feedbacku uzytkownika zmienione na **przerob miesieczny** (% wykonane w danym miesiacu).

**Nowy schemat danych:**
- `budget_progress.progress_pct` = przerob TEGO miesiaca (0-100)
- Suma `progress_pct` per pozycja po wszystkich miesiacach NIE moze przekroczyc 100%
- Narastajaco = SUMA przerobow do biezacego miesiaca wlacznie

### Backend zmiany (`routes/budget.py`)
1. **`set_progress`** — walidacja: SUM(inne miesiace) + nowa wartosc <= 100%. Przy przekroczeniu HTTP 400 z komunikatem "Pozostalo do rozdysponowania: X%".
2. **`_fetch_protokol_data`** — `progress_prev[lid]` to teraz SUMA wszystkich przerobow PRZED biezacym miesiacem (a nie ostatnia wartosc).
3. **Logika protokolu xlsx + PDF**:
   - `miesiac_pct = progress_curr` (przerob biezacego)
   - `prev_pct = progress_prev` (suma narast. do poprzedniego)
   - `narast_pct = min(100, prev_pct + miesiac_pct)`
4. **Numeracja protokolu** — count unikalnych (year, month) gdzie `progress_pct > 0` przed biezacym + 1.
5. **Nowe endpointy:**
   - `GET /budget/{id}/protokol-check` — zwraca `{ready, missing, budowa}` (sprawdza czy umowa_nr + zamawiajacy sa wypelnione)
   - `PATCH /budget/{id}/contract` — szybka aktualizacja umowa_nr/umowa_data/zamawiajacy/wykonawca

### Frontend zmiany (`Budget.js`)
1. **`ProtokolDownloader`**:
   - Przed pobraniem wywoluje `protokol-check`. Gdy `ready=false` → otwiera **`<ContractDataModal>`** zamiast od razu generowac.
   - Po zapisaniu modal → automatycznie kontynuuje download w wybranym formacie.
2. **`<ContractDataModal>`** — nowy komponent. 4 pola (umowa_nr*, umowa_data, zamawiajacy*, wykonawca), zapisuje przez PATCH `/budget/{id}/contract`.
3. **`ProgressPanel`**:
   - Nowa kolumna **Σ %** (suma realizacji per pozycja) z kolorami: szary <80%, zloty 80-99%, oliwka 100%.
   - Komunikat "Wpisz **przerob miesieczny** w % - suma wszystkich miesiecy nie moze przekroczyc 100%".
   - Klient-side walidacja w `setCell` — toast z pozostalym limitem gdy przekroczenie.
   - Backend nadal jest source-of-truth (HTTP 400 jest takze pokazywany).

### E2E weryfikacja
- Maj=100% + proba dodania 30% w czerwcu → **HTTP 400 "Pozostalo do rozdysponowania: 0.0%"** ✓
- Reset maj=60% + czerwiec=30% → protokol czerwca pokazuje:
  - NR 2 (auto, bo maj jest poprzedzajacym miesiacem z przerobem) ✓
  - Narast. 90% = 36 720 zl ✓
  - Poprzedni 60% = 24 480 zl ✓
  - Miesiac rozlicz. 30% = 12 240 zl ✓
  - DO ZAFAKTUROWANIA: 12 240 zl NETTO ✓
- UI Σ % pokazuje 90.0% (kolor zloty) ✓

### Lint czysty FE+BE

