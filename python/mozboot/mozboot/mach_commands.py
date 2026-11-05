# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from pathlib import Path

from mach.decorators import Command, CommandArgument

from mozboot.bootstrap import APPLICATIONS


@Command(
    "bootstrap",
    category="devenv",
    description="Install required system packages for building.",
)
@CommandArgument(
    "--application-choice",
    choices=list(APPLICATIONS.keys()) + list(APPLICATIONS.values()),
    default=None,
    help="Pass in an application choice instead of using the default "
    "interactive prompt.",
)
@CommandArgument(
    "--no-system-changes",
    dest="no_system_changes",
    action="store_true",
    help="Only execute actions that leave the system configuration alone.",
)
@CommandArgument(
    "--no-agentic-tools",
    dest="no_agentic_tools",
    action="store_true",
    help="Do not install tools for agentic coding.",
)
@CommandArgument(
    "--exclude",
    nargs="+",
    help="A list of bootstrappable elements not to bootstrap.",
)
def bootstrap(
    command_context,
    application_choice=None,
    no_system_changes=False,
    no_agentic_tools=False,
    exclude=[],
):
    """Bootstrap system and mach for optimal development experience."""
    from mozboot.bootstrap import Bootstrapper

    bootstrapper = Bootstrapper(
        choice=application_choice,
        no_interactive=not command_context._mach_context.is_interactive,
        no_system_changes=no_system_changes,
        no_agentic_tools=no_agentic_tools,
        exclude=exclude,
        mach_context=command_context._mach_context,
    )
    bootstrapper.bootstrap(command_context.settings)


@Command(
    "vcs-setup",
    category="devenv",
    description="Help configure a VCS for optimal development.",
)
@CommandArgument(
    "-u",
    "--update-only",
    action="store_true",
    help="Only update recommended extensions, don't run the wizard.",
)
@CommandArgument(
    "--vcs",
    choices=("hg", "git", "jj"),
    help="Force a specific VCS backend instead of auto-detecting.",
)
@CommandArgument(
    "--no-system-changes",
    action="store_true",
    help="Skip Watchman configuration.",
)
def vcs_setup(command_context, update_only=False, vcs=None, no_system_changes=False):
    """Ensure a Version Control System (Mercurial, Git, or
    Git + Jujutsu) is optimally configured.

    This command will inspect your VCS configuration and
    guide you through an interactive wizard helping you configure the
    VCS for optimal use on Mozilla projects.

    If "--update-only" is used, the interactive wizard is disabled
    and this command only ensures that remote repositories providing
    VCS extensions are up-to-date.
    """
    from mozversioncontrol.factory import (
        get_repository_object,
        get_specific_repository_object,
    )

    topsrcdir = Path(command_context._mach_context.topdir)
    state_dir = Path(command_context._mach_context.state_dir)

    no_jj_dir = not (topsrcdir / ".jj").exists()

    if vcs == "jj" and no_jj_dir:
        import subprocess

        from mozversioncontrol.repo.base import get_tool_path

        print("Initializing a git colocated jj repository...")
        jj_bin = get_tool_path("jj")
        subprocess.run([jj_bin, "git", "init", "--colocate"], check=True)

    if vcs:
        repo = get_specific_repository_object(topsrcdir, vcs)
    else:
        repo = get_repository_object(topsrcdir)
        print(f"Automatically detected a {repo.name} repository.")

    repo.configure(
        state_dir, update_only=update_only, no_system_changes=no_system_changes
    )
