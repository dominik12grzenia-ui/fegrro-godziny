from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timedelta
import uuid

from database import db
from models import UserCreate, UserLogin, Token
from auth import get_password_hash, verify_password, create_access_token, get_current_user, get_current_admin
from rate_limit import check_login_rate

router = APIRouter()


@router.post("/auth/admin/login", response_model=Token)
async def admin_login(credentials: UserLogin, request: Request):
    check_login_rate(request, "admin_login")
    user = await db.users.find_one({"email": credentials.email, "role": "admin"})
    if not user or not verify_password(credentials.password, user.get("hashed_password", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token(data={
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"]
    })
    
    return Token(
        access_token=token,
        token_type="bearer",
        user={
            "id": user["id"],
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user["role"]
        }
    )


@router.post("/auth/foreman/login", response_model=dict)
async def foreman_login(user_data: UserLogin, request: Request):
    """Login for foreman with full_name + password (no public registration)."""
    check_login_rate(request, "foreman_login")
    # UserLogin uses 'email' field but for foreman we pass full_name there
    name = (user_data.email or "").strip()
    password = user_data.password or ""
    if not name or not password:
        raise HTTPException(status_code=400, detail="Podaj imie i nazwisko oraz haslo")
    user = await db.users.find_one({"full_name": name, "role": "foreman"})
    if not user:
        raise HTTPException(status_code=401, detail="Nieprawidlowe dane logowania")
    hashed = user.get("hashed_password")
    if not hashed:
        raise HTTPException(status_code=401, detail="Konto jeszcze nie ma hasla - poczekaj az admin je ustawi")
    if not verify_password(password, hashed):
        raise HTTPException(status_code=401, detail="Nieprawidlowe dane logowania")
    token = create_access_token(data={
        "sub": user["id"],
        "role": "foreman"
    }, expires_delta=timedelta(days=365))
    return {
        "access_token": token,
        "user_id": user["id"],
        "full_name": user["full_name"],
        "role": "foreman",
        "assigned_sites": user.get("assigned_sites", []),
        "message": "Zalogowano"
    }


@router.post("/foremen")
async def admin_create_foreman(
    body: dict,
    current_user: dict = Depends(get_current_admin)
):
    """Admin creates a new foreman account with full_name + password."""
    full_name = (body.get("full_name") or "").strip()
    password = (body.get("password") or "").strip()
    if not full_name or not password:
        raise HTTPException(status_code=400, detail="Podaj imie i nazwisko oraz haslo")
    existing = await db.users.find_one({"full_name": full_name, "role": "foreman"})
    if existing:
        raise HTTPException(status_code=400, detail="Brygadzista o tym imieniu juz istnieje")
    user_doc = {
        "id": str(uuid.uuid4()),
        "full_name": full_name,
        "role": "foreman",
        "email": None,
        "hashed_password": get_password_hash(password),
        "assigned_sites": [],
        "status": "active",
        "created_at": datetime.now().isoformat(),
    }
    await db.users.insert_one(user_doc)
    user_doc.pop("_id", None)
    user_doc.pop("hashed_password", None)
    return user_doc


@router.post("/foremen/{foreman_id}/password")
async def admin_set_foreman_password(
    foreman_id: str,
    body: dict,
    current_user: dict = Depends(get_current_admin)
):
    """Admin sets or resets password for a foreman."""
    password = (body.get("password") or "").strip()
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Haslo musi miec co najmniej 4 znaki")
    result = await db.users.update_one(
        {"id": foreman_id, "role": "foreman"},
        {"$set": {"hashed_password": get_password_hash(password), "status": "active"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Brygadzista nie znaleziony")
    return {"message": "Haslo ustawione"}


@router.get("/foremen")
async def get_foremen(current_user: dict = Depends(get_current_user)):
    foremen = await db.users.find(
        {"role": "foreman"},
        {"_id": 0, "id": 1, "full_name": 1, "assigned_sites": 1, "status": 1, "created_at": 1, "hashed_password": 1}
    ).to_list(1000)
    # Expose only a boolean flag, never the hash itself
    for f in foremen:
        f["has_password"] = bool(f.pop("hashed_password", None))
    return foremen


@router.post("/foremen/{foreman_id}/sites")
async def assign_sites_to_foreman(
    foreman_id: str,
    body: dict,
    current_user: dict = Depends(get_current_admin)
):
    site_ids = body.get("site_ids", [])
    result = await db.users.update_one(
        {"id": foreman_id, "role": "foreman"},
        {"$set": {"assigned_sites": site_ids, "status": "active"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Foreman not found")
    return {"message": "Sites assigned successfully"}


@router.post("/foremen/{foreman_id}/impersonate")
async def impersonate_foreman(
    foreman_id: str,
    current_user: dict = Depends(get_current_admin),
):
    """Generate a foreman token for the admin to view their panel.
    The token has a short TTL (1h) and an `impersonated_by` claim so
    frontend can show a banner and the action is auditable.
    """
    foreman = await db.users.find_one({"id": foreman_id, "role": "foreman"}, {"_id": 0})
    if not foreman:
        raise HTTPException(status_code=404, detail="Foreman not found")
    token = create_access_token(data={
        "sub": foreman["id"],
        "role": "foreman",
        "impersonated_by": current_user["sub"],
    }, expires_delta=timedelta(hours=1))
    return {
        "access_token": token,
        "user_id": foreman["id"],
        "full_name": foreman["full_name"],
        "role": "foreman",
        "assigned_sites": foreman.get("assigned_sites", []),
        "impersonated_by": current_user["sub"],
        "message": f"Wcielony jako {foreman['full_name']} (1h)"
    }



@router.delete("/foremen/{foreman_id}")
async def delete_foreman(
    foreman_id: str,
    current_user: dict = Depends(get_current_admin)
):
    # Block deletion if foreman still has equipment assigned
    pipeline = [
        {"$match": {"foreman_id": foreman_id}},
        {"$group": {"_id": None, "total": {"$sum": "$quantity"}, "items": {"$sum": 1}}}
    ]
    result_eq = await db.equipment_assignments.aggregate(pipeline).to_list(1)
    if result_eq and result_eq[0]["total"] > 0:
        # Build details list with equipment names + qty
        assignments = await db.equipment_assignments.find(
            {"foreman_id": foreman_id, "quantity": {"$gt": 0}}, {"_id": 0}
        ).to_list(100)
        details = []
        for a in assignments:
            eq = await db.equipment.find_one({"id": a["equipment_id"]}, {"_id": 0, "name": 1})
            if eq:
                details.append(f"{eq['name']} x{a['quantity']}")
        raise HTTPException(
            status_code=400,
            detail=f"Nie mozna usunac brygadzisty - posiada przypisany sprzet ({result_eq[0]['total']} szt.): {', '.join(details)}. Najpierw zdejmij caly sprzet."
        )

    # Also block if foreman has pending outgoing transfers
    pending = await db.equipment_transfers.find_one({
        "from_foreman_id": foreman_id, "status": "pending"
    })
    if pending:
        raise HTTPException(
            status_code=400,
            detail="Brygadzista ma oczekujace przekazania sprzetu. Anuluj je przed usunieciem."
        )

    result = await db.users.delete_one({"id": foreman_id, "role": "foreman"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Brygadzista nie znaleziony")
    return {"message": "Brygadzista usuniety"}


@router.get("/foreman/me")
async def get_foreman_profile(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one(
        {"id": current_user["sub"], "role": "foreman"},
        {"_id": 0, "hashed_password": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail="Foreman not found")
    return user


@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.get("role"):
        user["role"] = current_user.get("role", "foreman")
    # Pass through impersonation flag so frontend banner survives refresh
    if current_user.get("impersonated_by"):
        user["impersonated"] = True
        user["impersonated_by"] = current_user.get("impersonated_by")
    return user
