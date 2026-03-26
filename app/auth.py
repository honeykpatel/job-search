from __future__ import annotations

from functools import lru_cache
import os
import time
from typing import Any

import jwt
import requests
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer_scheme = HTTPBearer(auto_error=False)
_JWKS_CACHE_TTL_SECONDS = 3600
_jwks_cache: dict[str, Any] = {"value": None, "expires_at": 0.0}


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


def _jwks_url() -> str:
    return f"{get_supabase_url()}/auth/v1/.well-known/jwks.json"


def _issuer() -> str:
    return f"{get_supabase_url()}/auth/v1"


def _audience_candidates() -> list[str]:
    return ["authenticated"]


def _load_jwks() -> dict[str, Any]:
    now = time.time()
    if _jwks_cache["value"] and now < float(_jwks_cache["expires_at"]):
        return _jwks_cache["value"]

    response = requests.get(_jwks_url(), timeout=10)
    response.raise_for_status()
    data = response.json()
    _jwks_cache["value"] = data
    _jwks_cache["expires_at"] = now + _JWKS_CACHE_TTL_SECONDS
    return data


@lru_cache(maxsize=32)
def _public_key_for_kid(kid: str) -> Any:
    keys = _load_jwks().get("keys", [])
    for jwk in keys:
        if jwk.get("kid") == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(jwk)
    raise HTTPException(status_code=401, detail="Unknown signing key")


def verify_access_token(token: str) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token header") from exc

    kid = header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Missing token key id")

    key = _public_key_for_kid(str(kid))
    last_error: Exception | None = None
    for audience in _audience_candidates():
        try:
            return jwt.decode(
                token,
                key=key,
                algorithms=["RS256"],
                audience=audience,
                issuer=_issuer(),
            )
        except jwt.PyJWTError as exc:
            last_error = exc
    raise HTTPException(status_code=401, detail="Invalid or expired access token") from last_error


def require_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required")

    payload = verify_access_token(credentials.credentials)
    user_id = str(payload.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user token")
    return user_id


def auth_config() -> dict[str, str]:
    return {
        "supabase_url": get_supabase_url(),
        "supabase_anon_key": get_supabase_anon_key(),
    }
