# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""Installs dependencies at runtime to simplify deployment.

This module tries to make sure we have all dependencies installed on
all our environments.
"""

import os
import subprocess
import sys

TOPDIR = os.path.join(os.path.dirname(__file__), "..")


def install_reqs():
    """Install local packages and their dependencies in one resolver run."""
    try:
        import arsenic  # NOQA

        return False
    except Exception:
        # we're detecting here that this is running in Taskcluster
        # by checking for the presence of the mozfile directory
        # that was decompressed from target.condprof.tests.tar.zst
        run_in_ci = os.path.exists(os.path.join(TOPDIR, "mozfile"))

        if not run_in_ci:
            req_files = ["base.txt", "local.txt"]
        else:
            req_files = ["base.txt", "ci.txt"]

        command = [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--no-cache-dir",
            "--isolated",
        ]
        for req_file in req_files:
            command.extend(["-r", os.path.join(TOPDIR, "requirements", req_file)])
        subprocess.check_call(command, cwd=TOPDIR)

        return True


def check():
    """Called by the runner.

    The check function will restart the app after
    all deps have been installed.
    """
    if install_reqs():
        os.execl(sys.executable, sys.executable, *sys.argv)
        os._exit(0)
