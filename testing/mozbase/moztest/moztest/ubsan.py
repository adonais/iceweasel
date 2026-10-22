# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import re


class UBSanErrorParser:
    """Parses UndefinedBehaviorSanitizer reports out of a process output
    stream and emits one ``ubsan_error`` structured-log action per completed
    report.

    A report opens with a ``<file>:<line>:<col>: runtime error: <message>``
    line, continues with the stack the runtime prints when
    ``print_stacktrace=1`` is set (one ``#N 0x<addr> in <function> <location>``
    frame per line), and closes with a
    ``SUMMARY: UndefinedBehaviorSanitizer: <kind> <location>`` line. Some
    checks insert ``note:`` lines and a hex dump between the header and the
    frames. The kind is "undefined-behavior" unless the runtime runs with
    ``report_error_type=1``, so the header message is the meaningful part.

    Reports from different emitting processes can interleave in a merged
    output stream, so in-progress state is keyed by the emitting stream. The
    runtime prints no process id, and the stream a line arrives on belongs to
    whichever process relays the output, so reports carry none.
    """

    headerRegExp = re.compile(r"^(?P<loc>\S+): runtime error: (?P<message>.+?)\s*$")
    noteRegExp = re.compile(r"^\S+: note: .*$")
    hexDumpRegExp = re.compile(r"^\s*(?:[0-9a-f]{2}\s+)*[0-9a-f]{2}\s*$|^\s*\^~*\s*$")
    # "    #%n %p %F %L": %F is "in <function>" or empty, %L is a source
    # location, "(<module>+0x<offset>)" or "(<unknown module>)".
    frameRegExp = re.compile(
        r"^\s*#(?P<n>\d+) 0x[0-9a-fA-F]+ ?(?P<body>.*?)"
        r"(?: \(BuildId: [0-9a-fA-F]+\))?\s*$"
    )
    moduleRegExp = re.compile(
        r"^(?:in (?P<func>.*?))?\s*\((?:(?P<module>[^()\s]+)\+"
        r"(?P<offset>0x[0-9a-fA-F]+)|<unknown module>)\)$"
    )
    sourceLocRegExp = re.compile(
        r"^(?P<file>.+?)(?::(?P<line>\d+)(?::(?P<col>\d+))?)?$"
    )
    addressRegExp = re.compile(r"^0x[0-9a-fA-F]+$")
    summaryRegExp = re.compile(
        r"^SUMMARY: UndefinedBehaviorSanitizer: (?P<kind>\S+)"
        r"(?: (?P<loc>\S+))?(?: in (?P<function>.+?))?\s*$"
    )
    # Rust frames aren't demangled cleanly and carry a trailing ::h<hex> that
    # changes with compiler versions; see bug 1507350.
    rustRegExp = re.compile(r"::h[a-f0-9]{16}$")

    def __init__(self, logger, scope=None):
        self.logger = logger
        self.scope = scope
        # stream id -> in-progress report dict
        self._reports = {}

    def log(self, line, pid=None, scope=None, test=None, time=None):
        """Feed one output line from stream ``pid``.

        Returns True when the line belongs to a report (header, frame, note
        or SUMMARY), False otherwise.
        """
        line = line.rstrip("\r\n")

        header = self.headerRegExp.match(line)
        if header:
            # A new report ends any report still open on this stream.
            self._finish(pid)
            file_, lineno, column = self._location(header.group("loc"))
            self._reports[pid] = {
                "kind": "undefined-behavior",
                "message": header.group("message"),
                "file": file_,
                "lineno": lineno,
                "column": column,
                "stack": [],
                "scope": scope if scope is not None else self.scope,
                "test": test,
                "time": time,
                "discarded": False,
            }
            return True

        report = self._reports.get(pid)
        if report is None:
            return False

        summary = self.summaryRegExp.match(line)
        if summary:
            if summary.group("kind") != "undefined-behavior":
                report["kind"] = summary.group("kind")
            self._finish(pid)
            return True

        frame = self.frameRegExp.match(line)
        if frame:
            if not report["discarded"]:
                report["stack"].append(self._frame(frame.group("body").strip()))
            return True

        if (
            not line.strip()
            or self.noteRegExp.match(line)
            or self.hexDumpRegExp.match(line)
        ):
            return True

        return False

    def flush(self):
        """Emit any reports left open by truncated output."""
        for pid in list(self._reports):
            self._finish(pid)

    def discard(self, key):
        """Drop the open report identified by ``key`` (its
        ``(file, line, column, message)``) once it completes, because a
        structured action for the same report was logged. Its remaining
        lines are still consumed. Returns whether a report matched.
        """
        for report in self._reports.values():
            if not report["discarded"] and self.key_of(report) == key:
                report["discarded"] = True
                return True
        return False

    @staticmethod
    def key_of(data):
        return (
            data.get("file"),
            data.get("lineno"),
            data.get("column"),
            data["message"],
        )

    def _finish(self, pid):
        report = self._reports.pop(pid, None)
        if report is None or report["discarded"]:
            return
        kwargs = {}
        if report["time"] is not None:
            kwargs["time"] = report["time"]
        self.logger.ubsan_error(
            kind=report["kind"],
            message=report["message"],
            file=report["file"],
            lineno=report["lineno"],
            column=report["column"],
            stack=report["stack"] or None,
            scope=report["scope"],
            test=report["test"],
            **kwargs,
        )

    def _frame(self, body):
        module = self.moduleRegExp.match(body)
        if module:
            frame = {}
            if module.group("func"):
                frame["function"] = self.rustRegExp.sub("", module.group("func"))
            if module.group("module"):
                frame["module"] = module.group("module")
                frame["module_offset"] = int(module.group("offset"), 16)
            elif not frame:
                frame["function"] = "<unknown module>"
            return frame

        function = None
        location = body
        if body.startswith("in "):
            function, sep, location = body[3:].rpartition(" ")
            if not sep:
                function, location = location, None
        frame = {}
        if function:
            frame["function"] = self.rustRegExp.sub("", function)
        if location:
            file_, lineno, column = self._location(location)
            if file_:
                frame["file"] = file_
                if lineno is not None:
                    frame["line"] = lineno
                if column is not None:
                    frame["column"] = column
        return frame

    def _location(self, loc):
        if loc.startswith("(") or loc == "<unknown>" or self.addressRegExp.match(loc):
            return None, None, None
        match = self.sourceLocRegExp.match(loc)
        lineno = int(match.group("line")) if match.group("line") else None
        column = int(match.group("col")) if match.group("col") else None
        return match.group("file"), lineno, column
