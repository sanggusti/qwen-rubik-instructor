"""Thin Google OAuth2 client (authorization-code flow, openid+email scope).

Only the pieces the /auth routes need: build the consent URL, trade the
callback code for an access token, and fetch the userinfo claims.
"""

from __future__ import annotations

from urllib.parse import urlencode

import httpx

from config import settings

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"

TIMEOUT_S = 10.0


def redirect_uri() -> str:
    return f"{settings.backend_url}/auth/callback"


def build_auth_url() -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": "openid email",
        "prompt": "select_account",
    }
    return f"{AUTH_ENDPOINT}?{urlencode(params)}"


def exchange_code(code: str) -> str:
    """Trade the callback authorization code for an access token."""
    resp = httpx.post(
        TOKEN_ENDPOINT,
        data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": redirect_uri(),
            "grant_type": "authorization_code",
        },
        timeout=TIMEOUT_S,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def get_userinfo(access_token: str) -> dict:
    """Returns Google's userinfo claims; `sub` and `email` are what we use."""
    resp = httpx.get(
        USERINFO_ENDPOINT,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=TIMEOUT_S,
    )
    resp.raise_for_status()
    return resp.json()
