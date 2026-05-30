from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os

import logging

logger = logging.getLogger(__name__)

_FALLBACK_SECRET = "fegrro-fallback-do-not-use-in-prod-set-JWT_SECRET_KEY-env-var-XYZ123"

SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    # Don't crash the deploy - log loud warning and use a fixed fallback so JWTs
    # remain stable across restarts. The user MUST set JWT_SECRET_KEY env var
    # in production for actual security.
    logger.warning(
        "JWT_SECRET_KEY env var is not set or too short (<32 chars). "
        "Falling back to an INSECURE built-in secret. "
        "Set JWT_SECRET_KEY in your environment for proper security."
    )
    SECRET_KEY = _FALLBACK_SECRET
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 365  # 365 days

security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now() + expires_delta
    else:
        expire = datetime.now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    return payload


async def get_current_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )
    return current_user


async def get_current_admin_or_warehouse(current_user: dict = Depends(get_current_user)):
    """Admin OR warehouse keeper. Both can issue equipment, materials, clothing.

    Warehouse keeper is a limited-admin role: cannot create users, sites,
    employees, or change settings - but CAN view/issue all stock items.
    Used on equipment/warehouse/clothing/bhp mutation endpoints.
    """
    if current_user.get("role") not in ("admin", "warehouse"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )
    return current_user



async def get_current_admin_or_accounting(current_user: dict = Depends(get_current_user)):
    """Admin OR accounting (ksiegowy). Ksiegowy ma read-only dostep do finansow
    + moze tworzyc/edytowac wlasne zapisy, ale NIE moze:
    - usuwac (zwlaszcza soft-delete starych miesiecy)
    - zamykac/otwierac okresow
    - modyfikowac kodow ksiegowych
    - administrowac uzytkownikami/budowami/sprzetem

    iter95br: nowa rola "accounting".
    """
    if current_user.get("role") not in ("admin", "accounting"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Brak uprawnien (wymagana rola admin lub accounting)",
        )
    return current_user


async def get_current_finance_reader(current_user: dict = Depends(get_current_user)):
    """Admin OR accounting (read-only dostep do dashboardu/raportow/audit).
    Uzywane przez endpointy ktore tylko czytaja dane finansowe.
    """
    if current_user.get("role") not in ("admin", "accounting"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Brak uprawnien (wymagana rola admin lub accounting)",
        )
    return current_user
