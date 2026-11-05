#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.
"""Mozilla error lists for running tests.

Error lists are used to parse output in mozharness.base.log.OutputParser.

Each line of output is matched against each substring or regular expression
in the error list.  On a match, we determine the 'level' of that line,
whether IGNORE, DEBUG, INFO, WARNING, ERROR, CRITICAL, or FATAL.

"""

import re

from mozharness.base.log import ERROR, INFO, WARNING

# ErrorLists {{{1
_mochitest_summary = {
    "regex": re.compile(
        r"""(\d+ INFO (Passed|Failed|Todo):\ +(\d+)|\t(Passed|Failed|Todo): (\d+))"""
    ),  # NOQA: E501
    "pass_group": "Passed",
    "fail_group": "Failed",
    "known_fail_group": "Todo",
}

_reftest_summary = {
    "regex": re.compile(
        r"""REFTEST INFO \| (Successful|Unexpected|Known problems): (\d+) \("""
    ),  # NOQA: E501
    "pass_group": "Successful",
    "fail_group": "Unexpected",
    "known_fail_group": "Known problems",
}

TinderBoxPrintRe = {
    "mochitest-chrome_summary": _mochitest_summary,
    "mochitest-webgl1-core_summary": _mochitest_summary,
    "mochitest-webgl1-ext_summary": _mochitest_summary,
    "mochitest-webgl2-core_summary": _mochitest_summary,
    "mochitest-webgl2-ext_summary": _mochitest_summary,
    "mochitest-webgl2-deqp_summary": _mochitest_summary,
    "mochitest-webgpu_summary": _mochitest_summary,
    "mochitest-media_summary": _mochitest_summary,
    "mochitest-plain_summary": _mochitest_summary,
    "mochitest-plain-gpu_summary": _mochitest_summary,
    "marionette_summary": {
        "regex": re.compile(r"""(passed|failed|todo):\ +(\d+)"""),
        "pass_group": "passed",
        "fail_group": "failed",
        "known_fail_group": "todo",
    },
    "reftest_summary": _reftest_summary,
    "reftest-qr_summary": _reftest_summary,
    "crashtest_summary": _reftest_summary,
    "crashtest-qr_summary": _reftest_summary,
    "xpcshell_summary": {
        "regex": re.compile(r"""INFO \| (Passed|Failed|Todo): (\d+)"""),
        "pass_group": "Passed",
        "fail_group": "Failed",
        "known_fail_group": "Todo",
    },
    "jsreftest_summary": _reftest_summary,
    "instrumentation_summary": _mochitest_summary,
    "cppunittest_summary": {
        "regex": re.compile(r"""cppunittests INFO \| (Passed|Failed): (\d+)"""),
        "pass_group": "Passed",
        "fail_group": "Failed",
        "known_fail_group": None,
    },
    "gtest_summary": {
        "regex": re.compile(r"""(Passed|Failed): (\d+)"""),
        "pass_group": "Passed",
        "fail_group": "Failed",
        "known_fail_group": None,
    },
    "jittest_summary": {
        "regex": re.compile(r"""(Passed|Failed): (\d+)"""),
        "pass_group": "Passed",
        "fail_group": "Failed",
        "known_fail_group": None,
    },
    "mozbase_summary": {
        "regex": re.compile(r"""(OK)|(FAILED) \(errors=(\d+)"""),
        "pass_group": "OK",
        "fail_group": "FAILED",
        "known_fail_group": None,
    },
    "geckoview_summary": {
        "regex": re.compile(r"""(Passed|Failed): (\d+)"""),
        "pass_group": "Passed",
        "fail_group": "Failed",
        "known_fail_group": None,
    },
    "geckoview-junit_summary": {
        "regex": re.compile(r"""(Passed|Failed): (\d+)"""),
        "pass_group": "Passed",
        "fail_group": "Failed",
        "known_fail_group": None,
    },
    "harness_error": {
        "full_regex": re.compile(
            r"(?:TEST-UNEXPECTED-FAIL|PROCESS-CRASH) \| .* \|[^\|]* (application crashed|missing output line for total leaks!|negative leaks caught!|\d+ bytes leaked)"  # NOQA: E501
        ),
        "minimum_regex": re.compile(r"""(TEST-UNEXPECTED|PROCESS-CRASH)"""),
        "retry_regex": re.compile(
            r"""(No space left on device|ADBError|ADBProcessError|ADBTimeoutError|INFRA-ERROR)"""
        ),
    },
}

TestPassed = [
    {
        "regex": re.compile(r"""(TEST-INFO|TEST-KNOWN-FAIL|TEST-PASS|INFO \| )"""),
        "level": INFO,
    },
]

