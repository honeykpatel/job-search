from __future__ import annotations

import os
from typing import Any

import requests
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer_scheme = HTTPBearer(auto_error=False)


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
