# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os
import sys
import time
from pathlib import Path

# Where a directory of a given name has to sit to actually be excluded. The
# drive root half of USER_HOME_OR_DRIVE_ROOT only applies on Windows.
ANY_DIRECTORY = "any-directory"
USER_HOME_OR_DRIVE_ROOT = "user-home-or-drive-root"

WARNING_DELAY_SECONDS = 20


def _excluded_dirs(platform):
    if platform == "win32":
        return (
            ("src", USER_HOME_OR_DRIVE_ROOT),
            ("mozilla-source", ANY_DIRECTORY),
        )

    if platform == "darwin":
        return (
            ("src", USER_HOME_OR_DRIVE_ROOT),
            ("mozilla-source", ANY_DIRECTORY),
            ("firefox", USER_HOME_OR_DRIVE_ROOT),
        )

    return (
        ("src", USER_HOME_OR_DRIVE_ROOT),
        ("mozilla-source", ANY_DIRECTORY),
        ("firefox", ANY_DIRECTORY),
    )


def _suggested_dirs_for(path):
    roots = [Path.home().resolve()]
    if sys.platform == "win32":
        roots.append(Path(path.anchor))

    return [root / name for root in roots for name, _ in _excluded_dirs(sys.platform)]


def _is_in_excluded_dir(path):
    home = Path.home().resolve()
    scopes = {
        os.path.normcase(name): scope for name, scope in _excluded_dirs(sys.platform)
    }

    for ancestor in (path, *path.parents):
        scope = scopes.get(os.path.normcase(ancestor.name))
        if scope == ANY_DIRECTORY:
            return True
        if scope == USER_HOME_OR_DRIVE_ROOT and (
            ancestor.parent == home
            or (sys.platform == "win32" and ancestor.parent == Path(ancestor.anchor))
        ):
            return True

    return False


def check_path_performance(topsrcdir, settings):
    if getattr(check_path_performance, "already_checked", False):
        return
    check_path_performance.already_checked = True

    if os.environ.get("MOZ_SKIP_PATH_PERFORMANCE_CHECK") or os.environ.get(
        "MOZ_AUTOMATION"
    ):
        return

    if os.environ.get("MACH_MAIN_PID") != str(os.getpid()):
        return

    if not settings.mach_telemetry.is_employee:
        return

    from mozbuild.telemetry import get_crowdstrike_running

    if not get_crowdstrike_running():
        return

    topsrcdir = Path(topsrcdir).resolve()
    if _is_in_excluded_dir(topsrcdir):
        return

    mach_logger = logging.getLogger("mach")

    def log(msg, **params):
        mach_logger.log(
            logging.WARNING,
            msg,
            extra={"action": "path_performance", "params": params},
        )

    log(
        "A security tool is running and is known to cause performance "
        "regressions in Mach unless mitigated. "
        "To fix this, take the following action:"
    )
    valid_paths = "\n               ".join(
        str(excluded) for excluded in _suggested_dirs_for(topsrcdir)
    )
    log(
        "  Move your checkout ({path}) under one of:\n               {valid_paths}",
        path=topsrcdir,
        valid_paths=valid_paths,
    )
    log(
        "This check pauses for {delay} seconds. "
        "Set MOZ_SKIP_PATH_PERFORMANCE_CHECK=1 to bypass it.",
        delay=WARNING_DELAY_SECONDS,
    )

    time.sleep(WARNING_DELAY_SECONDS)
