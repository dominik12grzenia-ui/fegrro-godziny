# UptimeRobot — instrukcja konfiguracji (FeGrro)

UptimeRobot pinguje Twój backend co 5 minut, zeby Render nie wlaczyl trybu
uspienia. Po wdrozeniu tej konfiguracji aplikacja bedzie sie otwierac w <2s
zamiast >10s (eliminujemy cold start backendu).

**Koszt:** 0 zl. Plan darmowy = 50 monitorow, 5-minutowy interwal, alerty mailowe.

## Krok 1: Zaloz konto

1. Wejdz na <https://uptimerobot.com/signUp>
2. Podaj e-mail biuro@fegrro.pl, ustaw haslo.
3. Potwierdz e-mail (mail z linkiem aktywacyjnym).

## Krok 2: Dodaj monitor backendu

1. Po zalogowaniu klikni **+ Add New Monitor** (lewy gorny rog).
2. Wypelnij formularz:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `FeGrro - Backend Health`
   - **URL (or IP):** `https://twoj-backend.onrender.com/api/health`
     - **Wazne:** podaj URL backendu z Render, nie frontu z Vercela.
     - Endpoint `/api/health` zwraca `{"status":"healthy",...}` (juz dziala).
   - **Monitoring Interval:** `5 minutes` (najczestsze w planie free).
   - **Monitor Timeout:** zostaw domyslnie 30s.
   - **Send alerts:** zaznacz pole z mailem (powiadomienie gdy backend padnie).
3. Klikni **Create Monitor**.

## Krok 3: (Opcjonalnie) Dodaj monitor frontu

Powtorz krok 2 dla:
- **Friendly Name:** `FeGrro - Frontend`
- **URL:** `https://twoj-frontend.vercel.app/` (lub własna domena)

## Krok 4: Sprawdz, czy dziala

1. W dashboardzie UptimeRobot zobaczysz monitor ze statusem **Up** (zielony).
2. Po ~5 min sprawdz logi backendu (na Render): powinny pojawic sie zapytania
   z User-Agent `Mozilla/5.0 (compatible; UptimeRobot/2.0; ...)`.
3. Wejdz na aplikacje rano, gdy normalnie byl cold start — teraz powinno sie
   wlaczyc od razu.

## Krok 5: Alerty (opcjonalnie)

- W UptimeRobot → **My Settings** → **Alert Contacts** → mozesz dodac:
  - SMS (platne dodatki)
  - Slack/Telegram/Discord (darmowe webhooki)
  - Wiele e-maili (jesli chcesz wysylac do zespolu)

## Pulapki

- **Nie pinguj /api** bez sufiksu `/health` — backend zwroci 404 i UptimeRobot
  uzna to za awarie.
- Free plan = max 50 monitorow, 5-min interwal. To wystarczy w 100%.
- Backend Render w trybie darmowym (free tier) idzie spac po **15 min**
  nieaktywnosci. UptimeRobot pinguje co 5 min - wiec backend NIGDY nie zasnie.
- Jesli zaplaczesz za Render Standard ($7/mc) — backend nigdy nie spi i
  UptimeRobot staje sie tylko narzedziem do alertow, nie keep-alive.

## Co dalej

Po skonfigurowaniu wroc do mnie i powiedz "uptime gotowe" — sprawdze logi
backendu i potwierdze ze pingi przychodza.
