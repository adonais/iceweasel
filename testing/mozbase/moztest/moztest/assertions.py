# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import re


class AssertionFailureParser:
    """Parses native assertion failures out of a process output stream and
    emits one ``assertion_failure`` structured-log action per failure.

    Recognized headers (mfbt/Assertions.h and xpcom/base/nsDebugImpl.cpp):

      [<pid>] Assertion failure: <condition>, at <file>:<line>
      [<pid>] Hit MOZ_CRASH(<reason>) at <file>:<line>
      [<desc> <pid>, <thread>] ###!!! ASSERTION: <str>: '<expr>', file <file>:<line>
      [<pid>, <thread>] ###!!! ABORT: <str>: '<expr>', file <file>:<line>

    Each header is followed by the frames MozWalkTheStack prints, one per
    line, as post-processed by the harness's stack fixer:

      #01: <function> [<file>:<line>]      (breakpad symbols, CI)
      #01: <function> (<file>:<line>)      (native symbols)
      #01: <function> [<library> + 0x<offset>]
      #01: ???[<library> +0x<offset>]      (unfixed)

    There is no terminator: a report ends on the first line that is neither a
    frame nor tolerated noise (a few lines from other processes can land in
    the middle of a stack when the output of several processes is merged),
    on a new header, or on flush().

    With XPCOM_DEBUG_BREAK=stack-and-abort (xpcshell), an NS_ASSERTION is
    followed by ``Hit MOZ_CRASH([...] ###!!! ASSERTION: ...)`` and a second
    stack. That crash line is folded into the pending assertion, which becomes
    fatal, and its stack is swallowed, so one failure yields one action.

    In-progress state is keyed by the emitting stream (``pid``), so reports
    from streams that interleave stay separate.
    """

    # Lines from other processes tolerated inside a report before giving up.
    MAX_SLACK = 3

    mozAssertRegExp = re.compile(
        r"^(?:\[(?P<pid>\d+)\] )?Assertion failure: (?P<message>.*), at "
        r"(?P<file>.+?):(?P<lineno>\d+)\s*$"
    )
    mozCrashRegExp = re.compile(
        r"^(?:\[(?P<pid>\d+)\] )?Hit MOZ_CRASH\((?P<message>.*)\) at "
        r"(?P<file>.+?):(?P<lineno>\d+)\s*$"
    )
    # The process description set by nsDebugImpl::SetMultiprocessMode is free
    # form ("Parent", "PKCS11ModuleChild", "MF Media Engine CDM"), so the pid
    # is the last token before the thread name.
    nsDebugRegExp = re.compile(
        r"^\[(?:(?P<process_type>[^\]]+?) )?(?P<pid>\d+), (?P<thread>[^\]]+)\] "
        r"###!!! (?P<severity>ASSERTION|ABORT): (?P<rest>.*)$"
    )
    # The message is "<str>: '<expr>'", "<str>", "'<expr>'" or empty, and the
    # location is optional (nsDebugImpl.cpp prints each piece when present).
    nsDebugRestRegExp = re.compile(
        r"^(?:(?P<message>.*)(?:, |: ))?file (?P<file>.+?)(?::|, line )"
        r"(?P<lineno>\d+)\s*$"
    )
    frameRegExp = re.compile(r"^#(?P<n>\d+): (?P<body>.*\S)\s*$")
    # The function name can itself contain (), [] and spaces, so the location
    # is the bracketed group that ends the line.
    frameTailRegExp = re.compile(
        r"^(?P<function>.*?)\s*(?:\[(?P<bloc>[^\[\]]*)\]|\((?P<ploc>[^()]*)\))$"
    )
    fileLineRegExp = re.compile(r"^(?P<file>.+?):(?P<line>\d+)$")
    moduleOffsetRegExp = re.compile(r"^(?P<module>.+?) \+ ?(?P<offset>0x[0-9A-Fa-f]+)$")
    # Rust frames carry a trailing ::h<hex> that changes with compiler
    # versions; see bug 1507350.
    rustRegExp = re.compile(r"::h[a-f0-9]{16}$")
    # NS_DebugBreak rings the terminal bell before an assertion; harnesses
    # that escape control characters (xpcshell) turn it into a literal "\x07".
    bellRegExp = re.compile(r"^(?:\x07|\\x07)")

    FATAL_KINDS = frozenset({"MOZ_ASSERT", "MOZ_CRASH", "NS_ABORT"})

    def __init__(self, logger):
        self.logger = logger
        # stream id -> in-progress report dict
        self._reports = {}

    def log(self, line, pid=None, test=None, time=None):
        """Feed one output line from stream ``pid``.

        Returns True when the line was consumed (a header, a frame, or the
        folded crash of a pending assertion), False otherwise.
        """
        line = self.bellRegExp.sub("", line.rstrip("\r\n"))
        report = self._reports.get(pid)

        if report is not None and line.startswith("#"):
            frame = self._parse_frame(line)
            if frame is not None:
                report["slack"] = 0
                if not report["swallow"]:
                    report["stack"].append(frame)
                return True

        header = self._parse_header(line)
        if header is not None:
            if report is not None and self._folds_into(report, header):
                report["fatal"] = True
                report["swallow"] = True
                report["slack"] = 0
                return True
            self._finish(pid)
            self._reports[pid] = {
                **header,
                "test": test,
                "time": time,
                "stack": [],
                "slack": 0,
                "swallow": False,
            }
            return True

        if report is not None:
            report["slack"] += 1
            if report["slack"] > self.MAX_SLACK:
                self._finish(pid)
        return False

    def flush(self):
        """Emit any reports left open by truncated output."""
        for pid in list(self._reports):
            self._finish(pid)

    def discard(self, key):
        """Drop the pending report whose (message, file, lineno) is ``key``.

        Returns True when one was dropped.
        """
        for pid, report in list(self._reports.items()):
            if self.key_of(report) == key:
                del self._reports[pid]
                return True
        return False

    @staticmethod
    def key_of(report):
        return (report["message"], report.get("file"), report.get("lineno"))

    def _finish(self, pid):
        report = self._reports.pop(pid, None)
        if report is None:
            return
        kwargs = {
            "kind": report["kind"],
            "message": report["message"],
            "file": report["file"],
            "lineno": report["lineno"],
            "pid": report["pid"],
            "process_type": report["process_type"],
            "thread": report["thread"],
            "fatal": report["fatal"],
            "stack": report["stack"] or None,
            "test": report["test"],
        }
        if report["time"] is not None:
            kwargs["time"] = report["time"]
        self.logger.assertion_failure(**kwargs)

    def _folds_into(self, report, header):
        if header["kind"] != "MOZ_CRASH" or report["kind"] not in (
            "NS_ASSERTION",
            "NS_ABORT",
        ):
            return False
        inner = self._parse_ns_debug(header["message"])
        return inner is not None and self.key_of(inner) == self.key_of(report)

    def _parse_header(self, line):
        header = None
        if "Hit MOZ_CRASH(" in line:
            header = self._match_location(self.mozCrashRegExp, line, "MOZ_CRASH")
        if header is None and "Assertion failure: " in line:
            header = self._match_location(self.mozAssertRegExp, line, "MOZ_ASSERT")
        if header is None and "###!!! " in line:
            header = self._parse_ns_debug(line)
        return header

    def _match_location(self, regexp, line, kind):
        match = regexp.match(line)
        if not match:
            return None
        pid = match.group("pid")
        return {
            "kind": kind,
            "message": match.group("message"),
            "file": match.group("file"),
            "lineno": int(match.group("lineno")),
            "pid": int(pid) if pid else None,
            "process_type": None,
            "thread": None,
            "fatal": kind in self.FATAL_KINDS,
        }

    def _parse_ns_debug(self, line):
        match = self.nsDebugRegExp.match(line)
        if not match:
            return None
        kind = "NS_ASSERTION" if match.group("severity") == "ASSERTION" else "NS_ABORT"
        rest = match.group("rest")
        location = self.nsDebugRestRegExp.match(rest)
        if location:
            message = location.group("message") or ""
            file_ = location.group("file")
            lineno = int(location.group("lineno"))
        else:
            message = rest.rstrip(", ")
            file_ = None
            lineno = None
        return {
            "kind": kind,
            "message": message,
            "file": file_,
            "lineno": lineno,
            "pid": int(match.group("pid")),
            "process_type": match.group("process_type"),
            "thread": match.group("thread"),
            "fatal": kind in self.FATAL_KINDS,
        }

    def _parse_frame(self, line):
        match = self.frameRegExp.match(line)
        if not match:
            return None
        tail = self.frameTailRegExp.match(match.group("body"))
        if not tail:
            return None
        function = self.rustRegExp.sub("", tail.group("function"))
        location = tail.group("bloc")
        if location is None:
            location = tail.group("ploc")
        frame = {}
        if file_line := self.fileLineRegExp.match(location):
            frame["file"] = file_line.group("file")
            frame["line"] = int(file_line.group("line"))
        elif module := self.moduleOffsetRegExp.match(location):
            frame["module"] = module.group("module")
            frame["module_offset"] = int(module.group("offset"), 16)
        # An unsymbolicated frame is best named by its offset in the profiler.
        if function != "???" or "module_offset" not in frame:
            frame["function"] = function
        return frame
