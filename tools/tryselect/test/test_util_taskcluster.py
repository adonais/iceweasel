# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json
import os
import threading
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import mozunit
import pytest
from tryselect.util.taskcluster import (
    TC_CREDENTIALS_EXPIRY_DAYS,
    TC_ROOT_URL,
    _scopes_key,
    get_client,
)

import taskcluster as tc_module

DEFAULT_SCOPES = ["some:scope"]
BROWSER_CLIENT_ID = "browser-client"
BROWSER_ACCESS_TOKEN = "browser-token"
TC_CLIENT_URL = f"{TC_ROOT_URL}/api/auth/v1/clients/cached-client"


def _expires_iso(offset_s):
    dt = datetime.now(tz=timezone.utc) + timedelta(seconds=offset_s)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _register_tc_client(
    rsps,
    disabled=False,
    expires_offset_s=TC_CREDENTIALS_EXPIRY_DAYS * 86400,
    status=200,
):
    if status != 200:
        rsps.add(rsps.GET, TC_CLIENT_URL, status=status, json={})
    else:
        rsps.add(
            rsps.GET,
            TC_CLIENT_URL,
            json={"disabled": disabled, "expires": _expires_iso(expires_offset_s)},
        )


@pytest.fixture
def credentials_file(tmp_path, monkeypatch):
    creds_path = tmp_path / "tc_credentials.json"
    monkeypatch.setattr(
        "tryselect.util.taskcluster._get_credentials_file", lambda: creds_path
    )
    return creds_path


def make_cache(credentials_file, scopes=None):
    scopes = scopes or DEFAULT_SCOPES
    credentials_file.write_text(
        json.dumps({
            _scopes_key(scopes): {
                "clientId": "cached-client",
                "accessToken": "cached-token",
            }
        })
    )


@pytest.fixture
def run_get_client(monkeypatch, responses):
    def fake_webbrowser_open(url):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        callback_url = params["callback_url"][0]
        qs = urllib.parse.urlencode({
            "clientId": BROWSER_CLIENT_ID,
            "accessToken": BROWSER_ACCESS_TOKEN,
        })

        def send_creds():
            try:
                urllib.request.urlopen(f"{callback_url}?{qs}", timeout=10)
            except Exception:
                pass

        threading.Thread(target=send_creds, daemon=True).start()

    def inner(service="queue", scopes=None, env=None):
        scopes = scopes or DEFAULT_SCOPES
        env = env or {}
        monkeypatch.setattr(os, "environ", env)
        monkeypatch.setattr("webbrowser.open", fake_webbrowser_open)
        return get_client(service, scopes)

    return inner


def test_get_client_automation(run_get_client):
    result = run_get_client(
        env={
            "MOZ_AUTOMATION": "1",
            "TASKCLUSTER_CLIENT_ID": "env-client",
            "TASKCLUSTER_ACCESS_TOKEN": "env-token",
            "TASKCLUSTER_ROOT_URL": "https://tc.example.com",
        },
    )
    assert isinstance(result, tc_module.Queue)
    assert result.options["credentials"]["clientId"] == b"env-client"
    assert result.options["credentials"]["accessToken"] == b"env-token"


def test_get_client_cache_hit(credentials_file, run_get_client, responses):
    make_cache(credentials_file)
    _register_tc_client(responses)
    result = run_get_client()
    assert isinstance(result, tc_module.Queue)
    assert result.options["rootUrl"] == TC_ROOT_URL
    assert result.options["credentials"]["clientId"] == b"cached-client"
    assert result.options["credentials"]["accessToken"] == b"cached-token"


def test_get_client_cache_expired(credentials_file, run_get_client, responses):
    make_cache(credentials_file)
    _register_tc_client(responses, expires_offset_s=200)
    result = run_get_client()
    assert isinstance(result, tc_module.Queue)
    assert result.options["rootUrl"] == TC_ROOT_URL
    assert result.options["credentials"]["clientId"] == b"browser-client"
    assert result.options["credentials"]["accessToken"] == b"browser-token"


def test_get_client_browser_auth(credentials_file, run_get_client):
    assert not credentials_file.exists()
    result = run_get_client()
    assert isinstance(result, tc_module.Queue)
    assert result.options["rootUrl"] == TC_ROOT_URL
    assert result.options["credentials"]["clientId"] == b"browser-client"
    assert result.options["credentials"]["accessToken"] == b"browser-token"
    assert credentials_file.is_file()


def test_get_client_deleted_tc_client(credentials_file, run_get_client, responses):
    make_cache(credentials_file)
    _register_tc_client(responses, status=404)
    result = run_get_client()
    assert result.options["credentials"]["clientId"] == b"browser-client"


def test_get_client_auth_failure(credentials_file, run_get_client, responses):
    make_cache(credentials_file)
    _register_tc_client(responses, status=401)
    result = run_get_client()
    assert result.options["credentials"]["clientId"] == b"browser-client"


def test_get_client_disabled(credentials_file, run_get_client, responses):
    make_cache(credentials_file)
    _register_tc_client(responses, disabled=True)
    result = run_get_client()
    assert result.options["credentials"]["clientId"] == b"browser-client"


if __name__ == "__main__":
    mozunit.main()
