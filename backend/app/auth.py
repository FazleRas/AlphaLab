"""Supabase JWT verification for protected routes.

The frontend authenticates with Supabase Auth (supabase-js) and sends the
resulting access token as `Authorization: Bearer <jwt>`. Supabase signs these
with the project's JWT secret (HS256), found in the dashboard under
Project Settings -> API -> JWT Settings. Set it as SUPABASE_JWT_SECRET.

Because the backend reaches Postgres through the pooler as the `postgres` role,
RLS is bypassed — so every route must scope its queries by the user id this
dependency returns.
"""
import os

import jwt
from fastapi import Header, HTTPException


def get_current_user_id(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    secret = os.environ.get("SUPABASE_JWT_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail="Auth not configured")

    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject")
    return user_id
