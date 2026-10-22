# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import doctest
from unittest import mock

import mozunit
import pytest

from mozrelease import update_verify_config_creator as creator

BASE_ARGS = [
    "--product",
    "firefox",
    "--app-name",
    "browser",
    "--branch-prefix",
    "mozilla",
    "--channel",
    "beta-localtest",
    "--to-version",
    "100.0b5",
    "--to-app-version",
    "100.0",
    "--to-build-number",
    "1",
    "--to-buildid",
    "20220101000000",
    "--to-revision",
    "abcdef",
    "--last-watershed",
    "99.0b1",
    "--platform",
    "linux-x86_64",
    "--archive-prefix",
    "https://archive.example/pub/",
    "--repo-path",
    "releases/mozilla-beta",
    "--output-file",
    "update-verify.cfg",
]


def test_is_triangular_doctests():
    failures, _ = doctest.testmod(creator)
    assert failures == 0


def test_compare_version_pads_to_three_parts():
    assert creator.CompareVersion("99.0").version == "99.0.0"
    assert creator.CompareVersion("99.0esr").version == "99.0.0esr"
    assert creator.CompareVersion("99.0.1").version == "99.0.1.0"


def test_parse_args_defaults():
    args = creator.parse_args(BASE_ARGS)
    assert args.stage_product == "firefox"
    assert args.updater_platform == "linux-x86_64"
    assert args.archive_prefix == "https://archive.example/pub"
    assert args.previous_archive_prefix == "https://archive.example/pub"
    assert args.mar_channel_id_overrides == {}
    args = creator.parse_args(
        BASE_ARGS
        + [
            "--mar-channel-id-override",
            "^\\d+\\.\\d+$,firefox-mozilla-beta,firefox-mozilla-release",
            "--previous-archive-prefix",
            "https://previous.example/pub/",
        ]
    )
    assert args.mar_channel_id_overrides == {
        "^\\d+\\.\\d+$": "firefox-mozilla-beta,firefox-mozilla-release"
    }
    assert args.previous_archive_prefix == "https://previous.example/pub"


@pytest.mark.parametrize(
    "version,branch",
    [
        ("100.0b5", "releases/mozilla-beta"),
        ("100.0", "releases/mozilla-release"),
        ("100.0.1", "releases/mozilla-release"),
        ("115.2.0esr", "releases/mozilla-esr115"),
    ],
)
def test_get_branch_url(version, branch):
    c = creator.UpdateVerifyConfigCreator({})
    assert c._get_branch_url("mozilla", version) == branch


def test_create_config_writes_full_partial_and_quick_checks(tmp_path):
    output = tmp_path / "update-verify.cfg"
    args = creator.parse_args(
        BASE_ARGS + ["--output-file", str(output), "--partial-version", "100.0b4"]
    )
    c = creator.UpdateVerifyConfigCreator(vars(args))
    c.update_paths = {
        "100.0b4": {
            "appVersion": "100.0",
            "locales": ["de", "en-US", "fr"],
            "buildID": "4",
        },
        "100.0b3": {
            "appVersion": "100.0",
            "locales": ["de", "en-US", "fr"],
            "buildID": "3",
        },
        "100.0b2": {
            "appVersion": "100.0",
            "locales": ["de", "en-US", "fr"],
            "buildID": "2",
        },
    }
    with mock.patch.object(
        c, "_get_file_from_repo", return_value="de\nen-US\nfr\nja linux win32\n"
    ):
        c.create_config()
    c.write_config()

    releases = c.update_verify_config.releases
    assert [r["build_id"] for r in releases] == ["4", "3", "3", "2", "2"]
    assert releases[0]["patch_types"] == ["complete", "partial"]
    assert releases[0]["locales"] == ["de", "en-US", "fr"]
    assert releases[1]["locales"] == ["de", "en-US"]
    assert releases[1]["from"] is not None
    assert releases[2]["locales"] == ["fr"]
    assert releases[2]["from"] is None
    assert releases[3]["locales"] == ["de", "en-US"]
    assert releases[4]["locales"] == ["fr"]
    text = output.read_text(encoding="utf-8")
    assert 'channel="beta-localtest"' in text
    assert 'to_build_id="20220101000000"' in text


if __name__ == "__main__":
    mozunit.main()
