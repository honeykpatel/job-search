from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any

import requests
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer_scheme = HTTPBearer(auto_error=False)
ADMIN_TOKEN_TTL_SECONDS = 60 * 60 * 8


def get_supabase_url() -> str:
    value = (os.getenv("SUPABASE_URL") or "").strip()
    if not value:
        raise HTTPException(status_code=500, detail="SUPABASE_URL is not configured")
    return value.rstrip("/")


def get_supabase_anon_key() -> str:
    value = (os.getenv("SUPABASE_ANON_KEY") or "").strip()
    if not value:
        raise HTTPException(status_code=500, detail="SUPABASE_ANON_KEY is not configured")
    return value


def _user_info_url() -> str:
    return f"{get_supabase_url()}/auth/v1/user"


def verify_access_token(token: str) -> dict[str, Any]:
    try:
        response = requests.get(
            _user_info_url(),
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": get_supabase_anon_key(),
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Failed to verify access token with Supabase") from exc

    if response.status_code in {401, 403}:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")
    if not response.ok:
        raise HTTPException(status_code=502, detail="Supabase token verification failed")

    data = response.json()
    if not isinstance(data, dict) or not str(data.get("id") or "").strip():
        raise HTTPException(status_code=401, detail="Invalid user token")
    return data


def require_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required")

    payload = verify_access_token(credentials.credentials)
    user_id = str(payload.get("id") or payload.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user token")
    return user_id


def auth_config() -> dict[str, str]:
    return {
        "supabase_url": get_supabase_url(),
        "supabase_anon_key": get_supabase_anon_key(),
    }


def get_admin_username() -> str:
    value = (os.getenv("ADMIN_USERNAME") or "").strip()
    if not value:
        raise HTTPException(status_code=500, detail="ADMIN_USERNAME is not configured")
    return value


def get_admin_password() -> str:
    value = os.getenv("ADMIN_PASSWORD") or ""
    if not value:
        raise HTTPException(status_code=500, detail="ADMIN_PASSWORD is not configured")
    return value


def get_admin_token_secret() -> str:
    value = (os.getenv("ADMIN_TOKEN_SECRET") or "").strip()
    if value:
        return value
    return hashlib.sha256(f"{get_admin_username()}::{get_admin_password()}".encode("utf-8")).hexdigest()


def _sign_admin_token(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    encoded = base64.urlsafe_b64encode(body).decode("ascii").rstrip("=")
    signature = hmac.new(
        get_admin_token_secret().encode("utf-8"),
        encoded.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{encoded}.{signature}"


def _decode_admin_token(token: str) -> dict[str, Any]:
    try:
        encoded, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid admin token") from exc

    expected_signature = hmac.new(
        get_admin_token_secret().encode("utf-8"),
        encoded.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid admin token")

    padded = encoded + "=" * (-len(encoded) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid admin token") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Invalid admin token")
    expires_at = int(payload.get("exp") or 0)
    if expires_at <= int(time.time()):
        raise HTTPException(status_code=401, detail="Admin session expired")
    return payload


def create_admin_token(username: str) -> dict[str, Any]:
    now = int(time.time())
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + ADMIN_TOKEN_TTL_SECONDS,
    }
    return {
        "token": _sign_admin_token(payload),
        "username": username,
        "expires_at": payload["exp"],
    }


def verify_admin_login(username: str, password: str) -> dict[str, Any]:
    expected_username = get_admin_username()
    expected_password = get_admin_password()
    if not (
        secrets.compare_digest(username.strip(), expected_username)
        and secrets.compare_digest(password, expected_password)
    ):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    return create_admin_token(expected_username)


def require_admin(x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    if not x_admin_token:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    return _decode_admin_token(x_admin_token)
