"""iter95j: Generowanie harmonogramu z pozycji budzetu."""
import os
import uuid
import time
import pytest
import requests

API = os.environ.get("API_URL", "http://localhost:8001/api")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@fegrro.pl")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "Admin123!")


@pytest.fixture(scope="module")
def H():
    for _ in range(3):
        r = requests.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        if r.status_code == 200:
            return {"Authorization": f"Bearer {r.json()['access_token']}"}
        time.sleep(2)
    r.raise_for_status()


def test_generate_creates_task_per_position(H):
    """Generator tworzy task dla kazdej pozycji."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"GEN-{suffix}"}, headers=H).json()["id"]
    # 2 etapy, kazdy z 2 pozycjami
    s1 = requests.post(f"{API}/budget/stages", json={"budowa_id": bud, "name": "E1"}, headers=H).json()["id"]
    s2 = requests.post(f"{API}/budget/stages", json={"budowa_id": bud, "name": "E2"}, headers=H).json()["id"]
    p1 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "P1"}, headers=H).json()["id"]
    p2 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "P2"}, headers=H).json()["id"]
    p3 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s2, "name": "P3"}, headers=H).json()["id"]
    p4 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s2, "name": "P4"}, headers=H).json()["id"]
    # Generuj
    r = requests.post(f"{API}/budget/{bud}/tasks/generate", json={
        "start_date": "2026-04-01", "days_per_position": 10, "parallel_stages": False,
    }, headers=H)
    r.raise_for_status()
    data = r.json()
    assert data["created"] == 4
    assert data["skipped"] == 0
    assert data["total_positions"] == 4
    # Sprawdz daty - sekwencyjne
    tasks = requests.get(f"{API}/budget/{bud}/tasks", headers=H).json()["rows"]
    tasks_by_pos = {t["position_id"]: t for t in tasks}
    assert tasks_by_pos[p1]["start_date"] == "2026-04-01"
    assert tasks_by_pos[p1]["end_date"] == "2026-04-10"
    assert tasks_by_pos[p2]["start_date"] == "2026-04-11"
    assert tasks_by_pos[p2]["end_date"] == "2026-04-20"
    # Etap 2 zaczyna sie po E1 (sekwencyjnie)
    assert tasks_by_pos[p3]["start_date"] == "2026-04-21"
    assert tasks_by_pos[p4]["end_date"] == "2026-05-10"
    # progress_source = auto (bo position_id ustawiony)
    for t in tasks:
        assert t["progress_source"] == "auto"


def test_generate_skips_existing(H):
    """Druga generacja pomija pozycje ktore juz maja task."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"GENSKIP-{suffix}"}, headers=H).json()["id"]
    s1 = requests.post(f"{API}/budget/stages", json={"budowa_id": bud, "name": "E1"}, headers=H).json()["id"]
    p1 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "P1"}, headers=H).json()["id"]
    p2 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "P2"}, headers=H).json()["id"]
    # Pierwsza generacja
    r1 = requests.post(f"{API}/budget/{bud}/tasks/generate", json={
        "start_date": "2026-04-01", "days_per_position": 5,
    }, headers=H).json()
    assert r1["created"] == 2
    # Druga - powinna pominac wszystkie
    r2 = requests.post(f"{API}/budget/{bud}/tasks/generate", json={
        "start_date": "2026-04-01", "days_per_position": 5,
    }, headers=H).json()
    assert r2["created"] == 0
    assert r2["skipped"] == 2
    # Dodaj nowa pozycje - ta powinna zostac wygenerowana
    p3 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "P3"}, headers=H).json()["id"]
    r3 = requests.post(f"{API}/budget/{bud}/tasks/generate", json={
        "start_date": "2026-04-01", "days_per_position": 5,
    }, headers=H).json()
    assert r3["created"] == 1
    assert r3["skipped"] == 2


def test_generate_parallel_stages(H):
    """parallel_stages=True - wszystkie etapy zaczynaja sie tego samego dnia."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"GENPAR-{suffix}"}, headers=H).json()["id"]
    s1 = requests.post(f"{API}/budget/stages", json={"budowa_id": bud, "name": "E1"}, headers=H).json()["id"]
    s2 = requests.post(f"{API}/budget/stages", json={"budowa_id": bud, "name": "E2"}, headers=H).json()["id"]
    p1 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "P1"}, headers=H).json()["id"]
    p3 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s2, "name": "P3"}, headers=H).json()["id"]
    requests.post(f"{API}/budget/{bud}/tasks/generate", json={
        "start_date": "2026-04-01", "days_per_position": 7, "parallel_stages": True,
    }, headers=H)
    tasks = requests.get(f"{API}/budget/{bud}/tasks", headers=H).json()["rows"]
    by_pos = {t["position_id"]: t for t in tasks}
    # Oba etapy startuja tego samego dnia
    assert by_pos[p1]["start_date"] == "2026-04-01"
    assert by_pos[p3]["start_date"] == "2026-04-01"
