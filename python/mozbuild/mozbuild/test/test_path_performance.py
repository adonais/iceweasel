# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os
import sys
from pathlib import PurePosixPath, PureWindowsPath
from types import SimpleNamespace

import pytest
from mozunit import main

from mozbuild import path_performance


def _fake_path_class(base, home):
    class FakePath(base):
        @classmethod
        def home(cls):
            return cls(home)

        def resolve(self):
            return self

    return FakePath


WINDOWS = _fake_path_class(PureWindowsPath, "C:\\Users\\kit")
MACOS = _fake_path_class(PurePosixPath, "/Users/kit")
LINUX = _fake_path_class(PurePosixPath, "/home/kit")

PLATFORMS = {
    "win32": (
        WINDOWS,
        [
            "D:\\mozilla-source\\firefox",
            "C:\\work\\mozilla-source\\gecko",
            "C:\\Users\\kit\\src\\firefox",
            "D:\\src",
        ],
        [
            "D:\\work\\firefox",
            "D:\\work\\src\\firefox",
            "C:\\Users\\kit\\firefox",
            "D:\\srcx\\firefox",
        ],
    ),
    "darwin": (
        MACOS,
        ["/Users/kit/firefox", "/Users/kit/src/firefox", "/mozilla-source/firefox"],
        ["/Users/kit/work/firefox", "/opt/firefox", "/opt/gecko"],
    ),
    "linux": (
        LINUX,
        [
            "/home/kit/firefox",
            "/home/kit/work/firefox",
            "/firefox",
            "/mozilla-source/gecko",
            "/home/kit/src/gecko",
        ],
        ["/home/kit/work/gecko", "/opt/gecko"],
    ),
}


def _cases():
    for platform, (path_class, excluded, not_excluded) in PLATFORMS.items():
        for topsrcdir in excluded:
            yield pytest.param(
                platform, path_class, topsrcdir, False, id=f"{platform}:{topsrcdir}"
            )
        for topsrcdir in not_excluded:
            yield pytest.param(
                platform, path_class, topsrcdir, True, id=f"{platform}:{topsrcdir}"
            )


@pytest.fixture
def check(monkeypatch):
    def run(platform, path_class, topsrcdir):
        monkeypatch.setattr(sys, "platform", platform)
        monkeypatch.setattr(path_performance, "Path", path_class)
        monkeypatch.setattr(
            path_performance, "time", SimpleNamespace(sleep=lambda _: None)
        )
        monkeypatch.setattr(
            path_performance.check_path_performance,
            "already_checked",
            False,
            raising=False,
        )
        monkeypatch.setattr("mozbuild.telemetry.get_crowdstrike_running", lambda: True)
        monkeypatch.setenv("MACH_MAIN_PID", str(os.getpid()))
        monkeypatch.delenv("MOZ_SKIP_PATH_PERFORMANCE_CHECK", raising=False)
        monkeypatch.delenv("MOZ_AUTOMATION", raising=False)

        settings = SimpleNamespace(mach_telemetry=SimpleNamespace(is_employee=True))
        path_performance.check_path_performance(topsrcdir, settings)

    return run


@pytest.mark.parametrize("platform,path_class,topsrcdir,warns", list(_cases()))
def test_warns_only_outside_excluded_dirs(
    check, caplog, platform, path_class, topsrcdir, warns
):
    with caplog.at_level(logging.WARNING, logger="mach"):
        check(platform, path_class, topsrcdir)

    warned = any("Move your checkout" in record.msg for record in caplog.records)
    assert warned is warns


if __name__ == "__main__":
    main()
