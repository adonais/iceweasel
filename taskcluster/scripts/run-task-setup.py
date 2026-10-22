# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Gecko specific setup, executed in-process by Taskgraph's `run-task` via the
`RUN_TASK_PRE_COMMAND_HOOK` environment variable, after fetches are downloaded
and before the task command runs.
"""

import os
import subprocess
import sys


def prepend_to_path(directory):
    paths = [directory]
    if "PATH" in os.environ:
        paths.append(os.environ["PATH"])
    os.environ["PATH"] = os.pathsep.join(paths)
    return os.environ["PATH"]


def setup_python():
    moz_python_home = os.environ["MOZ_PYTHON_HOME"]
    print("Setting up local python environment")

    if sys.platform == "win32":
        ext = ".exe"
        bindir = moz_python_home
    else:
        ext = ""
        bindir = f"{moz_python_home}/bin"

    new_path = prepend_to_path(bindir)

    # The standard way to relocate Python is PYTHONHOME, but that conflicts
    # with the system Python (e.g. used by hg), so we maintain a small patch
    # that uses MOZPYTHONHOME instead.
    os.environ["MOZPYTHONHOME"] = moz_python_home

    interpreter = os.path.join(bindir, f"python3{ext}")
    if not os.path.exists(interpreter):
        raise RuntimeError(
            "Inconsistent Python installation: archive found, but no python3 "
            "binary detected"
        )

    if sys.platform == "darwin":
        # The system certificates may not be accessible on OSX, use certifi's.
        cert_file = subprocess.check_output(
            [interpreter, "-c", "import certifi; print(certifi.where())"],
            text=True,
        )
        os.environ["SSL_CERT_FILE"] = cert_file.strip()
        print("patching ssl certificate")

    print(f"updated PATH with python artifact: {new_path}")


def setup_uv():
    print("Adding uv to PATH")
    new_path = prepend_to_path(os.environ["MOZ_UV_HOME"])
    print(f"updated PATH with uv artifact: {new_path}")


def main():
    if "MOZ_FETCHES" not in os.environ:
        return

    if "MOZ_PYTHON_HOME" in os.environ:
        setup_python()

    if "MOZ_UV_HOME" in os.environ:
        setup_uv()


main()
