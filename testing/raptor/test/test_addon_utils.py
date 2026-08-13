import os
import sys
from unittest import mock

import mozunit
import pytest

# need this so the raptor unit tests can find raptor/raptor classes
here = os.path.abspath(os.path.dirname(__file__))
raptor_dir = os.path.join(os.path.dirname(here), "raptor")
sys.path.insert(0, raptor_dir)

from addon_utils import (
    AddonResolutionError,
    is_local_path,
    is_url,
    resolve_amo_addon,
)


@pytest.mark.parametrize(
    "payload, expected",
    [
        # AMO API v5 shape: a single `file` object
        (
            {"current_version": {"file": {"url": "https://amo/v5.xpi"}}},
            "https://amo/v5.xpi",
        ),
        # Legacy shape: a `files` list
        (
            {"current_version": {"files": [{"url": "https://amo/legacy.xpi"}]}},
            "https://amo/legacy.xpi",
        ),
    ],
)
def test_resolve_amo_addon(payload, expected):
    resp = mock.MagicMock()
    resp.json.return_value = payload
    with mock.patch("requests.get", return_value=resp):
        assert resolve_amo_addon("uBlock0@raymondhill.net") == expected


def test_resolve_amo_addon_missing_file():
    resp = mock.MagicMock()
    resp.json.return_value = {"current_version": {}}
    with mock.patch("requests.get", return_value=resp):
        with pytest.raises(AddonResolutionError):
            resolve_amo_addon("does-not-exist")


def test_resolve_amo_addon_request_failure():
    with mock.patch("requests.get", side_effect=Exception("boom")):
        with pytest.raises(AddonResolutionError):
            resolve_amo_addon("does-not-exist")


def test_is_url():
    assert is_url("https://example.com/a.xpi")
    assert is_url("http://example.com/a.xpi")
    assert not is_url("uBlock0@raymondhill.net")


def test_is_local_path(tmp_path):
    assert not is_local_path("uBlock0@raymondhill.net")
    assert not is_local_path("https://example.com/a.xpi")
    assert not is_local_path(str(tmp_path / "missing.xpi"))

    existing = tmp_path / "real.xpi"
    existing.write_text("")
    assert is_local_path(str(existing))


if __name__ == "__main__":
    mozunit.main()
