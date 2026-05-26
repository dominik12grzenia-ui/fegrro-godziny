"""iter95i: Task harmonogramu czerpie % z protokolu, actual_end_date.

- Task z position_id automatycznie ma progress_source='auto'
- progress_pct = suma budget_progress.position_id do dzis
- actual_end_date moze byc ustawiona/wyczyszczona
"""
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


def test_linked_task_progress_from_protocol(H):
    """Task z position_id - progress_pct czerpany z protokolu."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"LINK-{suffix}"}, headers=H).json()["id"]
    s1 = requests.post(f"{API}/budget/stages", json={"budowa_id": bud, "name": "E1"}, headers=H).json()["id"]
    p1 = requests.post(f"{API}/budget/positions", json={"budowa_id": bud, "stage_id": s1, "name": "Roboty"}, headers=H).json()["id"]
    requests.post(f"{API}/budget/lines", json={
        "budowa_id": bud, "category": "labor", "name": "R", "type": "labor",
        "stage_id": s1, "position_id": p1, "quantity": 1, "unit_price_netto": 100,
    }, headers=H)
    # 40% w marcu, 25% w kwietniu = 65% total
    requests.post(f"{API}/budget/positions/{p1}/progress",
                  json={"year": 2026, "month": 3, "progress_pct": 40}, headers=H)
    requests.post(f"{API}/budget/positions/{p1}/progress",
                  json={"year": 2026, "month": 4, "progress_pct": 25}, headers=H)
    # Task linked to p1
    task = requests.post(f"{API}/budget/tasks", json={
        "budowa_id": bud, "name": "Etap 1 robocizna",
        "start_date": "2026-03-01", "end_date": "2026-05-31",
        "position_id": p1, "progress_pct": 50,  # ignorowane bo position_id ustawione
    }, headers=H).json()
    # GET tasks - powinien zwrocic auto progres
    rows = requests.get(f"{API}/budget/{bud}/tasks", headers=H).json()["rows"]
    my_task = next(t for t in rows if t["id"] == task["id"])
    assert my_task["progress_source"] == "auto"
    assert abs(my_task["progress_pct"] - 65.0) < 0.5, \
        f"progress_pct={my_task['progress_pct']} powinno byc 65.0 (z protokolu)"


def test_manual_task_progress(H):
    """Task bez position_id - progress_pct wpisywany recznie, progress_source='manual'."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"MAN-{suffix}"}, headers=H).json()["id"]
    task = requests.post(f"{API}/budget/tasks", json={
        "budowa_id": bud, "name": "Wykop", "start_date": "2026-04-01",
        "end_date": "2026-04-15", "progress_pct": 70,
    }, headers=H).json()
    rows = requests.get(f"{API}/budget/{bud}/tasks", headers=H).json()["rows"]
    my_task = next(t for t in rows if t["id"] == task["id"])
    assert my_task["progress_source"] == "manual"
    assert my_task["progress_pct"] == 70


def test_actual_end_date(H):
    """actual_end_date moze byc ustawiona i wyczyszczona."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"AED-{suffix}"}, headers=H).json()["id"]
    task = requests.post(f"{API}/budget/tasks", json={
        "budowa_id": bud, "name": "Ścianki", "start_date": "2026-05-01",
        "end_date": "2026-05-30", "actual_end_date": "2026-05-20",
    }, headers=H).json()
    assert task["actual_end_date"] == "2026-05-20"
    # PATCH wyczysc
    r = requests.patch(f"{API}/budget/tasks/{task['id']}",
                       json={"clear_actual_end_date": True}, headers=H)
    r.raise_for_status()
    assert r.json().get("actual_end_date") is None
    # PATCH ustaw nowe
    r = requests.patch(f"{API}/budget/tasks/{task['id']}",
                       json={"actual_end_date": "2026-05-25"}, headers=H)
    r.raise_for_status()
    assert r.json()["actual_end_date"] == "2026-05-25"


def test_create_task_invalid_position_id(H):
    """Task z nieistniejacym position_id - 400."""
    suffix = uuid.uuid4().hex[:6]
    bud = requests.post(f"{API}/finance/budowy", json={"name": f"INV-{suffix}"}, headers=H).json()["id"]
    r = requests.post(f"{API}/budget/tasks", json={
        "budowa_id": bud, "name": "Test", "start_date": "2026-04-01",
        "end_date": "2026-04-15", "position_id": "nonexistent-id-xyz",
    }, headers=H)
    assert r.status_code == 400
