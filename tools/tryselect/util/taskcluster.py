# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import functools
import hashlib
import json
import os
import secrets
import time
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs, urlencode, urlparse

from mach.util import get_state_dir
from taskcluster.exceptions import TaskclusterAuthFailure, TaskclusterRestFailure

import taskcluster

TC_CREDENTIALS_EXPIRY_DAYS = 365
TC_ROOT_URL = "https://firefox-ci-tc.services.mozilla.com"
BROWSER_AUTH_TIMEOUT_S = 120


@functools.lru_cache(maxsize=None)
def _get_credentials_file() -> Path:
    return (
        Path(get_state_dir(specific_to_topsrcdir=False))
        / "cache"
        / "taskcluster"
        / "credentials.json"
    )


def _scopes_key(scopes: list[str]) -> str:
    return hashlib.sha256(json.dumps(sorted(scopes)).encode()).hexdigest()[:16]


def _load_cached_credentials(scopes: list[str]) -> Optional[dict]:
    creds_file = _get_credentials_file()
    try:
        cache = json.loads(creds_file.read_text())
        cache_key = _scopes_key(scopes)
        if entry := cache.get(cache_key):
            creds = {"clientId": entry["clientId"], "accessToken": entry["accessToken"]}
            try:
                auth = taskcluster.Auth({"rootUrl": TC_ROOT_URL})
                client_info = auth.client(creds["clientId"])
                expires_ts = datetime.fromisoformat(
                    client_info["expires"].replace("Z", "+00:00")
                ).timestamp()
                if not client_info["disabled"] and expires_ts >= time.time() + 300:
                    return creds
            except (TaskclusterAuthFailure, TaskclusterRestFailure):
                pass

            # cached credentials are invalid
            del cache[cache_key]
            creds_file.write_text(json.dumps(cache))

    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        pass
    return None


def _save_credentials(clientId: str, accessToken: str, scopes: list[str]) -> None:
    creds_file = _get_credentials_file()
    creds_file.parent.mkdir(parents=True, exist_ok=True)
    try:
        cache = json.loads(creds_file.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        cache = {}
    cache[_scopes_key(scopes)] = {
        "clientId": clientId,
        "accessToken": accessToken,
    }
    creds_file.write_text(json.dumps(cache))
    creds_file.chmod(0o600)


def _browser_auth(scopes: list[str]) -> dict:
    """Open the TC client-creation UI and wait for the callback."""
    credentials = {}

    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            qs = parse_qs(urlparse(self.path).query)
            credentials["clientId"] = qs.get("clientId", [""])[0]
            credentials["accessToken"] = qs.get("accessToken", [""])[0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                b"<html><body><h1>Signed in to Taskcluster</h1>"
                b"<p>You may close this window.</p></body></html>"
            )

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), _Handler)
    server.timeout = 5
    port = server.server_address[1]
    callback_url = f"http://localhost:{port}"

    params = urlencode(
        {
            "scope": scopes,
            "name": f"mach-try-{secrets.token_hex(4)}",
            "expires": f"{TC_CREDENTIALS_EXPIRY_DAYS} days",
            "callback_url": callback_url,
            "description": "Temporary client for mach try",
        },
        doseq=True,
    )
    login_url = f"{TC_ROOT_URL}/auth/clients/create?{params}"

    print(f"Opening browser for Taskcluster sign-in: {login_url}")
    webbrowser.open(login_url)

    deadline = time.time() + BROWSER_AUTH_TIMEOUT_S
    try:
        while time.time() < deadline:
            server.handle_request()
            if credentials.get("clientId") and credentials.get("accessToken"):
                break
        else:
            raise RuntimeError(
                "Timed out waiting for Taskcluster sign-in. Please try again."
            )
    finally:
        server.server_close()

    _save_credentials(credentials["clientId"], credentials["accessToken"], scopes)
    return credentials


def get_client(service: str, scopes: list[str]):
    """Return an authenticated Taskcluster service client.

    Checks for cached credentials first and falls back to browser-redirect auth.
    If called from automation, reads options from the environment.
    """
    if os.environ.get("MOZ_AUTOMATION") == "1":
        options = taskcluster.optionsFromEnvironment()
    else:
        creds = _load_cached_credentials(scopes) or _browser_auth(scopes)
        options = {"rootUrl": TC_ROOT_URL, "credentials": creds}
    return getattr(taskcluster, service.capitalize())(options)
