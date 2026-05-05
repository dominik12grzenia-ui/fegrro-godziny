# FeGrro - System Rejestracji Godzin Pracy

## Production URLs
- **Frontend (Vercel) - default**: https://fegrro-godziny.vercel.app  *(zapasowy, zawsze dziala)*
  - Admin login: https://fegrro-godziny.vercel.app/login
  - Brygadzista login: https://fegrro-godziny.vercel.app/foreman
- **Frontend (custom domain)**: https://godziny.fegrro.pl  *(czeka na CNAME w jdm.pl)*
- **Sandbox preview**: https://nostalgic-visvesvaraya-4.preview.emergentagent.com
- **Vercel project**: doominik's projects → fegrro-godziny (Hobby plan)
- **Domain registrar**: Jdm.pl sp. z o.o. (https://jdm.pl/panel)
- **DNS instruction (Vercel)**: CNAME `godziny` → `b1162803be5ee9ae.vercel-dns-XX.com` (pelna wartosc do potwierdzenia od uzytkownika)

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
