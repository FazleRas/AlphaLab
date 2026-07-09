"""Supabase JWT verification for protected routes.

The frontend authenticates with Supabase Auth (supabase-js) and sends the
resulting access token as `Authorization: Bearer <jwt>`. We verify it and
return the user id (the token's `sub`).

Supabase signs access tokens one of two ways, and we support both by reading
the token's `alg` header and routing accordingly:

- **Asymmetric (ES256/RS256)** — the current default. The project exposes its
  public keys at a JWKS endpoint; we fetch and cache them and verify against
  the matching key. Configure the base project URL as SUPABASE_URL (e.g.
  https://<ref>.supabase.co) or point SUPABASE_JWKS_URL directly at the JWKS.
- **Legacy HS256** — a shared secret in Project Settings -> API -> JWT Settings.
  Set it as SUPABASE_JWT_SECRET.

Because the backend reaches Postgres through the pooler as the `postgres` role,
RLS is bypassed — so every route must scope its queries by the user id this
dependency returns.
"""
from __future__ import annotations

import os

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

_jwks_client = None


def _jwks_url() -> str | None:
    """JWKS endpoint for the project, from SUPABASE_JWKS_URL or SUPABASE_URL."""
    explicit = os.environ.get("SUPABASE_JWKS_URL")
    if explicit:
        return explicit
    base = os.environ.get("SUPABASE_URL")
    if base:
        return base.rstrip("/") + "/auth/v1/.well-known/jwks.json"
    return None


def _get_jwks_client() -> PyJWKClient | None:
    global _jwks_client
    if _jwks_client is None:
        url = _jwks_url()
        if not url:
            return None
        # PyJWKClient caches fetched keys, so we hit the network at most once
        # per key id rather than on every request.
        _jwks_client = PyJWKClient(url)
    return _jwks_client


def get_current_user_id(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1]

    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        if alg == "HS256":
            secret = os.environ.get("SUPABASE_JWT_SECRET")
            if not secret:
                raise HTTPException(status_code=503, detail="Auth not configured")
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        else:
            client = _get_jwks_client()
            if client is None:
                raise HTTPException(status_code=503, detail="Auth not configured")
            signing_key = client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience="authenticated",
            )
    except HTTPException:
        raise
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject")
    return user_id
