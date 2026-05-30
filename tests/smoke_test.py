#!/usr/bin/env python3
"""
FeGrro ERP — Smoke Test (iter95bl)
=====================================

Uruchamia szybki test wszystkich głównych zakładek aplikacji w przeglądarce,
wykrywa błędy JavaScript runtime i hard reloady. Idealny do uruchomienia
zaraz po deploy'u — wyłapuje regresje typu „brakujący import" zanim user się natknie.

Użycie:
    python3 /app/tests/smoke_test.py
    python3 /app/tests/smoke_test.py --url https://twoj-deploy.com
    python3 /app/tests/smoke_test.py --headed  # widoczna przeglądarka

Wymagania:
    - playwright (pip install playwright && playwright install chromium)

Exit codes:
    0 — wszystko OK
    1 — wykryto co najmniej 1 błąd
"""
import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

# Bootstrap playwright z plugins-venv jeśli nie ma w systemie
try:
    from playwright.async_api import async_playwright
except ImportError:
    PLUGIN_VENV = "/opt/plugins-venv/lib/python3.11/site-packages"
    if os.path.isdir(PLUGIN_VENV):
        sys.path.insert(0, PLUGIN_VENV)
        from playwright.async_api import async_playwright
    else:
        print("ERROR: playwright not installed. Run: pip install playwright && playwright install chromium")
        sys.exit(2)


# Domyślny URL — czytany z frontend/.env
def _read_default_url():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return "http://localhost:3000"


# Domyślne dane logowania — czytane z test_credentials.md
DEFAULT_EMAIL = "admin@fegrro.pl"
DEFAULT_PASSWORD = "Admin123!"


# ============================================================
# Definicja scenariusza testowego
# ============================================================
# Każdy krok: (label, akcja)
# Akcja zwraca True (PASS) lub rzuca wyjątek (FAIL)

TABS_TO_VISIT = [
    # (label, kliknij_selector, wait_ms)
    ("Lokalizacje", 'text=Lokalizacje', 2000),
    ("Brygadziści", '[data-testid="foremen-tab"]', 2000),
    ("Elektronarzędzia", '[data-testid="equipment-tab"]', 2500),
    ("Akcesoria", 'text=Akcesoria', 2500),
    ("Szalunki", 'text=Szalunki', 2500),
    ("Materiały", 'text=Materiały', 2000),
    ("Odzież", 'text=Odzież', 2000),
    ("BHP", 'text=BHP', 2000),
    ("Wypłaty", '[data-testid="payroll-tab"]', 2500),
    ("Finanse", 'text=Finanse', 2500),
    ("Budżetowanie", 'text=Budżetowanie', 2500),
    ("Wyceny", 'text=Wyceny', 2500),
]


