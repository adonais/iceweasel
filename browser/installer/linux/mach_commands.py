# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import shutil
import subprocess

from mach.decorators import Command, CommandArgument


@Command(
    "shell-test",
    category="testing",
    description="Run shell unit tests using shunit2.",
)
@CommandArgument("tests", nargs="+", metavar="PATH", help="Test files to run.")
def shell_test(command_context, tests):
    if not _is_shunit2_on_path():
        command_context.log(
            logging.ERROR,
            "shell-test",
            {},
            "shunit2 not found. Install it with: "
            "apt install shunit2 (Debian/Ubuntu), "
            "dnf install shunit2 (Fedora), "
            "zypper install shunit2 (openSUSE), "
            "or brew install shunit2 (macOS).",
        )
        return 1

    failed = False
    for path in tests:
        result = subprocess.run([_read_shebang(path), path], check=False)
        if result.returncode != 0:
            failed = True

    return 1 if failed else 0


def _read_shebang(path):
    with open(path) as f:
        first_line = f.readline().strip()
    if first_line.startswith("#!"):
        return first_line[2:].split()[0]
    return "sh"


def _is_shunit2_on_path():
    return shutil.which("shunit2") is not None
