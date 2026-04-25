# FeGrro Godziny - System Rejestracji Godzin Pracy

## Original Problem Statement
Użytkownik (`dominik12grzenia-ui`) przypadkowo usunął czat Emergent z projektem **FeGrro Godziny** (system ewidencji godzin pracy dla firmy budowlanej). Pobrał kod jako zip, zrobił deploy (Render + Vercel + MongoDB Atlas), ale aplikacja nie zadziałała poprawnie. Brakowała mu zakładka **SPRZĘT**, którą wcześniej omawialiśmy. Cel sesji: odzyskać projekt z GitHuba i dobudować zakładkę SPRZĘT.

## Tech Stack
- Backend: FastAPI + Motor (MongoDB) + APScheduler + python-jose + bcrypt + msal (OneDrive) + reportlab
- Frontend: React 19 + Tailwind + shadcn/ui + Radix + lucide-react + axios + react-router-dom 7
- Database: MongoDB (Atlas w prod / local w dev)
- Deploy target: Render.com (backend) + Vercel (frontend) + domain `godziny.fegrro.pl`
- Integracje: Microsoft Graph (OneDrive Excel), Google Maps, Outlook Calendar

## Core Requirements (z poprzednich sesji)
- Pracownicy i budowy synchronizowane z Excel OneDrive (Wypłaty główny.xlsx)
- Write-back: sumy godzin/zaliczek/kar zapisywane do Excela
- Brygadziści rejestrują się, admin zatwierdza i przypisuje budowy
- Publiczne linki dla pracowników (godziny, zaliczki, kary, nieobecności)
- Dark mode UI z brandingiem FeGrro (zielony #5F7151, dark #1E293B)
- PWA (instalacja na ekranie głównym)

## Architecture
```
/app/backend/
├── server.py (CORS, scheduler, route imports)
├── database.py, utils.py, auth.py, models.py, onedrive.py
├── routes/
│   ├── auth.py, employees.py, sites.py, assignments.py
│   ├── hours.py, requests.py, absences.py, advances.py
│   ├── penalties.py, reports.py, sync.py, public.py
│   └── equipment.py  ← NOWY (2026-04-25)

/app/frontend/src/components/
├── AdminDashboard.js (5 zakładek: Budowy, Brygadzisci, Prosby, Sprzet, Narzedzia)
├── HoursTable.js, AssignmentManager.js, WorkerDashboard.js
├── AdminLogin.js, ForemanEntry.js, WorkerEntry.js
├── PublicHours.js, SitesMap.js, PWAInstallPrompt.js
└── EquipmentManager.js  ← NOWY (2026-04-25)
```

## Implemented in this session (2026-04-25)
- ✅ Odzyskanie projektu z GitHub (https://github.com/dominik12grzenia-ui/fegrro-godziny)
- ✅ Postawienie aplikacji w środowisku Emergent (backend + frontend + MongoDB lokalne)
- ✅ Backend: nowy moduł `routes/equipment.py` z modelami i CRUD endpoints:
  - `GET /api/equipment` (z filtrami: status, employee_id, site_id)
  - `POST /api/equipment` (admin only, walidacja wymaganej nazwy)
  - `PUT /api/equipment/{id}` (admin only)
  - `POST /api/equipment/{id}/assign` (przypisanie/zwrot na magazyn)
  - `DELETE /api/equipment/{id}` (admin only, 404 dla nieistniejącego)
- ✅ Frontend: komponent `EquipmentManager.js` z pełnym UI:
  - Statystyki (Wszystkie / Wydane / Uszkodzone / W serwisie)
  - Wyszukiwarka po nazwie/kategorii/SN/pracowniku/budowie
  - Filtr statusu (sprawny/uszkodzony/w_serwisie/wycofany)
  - Karty sprzętu z badge statusu, kategorią, SN, przypisanym pracownikiem/budową
  - Modal dodawania/edycji ze wszystkimi polami + upload zdjęcia base64 (max 2MB)
  - Przyciski Edytuj/Usuń z confirm dialog
- ✅ Zakładka "Sprzet" dodana do AdminDashboard (5. zakładka, ikona Wrench)
- ✅ Naprawiono pre-existing bug: JWT_SECRET vs JWT_SECRET_KEY mismatch w `auth.py`
- ✅ Zaseedowano przykładowe konto admin (admin@fegrro.pl / Admin123!) w lokalnym MongoDB
- ✅ Testing agent: 30/30 testów backend zaliczonych (CRUD, auth, walidacja, filtry, regression dla istniejących endpointów)
- ✅ Frontend zweryfikowany screenshotem: zakładka Sprzet wyświetla 9 demo elementów

## Test Credentials (dev)
- Admin: `admin@fegrro.pl` / `Admin123!` (patrz /app/memory/test_credentials.md)
- Database: MongoDB lokalne, DB_NAME=test_database
- Equipment: 9 demo items zasieded by testing agent

## Backlog (z poprzednich sesji + nowe)
- P0: Zdiagnozować problem deployu na Render.com — user nie podał dokładnie co nie działa
- P1: SPRZĘT — widoczność dla brygadzistów (obecnie tylko admin)
- P1: SPRZĘT — historia wydania/zwrotu (audit log)
- P1: SPRZĘT — eksport listy do PDF/Excel
- P2: Push notifications SMS/Viber dla brygadzistów
- P2: Walidacja `assigned_to_employee_id` / `assigned_to_site_id` — sprawdzanie czy istnieje
- P2: Enum (Literal) dla statusu sprzętu w Pydantic
- P3: Refaktoryzacja AdminDashboard.js i HoursTable.js (sub-components)
- P3: Google Maps migrate Marker → AdvancedMarkerElement
- P3: Pagination /api/equipment (obecnie hard limit 2000)

## Known Pre-existing Issues
- JWT_SECRET / JWT_SECRET_KEY env name mismatch — zostało naprawione (auth.py czyta oba)
- W .env brak GOOGLE_MAPS_API_KEY — przez to "This page can't load Google Maps correctly" na zakładce Budowy
- W .env brak AZURE_* — sync OneDrive nie działa lokalnie
