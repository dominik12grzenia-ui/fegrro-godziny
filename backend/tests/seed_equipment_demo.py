"""Seed demo equipment data for FeGrro Godziny presentation.

Idempotent: cleans up TEST_ items first then creates demo set.
"""
import os
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

# Login
r = requests.post(f"{API}/auth/admin/login",
                  json={"email": "admin@fegrro.pl", "password": "Admin123!"})
r.raise_for_status()
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Cleanup TEST_ leftovers
existing = requests.get(f"{API}/equipment", headers=H).json()
for it in existing:
    if it.get("name", "").startswith("TEST_") or it.get("name", "").startswith("DEMO_"):
        requests.delete(f"{API}/equipment/{it['id']}", headers=H)

# Get an employee + site for assigning (optional)
emps = requests.get(f"{API}/employees", headers=H).json()
sites = requests.get(f"{API}/sites", headers=H).json()
emp_id = emps[0]["id"] if emps else None
site_id = sites[0]["id"] if sites else None

DEMO = [
    {"name": "Wiertarka udarowa Bosch GBH 2-26", "category": "Elektronarzedzia",
     "serial_number": "BSH-2026-001", "status": "sprawny",
     "notes": "Komplet z walizka i wiertlami"},
    {"name": "Mlot pneumatyczny Hilti TE 3000", "category": "Elektronarzedzia",
     "serial_number": "HLT-3000-077", "status": "uszkodzony",
     "notes": "Uszkodzona szczotka - oddany do serwisu 2026-01-10",
     "assigned_to_employee_id": emp_id},
    {"name": "Pila tarczowa Makita 5008MG", "category": "Elektronarzedzia",
     "serial_number": "MKT-5008-042", "status": "sprawny",
     "assigned_to_site_id": site_id},
    {"name": "Rusztowanie aluminiowe 6m", "category": "Rusztowania",
     "serial_number": "RUS-6M-A12", "status": "w_serwisie",
     "notes": "Coroczny przeglad bezpieczenstwa"},
    {"name": "Betoniarka 150L Atlas", "category": "Maszyny budowlane",
     "serial_number": "ATL-150-2024", "status": "sprawny",
     "assigned_to_site_id": site_id, "notes": "Zatankowana, gotowa do pracy"},
    {"name": "Agregat pradotworczy Honda EU22i", "category": "Maszyny budowlane",
     "serial_number": "HND-EU22-555", "status": "wycofany",
     "notes": "Wycofany z uzytku - awaria silnika"},
    {"name": "Spawarka inwertorowa Telwin 200A", "category": "Spawanie",
     "serial_number": "TLW-200-009", "status": "sprawny"},
    {"name": "Niwelator laserowy Stanley FatMax", "category": "Pomiary",
     "serial_number": "STN-FX-073", "status": "sprawny",
     "assigned_to_employee_id": emp_id, "notes": "W komplecie statyw + lata"},
]

created = []
for item in DEMO:
    r = requests.post(f"{API}/equipment", json=item, headers=H)
    r.raise_for_status()
    created.append(r.json()["name"])

print(f"Seeded {len(created)} demo equipment items:")
for n in created:
    print(f"  - {n}")
