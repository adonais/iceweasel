# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Regression tests for Bug 2019789.

The newtab mach subcommands spawn a child mach process. Passing a bare,
relative, extension-less "./mach" as argv[0] crashes on Windows with
WinError 193 (CreateProcess cannot run a shebang script as a Win32 process)
and assumes CWD == topsrcdir. The fix launches via the running interpreter
(sys.executable) with an absolute path to mach. These tests pin that argv
shape so a relative "./mach" cannot creep back in.
"""

import importlib.util
import os
import sys
from os import path
from unittest import mock

import mozunit
from mach.registrar import Registrar

NEWTAB_DIR = path.abspath(path.join(path.dirname(__file__), path.pardir, path.pardir))

# Third-party and generated modules that mach_commands imports at module level.
# We only need them to satisfy the import; none are used by the code paths under
# test. mach.decorators is deliberately NOT stubbed: the @Command/@SubCommand
# decorators must run for real so the command functions register and remain
# callable.
_STUBBED_IMPORTS = (
    "requests",
    "yaml",
    "colorama",
    "taskcluster",
    "glean_utils",
    "run_glean_parser",
)


def _load_mach_commands():
    # Importing mach_commands runs the @Command/@SubCommand decorators, which
    # register into the global mach Registrar. In a bare pytest process no
    # categories are registered, so pre-register the "misc" category that the
    # newtab command declares; otherwise registration raises MachError.
    if "misc" not in Registrar.categories:
        Registrar.register_category("misc", "Misc", "Miscellaneous commands.")

    # Install the stubs only for the duration of the import, then restore
    # sys.modules. Some of these (yaml, colorama) are real modules that pytest
    # plugins import later; leaving fakes in sys.modules would break plugin
    # bootstrap during pytest.main().
    saved = {name: sys.modules.get(name) for name in _STUBBED_IMPORTS}
    for name in _STUBBED_IMPORTS:
        sys.modules[name] = mock.MagicMock()
    try:
        spec = importlib.util.spec_from_file_location(
            "newtab_mach_commands", path.join(NEWTAB_DIR, "mach_commands.py")
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        for name, original in saved.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original
    return module


mach_commands = _load_mach_commands()


def _command_context():
    ctx = mock.MagicMock()
    ctx.topsrcdir = os.path.join("/fake", "topsrcdir")
    return ctx


def _assert_portable_mach_argv(argv):
    # The exact defect from Bug 2019789: a bare relative shebang path.
    assert argv[0] != "./mach"
    # Launch via the running interpreter, not by relying on the OS honoring
    # the mach shebang.
    assert argv[0] == sys.executable
    # Absolute mach path, so the spawn does not assume CWD == topsrcdir.
    assert os.path.isabs(argv[1])
    assert os.path.basename(argv[1]) == "mach"


def test_mach_argv_uses_interpreter_and_absolute_path():
    ctx = _command_context()
    assert mach_commands.mach_argv(ctx) == [
        sys.executable,
        os.path.join(ctx.topsrcdir, "mach"),
    ]


def test_install_spawns_via_interpreter_not_relative_mach():
    ctx = _command_context()
    with mock.patch.object(mach_commands.subprocess, "Popen") as popen:
        popen.return_value.returncode = 0
        popen.return_value.wait.return_value = 0
        mach_commands.install(ctx)

    popen.assert_called_once()
    _assert_portable_mach_argv(popen.call_args.args[0])


def test_bundle_spawns_via_interpreter_not_relative_mach():
    ctx = _command_context()
    with mock.patch.object(mach_commands.subprocess, "Popen") as popen:
        popen.return_value.returncode = 0
        popen.return_value.wait.return_value = 0
        mach_commands.bundle(ctx)

    popen.assert_called_once()
    _assert_portable_mach_argv(popen.call_args.args[0])


def test_watch_spawns_both_children_via_interpreter():
    ctx = _command_context()
    with mock.patch.object(
        mach_commands.subprocess, "Popen"
    ) as popen, mock.patch.object(
        mach_commands.time, "sleep", side_effect=KeyboardInterrupt
    ), mock.patch.object(mach_commands, "run_mach"):
        mach_commands.watch(ctx)

    assert popen.call_count == 2
    for call in popen.call_args_list:
        _assert_portable_mach_argv(call.args[0])


if __name__ == "__main__":
    mozunit.main()
