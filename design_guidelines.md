# FeGrro Brand Guidelines

## 1. Core Identity
- **Branża:** Usługi budowlane (wykonawstwo).
- **Cel Estetyczny:** Luksusowy, elegancki, nowoczesny i przyjazny dla oka.
- **Logo:** Białe litery "FeGrro" + symbol skrzydlatego F (bez modyfikacji).

## 2. Color System
System kolorów "Jewel & Luxury" inspirowany solidnością konstrukcji i elegancją premium:
- **Tło Główne (Background):** `#0B1120` (Najgłębszy nocny granat).
- **Powierzchnie (Karty, Panele):** `#131C2F` (Powierzchnia bazowa), `#19243C` (Karty).
- **Zieleń Marki (Primary):** `#4F6343` (Zieleń oliwkowa/szmaragdowa).
- **Złoto/Miedź (Accent):** `#D4AF37` (Statusy ostrzegawcze, finanse).
- **Czerwień (Destructive):** `#9B2C2C` (Błędy, krytyczne statusy).
- **Tekst:** `#F8FAFC` (Główny), `#94A3B8` (Drugorzędny).

## 3. Typography Stack
- **Headings (Nagłówki):** `Cabinet Grotesk` - geometryczny, techniczny, nadaje autorytetu. Używamy z zacieśnionym trackingiem (`tracking-tight`).
- **Body (Tekst Główny):** `Manrope` - wysoce czytelny, nowoczesny font bezszeryfowy, idealny na ekrany mobilne i do interfejsów (dobrze wygląda w świetle słonecznym na telefonie brygadzisty).
- **Data / Tables (Liczby):** `JetBrains Mono` - czcionka o stałej szerokości (tabular-nums), absolutnie krytyczna dla czytelności gęstych tabel finansowych i wypłat.

## 4. Layout & Spacing
- **Karty:** Usunięcie ostrych ramek, wprowadzenie miękkich granic (`border-[#2A3B59]`) z subtelnym tłem.
- **Tabele Finansowe:** Brak pionowych linii (które tworzą "więzienie" dla danych). Czyste, poziome linie (`border-b`), wyraźne stany `:hover`, wyrównanie liczb do prawej z użyciem fontu `monospace`.
- **Mobilność (PublicHours):** "Fat fingers" - duże obszary klikalne dla pracowników fizycznych, wysoki kontrast dla odczytu w pełnym słońcu.

## 5. UI Components
- **Bannery (Alerts):** Zamiast twardego koloru, używamy 15-20% opacity bazowego koloru z wyraźną ramką (np. `bg-[#D4AF37]/15 border-[#D4AF37]/50`), aby nie przytłaczać wzroku przy długiej pracy w biurze.
- **Przyciski:** Wyraźne zaokrąglenia (`rounded-md`), główna akcja to zawsze Zieleń Marki (`#4F6343`), akcje podrzędne to dyskretny granat/szarość. Płynne przejścia `transition-colors`.