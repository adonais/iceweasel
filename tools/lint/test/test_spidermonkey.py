# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import importlib

import mozunit
import pytest
from mozlint.result import ResultSummary

LINTER = "spidermonkey"


@pytest.fixture(autouse=True)
def _result_root(monkeypatch):
    monkeypatch.setattr(ResultSummary, "root", "/src")


@pytest.fixture
def module():
    return importlib.import_module("spidermonkey")


@pytest.fixture
def config():
    return {"name": "spidermonkey-style", "description": "fallback description"}


@pytest.fixture
def canned(module, monkeypatch):
    def _canned(retcode, stdout):
        # _run_check strips its output, so canned output must be stripped too.
        monkeypatch.setattr(
            module, "_run_check", lambda script, lintargs: (retcode, stdout.strip())
        )

    return _canned


def test_strips_test_harness_prefixes(module, monkeypatch):
    class Proc:
        returncode = 1
        stdout = (
            "TEST-PASS | check_js_opcode.py | ok\n"
            "TEST-UNEXPECTED-FAIL | check_js_opcode.py | Category is not specified\n"
        )
        stderr = ""

    monkeypatch.setattr(module.subprocess, "run", lambda *a, **kw: Proc())
    retcode, output = module._run_check("check_js_opcode.py", {"root": "/src"})
    assert retcode == 1
    assert output == "Category is not specified"


@pytest.mark.parametrize("check", ["style", "macroassembler", "opcode"])
def test_no_issues_when_check_passes(module, config, canned, check):
    canned(0, "")
    assert getattr(module, check)([], config) == []


def test_style_reports_each_error_with_a_location(module, config, canned):
    canned(
        1,
        "--- check_spidermonkey_style.py expected output\n"
        "+++ check_spidermonkey_style.py actual output\n"
        "@@ -1,4 +1,9 @@\n"
        " js/src/tests/style/BadIncludes.h:3: error:\n"
        "     the file includes itself\n"
        "+js/src/vm/Interpreter.cpp:9: error:\n"
        '+    "stdio.h" is included using the wrong path;\n'
        "+    did you forget a prefix?\n"
        "+\n"
        "+js/src/vm/Stack.h:12: error:\n"
        "+    vanilla header includes an inline-header file\n"
        "+\n"
        " \n",
    )

    issues = module.style([], config)
    assert [(i.relpath, i.lineno) for i in issues] == [
        ("js/src/vm/Interpreter.cpp", 9),
        ("js/src/vm/Stack.h", 12),
    ]
    assert issues[0].message == (
        '"stdio.h" is included using the wrong path; did you forget a prefix?'
    )
    assert issues[1].message == "vanilla header includes an inline-header file"


def test_style_maps_header_cycles_to_js_src(module, config, canned):
    canned(
        1,
        "@@ -1,2 +1,6 @@\n"
        "+(multiple files): error:\n"
        "+    header files form one or more cycles\n"
        "+\n"
        "+   vm/A.h\n"
        "+   -> vm/B.h\n",
    )

    (issue,) = module.style([], config)
    assert issue.relpath == "js/src"
    assert issue.lineno == 0
    assert "header files form one or more cycles" in issue.message
    assert "-> vm/B.h" in issue.message


def test_style_falls_back_to_the_raw_diff(module, config, canned):
    # Only removed lines: the js/src/tests/style/ fixtures no longer produce the
    # output expected by the check itself.
    diff = (
        "@@ -1,6 +1,2 @@\n"
        "-js/src/tests/style/BadIncludes.h:6: error:\n"
        '-    "BadIncludes2.h" is included using the wrong path;\n'
    )
    canned(1, diff)

    (issue,) = module.style([], config)
    assert issue.relpath == "js/src/tests/style"
    assert issue.message == diff.strip()
    assert "expected_output" in issue.hint


def test_macroassembler_reports_the_whole_diff(module, config, canned):
    canned(1, "-void PushFlags() DEFINED_ON(arm, x86_shared);")

    (issue,) = module.macroassembler([], config)
    assert issue.relpath == "js/src/jit/MacroAssembler.h"
    assert issue.message == "-void PushFlags() DEFINED_ON(arm, x86_shared);"


def test_opcode_reports_the_check_output(module, config, canned):
    canned(1, "Category is not specified for Undefined")

    (issue,) = module.opcode([], config)
    assert issue.relpath == "js/src/vm/Opcodes.h"
    assert issue.message == "Category is not specified for Undefined"


if __name__ == "__main__":
    mozunit.main()
