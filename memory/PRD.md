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

