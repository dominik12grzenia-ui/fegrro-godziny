from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta
import uuid

from database import db
from models import UserCreate, UserLogin, Token
from auth import get_password_hash, verify_password, create_access_token, get_current_user, get_current_admin

router = APIRouter()


@router.post("/auth/admin/login", response_model=Token)
async def admin_login(credentials: UserLogin):
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


@router.post("/auth/worker/register", response_model=dict)
async def worker_register(user_data: UserCreate):
    existing = await db.users.find_one({"full_name": user_data.full_name, "role": "foreman"})
    if existing:
        token = create_access_token(data={
            "sub": existing["id"],
            "role": "foreman"
        }, expires_delta=timedelta(days=365))
        return {
            "access_token": token,
            "user_id": existing["id"],
            "full_name": existing["full_name"],
            "role": "foreman",
            "assigned_sites": existing.get("assigned_sites", []),
            "message": "Witaj ponownie!"
        }
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "full_name": user_data.full_name,
        "role": "foreman",
        "email": None,
        "hashed_password": None,
        "assigned_sites": [],
        "status": "pending",
        "created_at": datetime.now().isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_access_token(data={
        "sub": user_id,
        "role": "foreman"
    }, expires_delta=timedelta(days=365))
    
    return {
        "access_token": token,
        "user_id": user_id,
        "full_name": user_data.full_name,
        "role": "foreman",
        "assigned_sites": [],
        "message": "Rejestracja udana! Poczekaj az administrator przypisze Ci budowy."
    }


@router.get("/foremen")
async def get_foremen(current_user: dict = Depends(get_current_user)):
    foremen = await db.users.find(
        {"role": "foreman"},
        {"_id": 0, "id": 1, "full_name": 1, "assigned_sites": 1, "status": 1, "created_at": 1}
    ).to_list(1000)
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
    return user
