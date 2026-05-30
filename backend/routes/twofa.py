"""Two-Factor Authentication (TOTP) - dla admina.

iter95bs: Pakiet E. Endpointy:
- POST /api/auth/2fa/setup           - generuje secret + QR (zwraca data URI)
- POST /api/auth/2fa/verify-setup    - weryfikuje pierwszy kod i wlacza 2FA
- POST /api/auth/2fa/verify          - weryfikuje kod podczas logowania
- POST /api/auth/2fa/disable         - wylacza 2FA (wymaga aktualnego kodu)

Status:
- pyotp + qrcode biblioteki zainstalowane
- DB: pole `totp_secret` + `totp_enabled` w userze (kolekcja `users`)
- Pierwsza wersja: opt-in (admin moze sam wlaczyc); nie wymaga 2FA przy logowaniu (dopuki nie zostanie wlaczony)
"""
import base64
import io
import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException, Body
from datetime import datetime, timezone

from database import db
from auth import get_current_admin

router = APIRouter()


def _generate_qr_data_uri(uri: str) -> str:
    """Generuje QR code jako data URI (PNG base64)."""
    qr = qrcode.QRCode(version=1, box_size=4, border=2)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


@router.post("/auth/2fa/setup")
async def setup_2fa(current_user: dict = Depends(get_current_admin)):
    """Generuje nowy secret TOTP i QR code. Secret zapisuje w DB jako 'pending' do
    czasu weryfikacji pierwszym kodem przez `/2fa/verify-setup`.
    """
    user_id = current_user["sub"]
    existing = await db.users.find_one({"id": user_id}, {"_id": 0, "totp_enabled": 1})
    if existing and existing.get("totp_enabled"):
        raise HTTPException(400, "2FA jest juz wlaczone. Najpierw wylacz, by wygenerowac nowy secret.")
    # Generuj secret
    secret = pyotp.random_base32()
    email = current_user.get("email") or "admin"
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name="FeGrro ERP")
    # Zapisz jako pending
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"totp_secret_pending": secret, "totp_enabled": False}},
        upsert=True,
    )
    qr_uri = _generate_qr_data_uri(uri)
    return {
        "secret": secret,  # pokaz uzytkownikowi w razie gdyby nie mogl zeskanowac
        "qr_code_data_uri": qr_uri,
        "uri": uri,
        "message": "Zeskanuj QR w Google Authenticator / Authy. Nastepnie wpisz kod 6-cyfrowy w /verify-setup.",
    }


@router.post("/auth/2fa/verify-setup")
async def verify_setup_2fa(payload: dict = Body(...), current_user: dict = Depends(get_current_admin)):
    """Weryfikuje pierwszy kod (po zeskanowaniu QR) i aktywuje 2FA. Body: {code: "123456"}."""
    code = str(payload.get("code") or "").strip()
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(400, "Kod musi byc 6 cyfr")
    user_id = current_user["sub"]
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    pending_secret = (user or {}).get("totp_secret_pending")
    if not pending_secret:
        raise HTTPException(400, "Najpierw wywolaj /auth/2fa/setup")
    totp = pyotp.TOTP(pending_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(400, "Nieprawidlowy kod. Sprobuj ponownie.")
    # Aktywuj
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "totp_secret": pending_secret,
            "totp_enabled": True,
            "totp_activated_at": datetime.now(timezone.utc),
        }, "$unset": {"totp_secret_pending": ""}},
    )
    return {"ok": True, "message": "2FA aktywowane. Od nastepnego logowania bedziesz proszony o kod."}


@router.post("/auth/2fa/verify")
async def verify_2fa(payload: dict = Body(...), current_user: dict = Depends(get_current_admin)):
    """Weryfikuje kod TOTP (uzywane np. przed wrazliwymi operacjami)."""
    code = str(payload.get("code") or "").strip()
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(400, "Kod musi byc 6 cyfr")
    user_id = current_user["sub"]
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "totp_secret": 1, "totp_enabled": 1})
    if not user or not user.get("totp_enabled"):
        raise HTTPException(400, "2FA nie jest wlaczone")
    if not pyotp.TOTP(user["totp_secret"]).verify(code, valid_window=1):
        raise HTTPException(401, "Nieprawidlowy kod")
    return {"ok": True}


@router.post("/auth/2fa/disable")
async def disable_2fa(payload: dict = Body(...), current_user: dict = Depends(get_current_admin)):
    """Wylacza 2FA. Wymaga aktualnego kodu jako potwierdzenia."""
    code = str(payload.get("code") or "").strip()
    user_id = current_user["sub"]
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "totp_secret": 1, "totp_enabled": 1})
    if not user or not user.get("totp_enabled"):
        raise HTTPException(400, "2FA nie jest wlaczone")
    if not pyotp.TOTP(user["totp_secret"]).verify(code, valid_window=1):
        raise HTTPException(401, "Nieprawidlowy kod")
    await db.users.update_one(
        {"id": user_id},
        {"$unset": {"totp_secret": "", "totp_enabled": "", "totp_activated_at": "", "totp_secret_pending": ""}},
    )
    return {"ok": True, "message": "2FA wylaczone"}


@router.get("/auth/2fa/status")
async def status_2fa(current_user: dict = Depends(get_current_admin)):
    """Status 2FA dla aktualnego uzytkownika."""
    user_id = current_user["sub"]
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "totp_enabled": 1, "totp_activated_at": 1})
    return {
        "enabled": bool((user or {}).get("totp_enabled")),
        "activated_at": (user or {}).get("totp_activated_at"),
    }