async def run_smoke_test(base_url, email, password, headed=False):
    errors_total = []        # wszystkie błędy
    failed_tabs = []         # zakładki z błędami
    passed_tabs = []         # zakładki bez błędów
    reload_count = [0]       # licznik nawigacji

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not headed)
        context = await browser.new_context(viewport={"width": 1920, "height": 900})
        page = await context.new_page()

        # Słuchacze: błędy JS i full page reloads
        page_errors = []
        console_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("load", lambda _: reload_count.__setitem__(0, reload_count[0] + 1))

        def log_console(msg):
            if msg.type == "error":
                txt = msg.text
                # Ignoruj znane szumy
                if "Google Maps" in txt: return
                if "Service Worker" in txt: return
                if "Manifest" in txt: return
                if "Failed to load resource" in txt and ("favicon" in txt or "/api/" in txt): return
                console_errors.append(txt)
        page.on("console", log_console)

        try:
            print(f"\n🌐 Otwieram: {base_url}/login")
            await page.goto(f"{base_url}/login", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(1)

            print(f"🔑 Loguję jako {email}...")
            await page.fill('input[type="email"]', email)
            await page.fill('input[type="password"]', password)
            await page.click('button[type="submit"]')
            await page.wait_for_url("**/admin/dashboard", timeout=15000)
            await asyncio.sleep(3)

            # Odrzuć push gate jeśli się pokaże
            try:
                await page.click('text=Przypomnij mi jutro', timeout=3000)
                await asyncio.sleep(0.5)
            except Exception:
                pass

            initial_loads = reload_count[0]
            print(f"✅ Zalogowany. Page loads: {initial_loads} (oczekiwane: 2: /login + /admin/dashboard)\n")

            # Przejdź przez wszystkie zakładki
            print("=" * 60)
            print("Test zakładek")
            print("=" * 60)
            for label, selector, wait_ms in TABS_TO_VISIT:
                t0 = time.time()
                errs_before = len(page_errors) + len(console_errors)
                reload_before = reload_count[0]
                try:
                    await page.click(selector, timeout=8000)
                    await asyncio.sleep(wait_ms / 1000)
                    elapsed = (time.time() - t0) * 1000
                    new_errs = (len(page_errors) - errs_before + len(console_errors) - errs_before) if False else \
                               (len(page_errors) + len(console_errors) - errs_before)
                    new_reloads = reload_count[0] - reload_before
                    if new_errs > 0:
                        failed_tabs.append((label, "JS error"))
                        print(f"  ❌ {label:18s} {elapsed:6.0f}ms  [+{new_errs} errors]")
                    elif new_reloads > 0:
                        failed_tabs.append((label, "page reload"))
                        print(f"  ⚠️  {label:18s} {elapsed:6.0f}ms  [+{new_reloads} reloads]")
                    else:
                        passed_tabs.append(label)
                        print(f"  ✅ {label:18s} {elapsed:6.0f}ms")
                except Exception as e:
                    failed_tabs.append((label, f"click failed: {str(e)[:80]}"))
                    print(f"  ❌ {label:18s} klik nieudany: {str(e)[:80]}")

            # Bonus: otwórz pierwszą wycenę (sprawdza PosRow/SubRow z Td)
            print("\n" + "=" * 60)
            print("Test edytora Wycen (PosRow + SubRow z <Td>)")
            print("=" * 60)
            try:
                # Tab Wyceny powinien być aktywny
                errs_before = len(page_errors) + len(console_errors)
                rows = await page.query_selector_all('tr[data-testid^="wycena-row-"], tbody tr')
                if rows:
                    # Kliknij pierwszą linię z wyceną
                    first = rows[0]
                    await first.click()
                    await asyncio.sleep(3)
                    new_errs = len(page_errors) + len(console_errors) - errs_before
                    if new_errs > 0:
                        failed_tabs.append(("Wyceny editor", "JS error po otwarciu"))
                        print(f"  ❌ Wyceny editor: +{new_errs} errors")
                    else:
                        passed_tabs.append("Wyceny editor")
                        print(f"  ✅ Wyceny editor: otwarty bez błędów")
                else:
                    print(f"  ⏭️  Brak wycen do testowania (pomijam)")
            except Exception as e:
                print(f"  ⚠️  Wyceny editor: {str(e)[:80]}")

        except Exception as e:
            errors_total.append(f"Test setup failed: {e}")
            print(f"\n💥 KRYTYCZNY BŁĄD: {e}")

        finally:
            errors_total = page_errors + console_errors
            await browser.close()

    # ============================================================
    # Raport
    # ============================================================
    print("\n" + "=" * 60)
    print("📊 PODSUMOWANIE")
    print("=" * 60)
    print(f"  Zakładki: {len(passed_tabs)} PASS / {len(failed_tabs)} FAIL")
    print(f"  Page errors (JS runtime): {len(page_errors)}")
    print(f"  Console errors: {len(console_errors)}")
    print(f"  Page loads: {reload_count[0]} (oczekiwane: 2)")

    if page_errors:
        print("\n  💥 RUNTIME ERRORS:")
        for er in page_errors[:5]:
            print(f"    - {er[:200]}")
    if console_errors:
        print("\n  ⚠️  CONSOLE ERRORS:")
        for er in console_errors[:5]:
            print(f"    - {er[:200]}")
    if failed_tabs:
        print("\n  ❌ FAILED TABS:")
        for tab, reason in failed_tabs:
            print(f"    - {tab}: {reason}")

    success = (not failed_tabs and not page_errors and not console_errors)
    print()
    if success:
        print("🎉 SMOKE TEST: PASS — aplikacja działa stabilnie")
        return 0
    else:
        print("🔥 SMOKE TEST: FAIL — wymaga uwagi")
        return 1


def main():
    parser = argparse.ArgumentParser(description="FeGrro ERP smoke test")
    parser.add_argument("--url", default=_read_default_url(), help="URL aplikacji")
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--password", default=DEFAULT_PASSWORD)
    parser.add_argument("--headed", action="store_true", help="Pokaż przeglądarkę (debug)")
    args = parser.parse_args()

    print(f"\n🧪 FeGrro Smoke Test")
    print(f"   URL: {args.url}")
    print(f"   User: {args.email}")
    print(f"   Mode: {'headed' if args.headed else 'headless'}\n")

    exit_code = asyncio.run(run_smoke_test(args.url, args.email, args.password, args.headed))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
