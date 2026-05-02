# FeGrro - System Rejestracji Godzin Pracy

## Production URLs
- **Frontend (Vercel)**: https://godziny.fegrro.pl
  - Admin login: https://godziny.fegrro.pl/login
  - Brygadzista login: https://godziny.fegrro.pl/foreman
  - Publiczny link pracownika: https://godziny.fegrro.pl/hours/{token}
- **Sandbox preview**: https://nostalgic-visvesvaraya-4.preview.emergentagent.com

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

## Completed (2026-02-12)
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
