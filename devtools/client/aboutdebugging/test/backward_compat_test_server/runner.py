# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Local entry point for the DevTools backward compatibility tests.

Provisions a "server" Firefox, then runs the client-side mochitest suite through
mach with DEVTOOLS_COMPAT_CONFIG pointing at the provisioned server. In CI the
same provisioning is driven by testing/mozharness/scripts/devtools_compat.py.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile

import mozpack.path as mozpath

from .logs import log
from .session import provisioned_server

TEST_PATH = "devtools/client/aboutdebugging/test/browser/browser_backward_compat"


def run(
    topsrcdir: str,
    binary: str,
    cache_dir: str,
    server: str = "local",
    headless: bool = True,
    extra_args: list[str] | None = None,
) -> int:
    log_dir = tempfile.mkdtemp(prefix="devtools-compat-")
    log(f"Logs and configuration in {log_dir}")

    with provisioned_server(
        binary=binary,
        cache_dir=cache_dir,
        log_dir=log_dir,
        server=server,
        headless=headless,
    ) as compat_server_env:
        env = os.environ.copy()
        env.update(compat_server_env)

        extra_args = extra_args or []
        # mach is a python script without an executable bit on Windows, so it
        # has to be handed to an interpreter rather than executed directly.
        command = [sys.executable, mozpath.join(topsrcdir, "mach"), "mochitest"]
        if headless:
            command.append("--headless")
        command.extend(extra_args)
        # Run the whole suite unless the caller specified which tests to run.
        if not any(not arg.startswith("-") for arg in extra_args):
            command.append(TEST_PATH)

        log(f"Running: {' '.join(command)}")
        return subprocess.run(command, cwd=topsrcdir, env=env, check=False).returncode
