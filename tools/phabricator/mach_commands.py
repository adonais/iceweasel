# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, # You can obtain one at http://mozilla.org/MPL/2.0/.

from pathlib import Path

import mozfile
from mach.decorators import Command, CommandArgument


@Command(
    "install-moz-phab",
    category="misc",
    description="Install patch submission tool.",
    virtualenv_name="uv",
)
@CommandArgument(
    "--force",
    "-f",
    action="store_true",
    help="Force installation even if already installed.",
)
def install_moz_phab(command_context, force=False):
    import logging
    import subprocess
    import sys

    moz_phab_executable = mozfile.which("moz-phab")
    if moz_phab_executable and not force:
        command_context.log(
            logging.INFO,
            "already_installed",
            {},
            f"moz-phab is already installed in {moz_phab_executable}.",
        )
        sys.exit(0)

    command_context.log(logging.INFO, "run", {}, "Installing moz-phab using uv")

    cmd = ["uv", "tool", "install", "MozPhab"]
    if force:
        cmd.append("--force")

    result = subprocess.run(cmd, check=False)

    if result.returncode != 0:
        command_context.log(
            logging.ERROR,
            "install_failed",
            {},
            "Failed to install moz-phab. Please check that uv is working correctly.",
        )
        sys.exit(1)

    # `uv tool update-shell` adds `moz-phab` to PATH but that requires a terminal restart.
    # We need the executable path now to add the API token, so we locate it via uv
    tool_dir_result = subprocess.run(
        ["uv", "tool", "dir", "--bin"], check=False, capture_output=True, text=True
    )

    if tool_dir_result.returncode == 0:
        tool_dir = Path(tool_dir_result.stdout.strip())
        moz_phab_path = tool_dir / "moz-phab"

        if not moz_phab_path.exists():
            moz_phab_path = moz_phab_path.with_suffix(".exe")

        subprocess.run([moz_phab_path, "install-certificate"], check=True)
    else:
        command_context.log(
            logging.WARNING,
            "certificate_setup_skipped",
            {},
            "Could not locate installed moz-phab. Please run 'moz-phab install-certificate' manually after restarting your shell.",
        )

    # We run this last, since it instructs the user to restart their shell (if necessary)
    subprocess.run(["uv", "tool", "update-shell"], check=True)
