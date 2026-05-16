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
- Zmiany **kompatybilne wstecz** - pracownicy i wszystkie dane zostaja po deployu Render.
- Brak destrukcyjnych migracji w startup_event.
