# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import re
import subprocess
import sys
from pathlib import Path

from mozlint import result

# The checks report their own status with test harness prefixes, which are
# meaningless (and misleading in a treeherder log) when run under mozlint. Drop
# the prefix, keeping whatever the check had to say after it.
STATUS_PREFIX = re.compile(r"^TEST-(?P<status>PASS|UNEXPECTED-FAIL) \| [^|]+ \| ")

# An error block in check_spidermonkey_style.py output, as it appears on the
# added side of the diff against the expected output:
#     +js/src/vm/Interpreter.h:12: error:
#     +    "vm/Stack.h" is included using the wrong path;
ERROR_HEADER = re.compile(r"^\+(?P<path>[^:]+?)(?::(?P<lineno>\d+))?: error:$")

# check_spidermonkey_style.py reports header cycles without a single location.
MULTIPLE_FILES = "(multiple files)"


HERE = Path(__file__).parent


def _run_check(script, lintargs):
    root = Path(lintargs["root"])
    proc = subprocess.run(
        [sys.executable, str(HERE / script)],
        cwd=str(root),
        capture_output=True,
        text=True,
        check=False,
    )
    lines = []
    for line in (proc.stdout + proc.stderr).splitlines():
        match = STATUS_PREFIX.match(line)
        if not match:
            lines.append(line)
        elif match.group("status") == "UNEXPECTED-FAIL":
            lines.append(line[match.end() :])
    return proc.returncode, "\n".join(lines).strip()


def _issue(config, path, message, lineno=0, hint=None):
    return result.from_config(
        config,
        path=path,
        lineno=lineno,
        message=message,
        hint=hint,
        level="error",
    )


def style(paths, config, fix=None, **lintargs):
    """Check #include style and header cycles across js/src."""
    retcode, output = _run_check("check_spidermonkey_style.py", lintargs)
    if retcode == 0:
        return []

    results = []
    header = None
    body = []

    def flush():
        if not header:
            return
        path, lineno = header
        message = " ".join(line for line in body if line)
        results.append(_issue(config, path, message, lineno=lineno))

    for line in output.splitlines():
        match = ERROR_HEADER.match(line)
        if match:
            flush()
            path = match.group("path")
            if path == MULTIPLE_FILES:
                path = "js/src"
            header = (path, int(match.group("lineno") or 0))
            body = []
        elif not line.startswith("+"):
            # A context or removed line ends the current added block.
            flush()
            header = None
        elif header:
            body.append(line[1:].strip())
    flush()

    if results:
        return results

    # The diff contained no parseable error, which means the expected output for
    # the js/src/tests/style/ fixtures changed. Report the diff verbatim.
    return [
        _issue(
            config,
            "js/src/tests/style",
            output,
            hint="expected_output in tools/lint/spidermonkey/check_spidermonkey_style.py"
            " needs updating",
        )
    ]


def macroassembler(paths, config, fix=None, **lintargs):
    """Check that MacroAssembler declarations match their definitions."""
    retcode, output = _run_check("check_macroassembler_style.py", lintargs)
    if retcode == 0:
        return []
    return [_issue(config, "js/src/jit/MacroAssembler.h", output)]


def opcode(paths, config, fix=None, **lintargs):
    """Check the bytecode documentation in js/src/vm/Opcodes.h."""
    retcode, output = _run_check("check_js_opcode.py", lintargs)
    if retcode == 0:
        return []
    return [_issue(config, "js/src/vm/Opcodes.h", output)]