BaseHarnessErrorList = [
    {
        "substr": "TEST-UNEXPECTED",
        "level": ERROR,
    },
    {
        "substr": "PROCESS-CRASH",
        "level": ERROR,
    },
    {
        "regex": re.compile("""ERROR: (Address|Leak)Sanitizer"""),
        "level": ERROR,
    },
    {
        "regex": re.compile("""thread '([^']+)' panicked"""),
        "level": ERROR,
    },
    {
        "substr": "pure virtual method called",
        "level": ERROR,
    },
    {
        "substr": "Pure virtual function called!",
        "level": ERROR,
    },
]

HarnessErrorList = BaseHarnessErrorList + [
    {
        "substr": "A content process crashed",
        "level": ERROR,
    },
]

# wpt can have expected crashes so we can't always turn treeherder orange in those cases
WptHarnessErrorList = BaseHarnessErrorList

LogcatErrorList = [
    {
        "substr": "Fatal signal 11 (SIGSEGV)",
        "level": ERROR,
        "explanation": "This usually indicates the B2G process has crashed",
    },
    {
        "substr": "Fatal signal 7 (SIGBUS)",
        "level": ERROR,
        "explanation": "This usually indicates the B2G process has crashed",
    },
    {"substr": "[JavaScript Error:", "level": WARNING},
    {
        "substr": "seccomp sandbox violation",
        "level": ERROR,
        "explanation": "A content process has violated the system call sandbox (bug 790923)",
    },
]


# Treeherder failure summary {{{1
class TreeherderErrorParser:
    """Port of Treeherder's ErrorParser, the heuristic selecting the task log
    lines shown in a job's Failure Summary.

    Keep the terms and expressions in sync with
    https://github.com/mozilla/treeherder/blob/master/treeherder/log_parser/parsers.py
    (snapshot of 2026-09-09). Treeherder strips the worker's "[task ...] "
    prefix, then matches the line as mozharness printed it, with its
    "HH:MM:SS LEVEL - " prefix (RE_ERR_1_MATCH, RE_MOZHARNESS_PREFIX). Lines
    are matched here from the level and message of the mozharness log record
    instead, so no prefix has to be parsed.
    """

    IN_SEARCH_TERMS = (
        "TEST-UNEXPECTED-",
        "fatal error",
        "FATAL ERROR",
        "Hit MOZ_CRASH",
        "REFTEST ERROR",
        "PROCESS-CRASH",
        "Assertion fail",
        "###!!! ABORT:",
        "SUMMARY: AddressSanitizer",
        "SUMMARY: ThreadSanitizer",
        "SUMMARY: UndefinedBehaviorSanitizer",
        "ThreadSanitizer: nested bug",
        "Automation Error:",
        "command timed out:",
        "wget: unable ",
        "bash.exe: *** ",
        "Unsuccessful task run with exit code: 137",
        "YOU ARE LEAKING THE WORLD",
    )

    RE_ERR_MATCH = re.compile(
        r"^g?make(?:\[\d+\])?: \*\*\*"
        r"|^[A-Za-z.]+Error: "
        r"|^[A-Za-z.]*Exception: "
        r"|^\[  FAILED  \] "
        r"|^remoteFailed:"
        r"|^rm: cannot "
        r"|^abort:"
        r"|^\[taskcluster\] Error:"
        r"|^\[[\w._-]+:(?:error|exception)\]"
    )

    RE_ERR_SEARCH = re.compile(
        r" error\(\d*\):"
        r"|:\d+: error:"
        r"| error R?C\d*:"
        r"|ERROR [45]\d\d:"
        r"|mozmake\.(?:exe|EXE)(?:\[\d+\])?: \*\*\*"
    )

    RE_EXCLUDE_1_SEARCH = re.compile(
        r"TEST-(?:INFO|PASS) "
        r"|A content process crashed and MOZ_CRASHREPORTER_SHUTDOWN is set, shutting down"
    )

    RE_EXCLUDE_2_SEARCH = re.compile(
        r"I[ /](Gecko|TestRunner).*TEST-UNEXPECTED-"
        r"|Assertion failure$"
        r"|^TEST-UNEXPECTED-WARNING\b"
        r"|^TimeoutException: "
        r"|^ImportError: No module named pygtk$"
        r"|non-fatal error"
    )

    ERROR_LEVELS = ("ERROR", "CRITICAL", "FATAL")

    def is_error_line(self, level, message):
        """Whether Treeherder selects the line of a mozharness log record.

        Args:
            level (str): the record's level name.
            message (str): the record's message.
        """
        if self.RE_EXCLUDE_1_SEARCH.search(message):
            return False

        if level in self.ERROR_LEVELS:
            return True

        trimline = message.lstrip(" ").rstrip()
        if self.RE_EXCLUDE_2_SEARCH.search(trimline):
            return False

        return bool(
            any(term in trimline for term in self.IN_SEARCH_TERMS)
            or self.RE_ERR_MATCH.match(trimline)
            or self.RE_ERR_SEARCH.search(trimline)
        )
