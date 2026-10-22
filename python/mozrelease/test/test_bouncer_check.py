# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from pathlib import Path
from unittest import mock

import mozunit
import pytest
import yaml

from mozrelease.bouncer_check import check_url, get_urls, parse_args

BOUNCER_DIR = Path(__file__).parent.parent / "mozrelease" / "bouncer"


@pytest.mark.parametrize("name", ["nightly", "beta", "release", "esr", "devedition"])
def test_config_files_load(name):
    with (BOUNCER_DIR / f"firefox_{name}.yml").open(encoding="utf-8") as fh:
        config = yaml.safe_load(fh)
    assert config["products"]
    for product in config["products"].values():
        assert product["product-name"]
        assert product["platforms"]


def test_get_urls():
    config = {
        "products": {
            "installer": {
                "product-name": "Firefox-%(version)s",
                "platforms": ["win", "osx"],
            },
        },
        "partials": {
            "releases-dir": {
                "product-name": "Firefox-%(version)s-Partial-%(prev_version)s",
                "platforms": ["win"],
            },
        },
    }
    urls = list(
        get_urls(config, "https://b.example/", "100.0", ["en-US", "de"], ["99.0"])
    )
    assert urls == [
        "https://b.example/?product=Firefox-100.0&os=win&lang=en-US",
        "https://b.example/?product=Firefox-100.0&os=win&lang=de",
        "https://b.example/?product=Firefox-100.0&os=osx&lang=en-US",
        "https://b.example/?product=Firefox-100.0&os=osx&lang=de",
        "https://b.example/?product=Firefox-100.0-Partial-99.0&os=win&lang=en-US",
        "https://b.example/?product=Firefox-100.0-Partial-99.0&os=win&lang=de",
    ]


def test_parse_args_defaults():
    args = parse_args(["--config", "c.yml", "--bouncer-prefix", "https://b/"])
    assert args.locales == ["en-US", "de", "it", "zh-TW"]
    assert "download.mozilla.org" in args.cdn_urls
    args = parse_args([
        "--config",
        "c.yml",
        "--bouncer-prefix",
        "https://b/",
        "--locale",
        "he",
        "--cdn-url",
        "ftp.stage.mozaws.net",
    ])
    assert args.locales == ["he"]
    assert args.cdn_urls == ["ftp.stage.mozaws.net"]


def _session(final_url):
    response = mock.Mock()
    response.url = final_url
    response.status_code = 200
    session = mock.Mock()
    session.head.return_value = response
    return session


def test_check_url():
    cdn_urls = ["download.mozilla.org"]
    session = _session("https://download.mozilla.org/x")
    assert check_url(session, "https://b/", cdn_urls)
    session = _session("http://download.mozilla.org/x")
    assert not check_url(session, "https://b/", cdn_urls)
    session = _session("https://elsewhere.example/x")
    assert not check_url(session, "https://b/", cdn_urls)


if __name__ == "__main__":
    mozunit.main()
