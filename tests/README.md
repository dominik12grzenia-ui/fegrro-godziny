# FeGrro ERP — Smoke Test

Szybki test integracyjny wykrywający regresje po deploy'u.

## Uruchomienie

```bash
# Test produkcji (URL z frontend/.env)
/opt/plugins-venv/bin/python3 /app/tests/smoke_test.py

# Test innej domeny
/opt/plugins-venv/bin/python3 /app/tests/smoke_test.py --url https://your-domain.com

# Debug w widocznej przeglądarce
/opt/plugins-venv/bin/python3 /app/tests/smoke_test.py --headed
```

## Co testuje

1. **Login** jako admin — sprawdza czy auth działa
2. **Wszystkie zakładki admin panelu** (12 zakładek):
   - Lokalizacje, Brygadziści, Elektronarzędzia, Akcesoria, Szalunki
   - Materiały, Odzież, BHP
   - Wypłaty, Finanse, Budżetowanie, Wyceny
3. **Edytor wycen** — otwiera pierwszą wycenę aby zweryfikować że PosRow/SubRow (gdzie żyje `<Td>`) renderują bez błędów
4. **Page reloads** — żaden klik tab nie może spowodować pełnego przeładowania strony
5. **JavaScript runtime errors** — `pageerror` listener wykryje "Can't find variable", "is not defined", "undefined is not a function"
6. **Console errors** — z pominięciem znanych szumów (Google Maps key, Service Worker, favicon 404)

## Exit codes

- `0` — wszystko OK, można deployować
- `1` — wykryto błąd, NIE deployuj
- `2` — playwright nie zainstalowany

## Przykład CI (GitHub Actions)

```yaml
- name: Smoke test po deploy'u
  run: /opt/plugins-venv/bin/python3 /app/tests/smoke_test.py --url ${{ secrets.PROD_URL }}
```

## Kiedy uruchamiać

- Po każdym `Save to GitHub` / deploy'u na nową wersję
- Po dużych refaktorach (splity, zmiany routingu)
- Przed prezentacją nowych ficzerów
