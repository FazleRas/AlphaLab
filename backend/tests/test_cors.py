"""CORS allowlist tests.

The app used to serve `Access-Control-Allow-Origin: *`. These pin the
replacement: the production Vercel origin and localhost are allowed, Vercel
preview deployments of this project match by regex, anything else gets no
CORS header at all - including on the JSON 500 path, which answers outside
CORSMiddleware and has to add the header by hand.
"""

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client():
    # raise_server_exceptions=False lets the unhandled-exception handler
    # answer instead of the test seeing the exception directly.
    return TestClient(main.app, raise_server_exceptions=False)


def _preflight(client, origin):
    return client.options(
        "/",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )


@pytest.mark.parametrize(
    "origin",
    [
        "https://alphalab-lime.vercel.app",
        "http://localhost:3000",
        "https://alphalab-git-feat-async-sweeps-fazleras.vercel.app",
        "https://alphalab-abc123def-fazleras.vercel.app",
    ],
)
def test_allowed_origins_get_cors_headers(client, origin):
    res = _preflight(client, origin)
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == origin

    res = client.get("/", headers={"Origin": origin})
    assert res.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.example",
        "https://alphalab.vercel.app.evil.example",
        "http://alphalab-lime.vercel.app",  # scheme matters
        "https://notalphalab-lime.vercel.app",
    ],
)
def test_other_origins_get_no_cors_headers(client, origin):
    res = _preflight(client, origin)
    assert "access-control-allow-origin" not in res.headers

    res = client.get("/", headers={"Origin": origin})
    assert "access-control-allow-origin" not in res.headers


def test_wildcard_is_gone(client):
    res = client.get("/", headers={"Origin": "https://alphalab-lime.vercel.app"})
    assert res.headers["access-control-allow-origin"] != "*"


@pytest.fixture
def exploding_client(client):
    @main.app.get("/_test/explode")
    def explode():
        raise RuntimeError("kaboom")

    yield client
    main.app.router.routes[:] = [
        r for r in main.app.router.routes if getattr(r, "path", None) != "/_test/explode"
    ]


def test_json_500_echoes_only_allowed_origins(exploding_client):
    allowed = "https://alphalab-lime.vercel.app"
    res = exploding_client.get("/_test/explode", headers={"Origin": allowed})
    assert res.status_code == 500
    assert res.json()["detail"] == "internal error: RuntimeError"
    assert res.headers["access-control-allow-origin"] == allowed
    assert "origin" in res.headers.get("vary", "").lower()

    res = exploding_client.get("/_test/explode", headers={"Origin": "https://evil.example"})
    assert res.status_code == 500
    assert "access-control-allow-origin" not in res.headers
