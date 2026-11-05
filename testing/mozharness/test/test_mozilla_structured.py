import io
import json
import logging
import os
import shutil
import tempfile
import unittest

import mozunit
from mozharness.base import log
from mozharness.base.log import ERROR, FATAL, INFO, WARNING
from mozharness.mozilla.automation import TBPL_SUCCESS, TBPL_WARNING
from mozharness.mozilla.mozbase import MozbaseMixin
from mozharness.mozilla.structuredlog import StructuredOutputParser
from mozlog.handlers.statushandler import RunSummary

success_summary = RunSummary(
    unexpected_statuses={},
    expected_statuses={"PASS": 3, "OK": 1, "FAIL": 1},
    known_intermittent_statuses={"FAIL": 1},
    log_level_counts={"info": 5},
    action_counts={"test_status": 4, "test_end": 1, "suite_end": 1},
)

failure_summary = RunSummary(
    unexpected_statuses={"FAIL": 2},
    expected_statuses={"PASS": 2, "OK": 1},
    known_intermittent_statuses={},
    log_level_counts={"warning": 2, "info": 3},
    action_counts={"test_status": 3, "test_end": 2, "suite_end": 1},
)


class TestParser(MozbaseMixin, StructuredOutputParser):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.config = {}


class TestStructuredOutputParser(unittest.TestCase):
    def setUp(self):
        self.parser = TestParser()

    def test_evaluate_parser_success(self):
        self.parser.handler.expected_statuses = {"PASS": 3, "OK": 1, "FAIL": 1}
        self.parser.handler.log_level_counts = {"info": 5}
        self.parser.handler.action_counts = {
            "test_status": 4,
            "test_end": 1,
            "suite_end": 1,
        }
        self.parser.handler.known_intermittent_statuses = {"FAIL": 1}
        result = self.parser.evaluate_parser(
            return_code=TBPL_SUCCESS, success_codes=[TBPL_SUCCESS]
        )
        tbpl_status, worst_log_level, joined_summary = result
        self.assertEqual(tbpl_status, TBPL_SUCCESS)
        self.assertEqual(worst_log_level, INFO)
        self.assertEqual(joined_summary, success_summary)

    def test_evaluate_parser_failure(self):
        self.parser.handler.unexpected_statuses = {"FAIL": 2}
        self.parser.handler.expected_statuses = {"PASS": 2, "OK": 1}
        self.parser.handler.log_level_counts = {"warning": 2, "info": 3}
        self.parser.handler.action_counts = {
            "test_status": 3,
            "test_end": 2,
            "suite_end": 1,
        }
        result = self.parser.evaluate_parser(
            return_code=TBPL_SUCCESS, success_codes=[TBPL_SUCCESS]
        )
        tbpl_status, worst_log_level, joined_summary = result
        self.assertEqual(tbpl_status, TBPL_WARNING)
        self.assertEqual(worst_log_level, WARNING)
        self.assertEqual(joined_summary, failure_summary)


def record(action, **fields):
    fields.setdefault("time", 1000)
    fields.setdefault("source", "harness")
    return json.dumps({"action": action, **fields})


def console_record(message, created=1.5):
    return logging.makeLogRecord({
        "msg": message,
        "levelno": logging.ERROR,
        "levelname": "ERROR",
        "created": created,
    })


class TestStructuredOutputParserSummary(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(suffix=".mozharness")
        self.summary = os.path.join(self.dir, "summary.jsonl")
        self.stream = io.StringIO()
        # The console format mozharness scripts use in CI (BaseScript.new_log_obj).
        self.log_obj = log.ConsoleLogger(
            log_level="info",
            log_dir=self.dir,
            log_format="%(asctime)s %(levelname)8s - %(message)s",
        )
        self.log_obj.all_handlers[0].setStream(self.stream)

    def tearDown(self):
        self.log_obj._clear_handlers()
        shutil.rmtree(self.dir, ignore_errors=True)

    def make_parser(self, error_list=(), **kwargs):
        return TestParser(
            config={}, log_obj=self.log_obj, error_list=list(error_list), **kwargs
        )

    def error_lines(self):
        return [r for r in self.read_summary() if r["action"] == "error_line"]

    def console_lines(self):
        return self.stream.getvalue().splitlines()

    def assert_on_console(self, message):
        self.assertTrue(any(message in line for line in self.console_lines()))

    def read_summary(self):
        with open(self.summary, encoding="utf-8") as fh:
            return [json.loads(line) for line in fh]

    def feed(self, parser, *lines):
        for line in lines:
            parser.parse_single_line(line)

    def test_summary_keeps_the_testsummary_records(self):
        parser = self.make_parser(test_summary_file=self.summary)
        self.feed(
            parser,
            record("suite_start", tests={"default": ["t1"]}),
            record("group_start", name="dir"),
            record("test_start", test="t1"),
            record(
                "test_status",
                test="t1",
                subtest="sub",
                status="FAIL",
                expected="PASS",
                message="boom",
            ),
            record("test_status", test="t1", subtest="ok", status="PASS"),
            record("log", level="INFO", message="noise"),
            record(
                "crash",
                process="1234",
                signature="sig",
                test="t1",
                stack="frame 0\nframe 1",
            ),
            record("test_end", test="t1", status="OK", time=1500),
            record("group_end", name="dir"),
            record("suite_end", time=2000),
        )
        parser.finish()

        errors = self.error_lines()
        summary = [r for r in self.read_summary() if r["action"] != "error_line"]
        self.assertEqual(
            [r["action"] for r in summary],
            [
                "suite_start",
                "group_start",
                "test_start",
                "test_status",
                "crash",
                "test_end",
                "group_end",
                "suite_end",
            ],
        )
        self.assertEqual([r["time"] for r in summary][-3:], [1500, 1000, 2000])
        # The unexpected status and the crash are the Treeherder error lines.
        self.assertEqual(
            [e["message"].split(" | ")[0] for e in errors],
            ["TEST-UNEXPECTED-FAIL", "PROCESS-CRASH"],
        )
        for r in summary:
            self.assertNotIn("source", r)
        console = "\n".join(self.console_lines())
        for text in ("TEST-START | t1", "TEST-UNEXPECTED-FAIL | t1 | sub - boom"):
            self.assertIn(text, console)

    def test_unstructured_lines_are_not_recorded(self):
        parser = self.make_parser(test_summary_file=self.summary)
        self.feed(
            parser,
            record("test_start", test="t1"),
            "not json",
            record("test_start", test="t2"),
        )
        parser.finish()

        self.assertEqual([r["test"] for r in self.read_summary()], ["t1", "t2"])
        self.assertIn("not json", self.console_lines()[-2])

    def test_runs_append_to_the_same_summary(self):
        first = self.make_parser(test_summary_file=self.summary)
        self.feed(first, record("test_start", test="t1"))
        first.finish()
        second = self.make_parser(test_summary_file=self.summary)
        self.feed(second, record("test_start", test="t2"))
        second.finish()

        self.assertEqual([r["test"] for r in self.read_summary()], ["t1", "t2"])

    def test_no_summary_without_a_file(self):
        parser = self.make_parser()
        self.feed(parser, record("test_start", test="t1"))
        parser.finish()

        self.assertFalse(os.path.exists(self.summary))
        self.assertIn("TEST-START | t1", self.console_lines()[-1])

    def test_summary_is_written_without_a_logger(self):
        parser = TestParser(test_summary_file=self.summary)
        self.feed(parser, record("test_start", test="t1"))
        parser.finish()

        self.assertEqual([r["test"] for r in self.read_summary()], ["t1"])

    def test_error_line_follows_its_record(self):
        parser = self.make_parser(test_summary_file=self.summary)
        self.feed(
            parser,
            record("test_start", test="t1"),
            record(
                "test_status",
                test="t1",
                subtest="sub",
                status="FAIL",
                expected="PASS",
                message="boom",
            ),
            record("test_status", test="t1", subtest="ok", status="PASS"),
        )
        parser.finish()

        summary = self.read_summary()
        self.assertEqual(
            [r["action"] for r in summary], ["test_start", "test_status", "error_line"]
        )
        error = summary[-1]
        self.assertEqual(set(error), {"action", "time", "level", "message"})
        self.assertEqual(error["level"], "INFO")
        self.assertEqual(error["message"], "TEST-UNEXPECTED-FAIL | t1 | sub - boom")
        self.assertIsInstance(error["time"], int)
        self.assert_on_console(error["message"])

    def test_error_lines_apply_treeherder_selection(self):
        parser = self.make_parser(test_summary_file=self.summary)
        gecko = "GECKO(1)"
        self.feed(
            parser,
            record(
                "process_output",
                process=gecko,
                data="[2] Assertion failure: x, at a.cpp:1",
            ),
            record("process_output", process=gecko, data="#01: f [a.cpp:1]"),
            record(
                "process_output",
                process=gecko,
                data="[2] Hit MOZ_CRASH(boom) at b.cpp:2",
            ),
            record("process_output", process=gecko, data="TEST-PASS | t1 | ok"),
            record("log", level="ERROR", message="harness exploded"),
            record(
                "log",
                level="ERROR",
                message="A content process crashed and MOZ_CRASHREPORTER_SHUTDOWN "
                "is set, shutting down",
            ),
            record("log", level="INFO", message="TEST-UNEXPECTED-WARNING | t1 | meh"),
        )
        parser.finish()

        self.assertEqual(
            [(e["level"], e["message"]) for e in self.error_lines()],
            [
                ("INFO", "GECKO(1) | [2] Assertion failure: x, at a.cpp:1"),
                ("INFO", "GECKO(1) | [2] Hit MOZ_CRASH(boom) at b.cpp:2"),
                ("ERROR", "harness exploded"),
            ],
        )
        for error in self.error_lines():
            self.assert_on_console(error["message"])

    def test_error_line_message_is_right_stripped(self):
        parser = self.make_parser(test_summary_file=self.summary)
        self.feed(
            parser,
            record("crash", process="1234", signature="sig", test="t1 "),
            record("log", level="ERROR", message="trailing "),
        )
        parser.finish()

        self.assertEqual(
            [e["message"] for e in self.error_lines()],
            ["PROCESS-CRASH | application crashed [sig] | t1", "trailing"],
        )

    def test_identical_consecutive_error_lines_are_kept_once(self):
        parser = self.make_parser(test_summary_file=self.summary)
        same = console_record("same")
        other = console_record("other")
        a_second_later = console_record("same", created=2.5)
        parser._ensure_observing()
        for logged in (same, same, other, same, a_second_later):
            parser._observe_console_line(logged)
        parser.finish()

        self.assertEqual(
            [e["message"] for e in self.error_lines()],
            ["same", "other", "same", "same"],
        )
        self.assertEqual(self.error_lines()[0]["time"], 1500)

    def test_finish_forgets_the_previous_error_line(self):
        parser = self.make_parser(test_summary_file=self.summary)
        same = console_record("same")
        parser._ensure_observing()
        parser._observe_console_line(same)
        parser.finish()
        parser._ensure_observing()
        parser._observe_console_line(same)
        parser.finish()

        self.assertEqual([e["message"] for e in self.error_lines()], ["same", "same"])

    def test_unstructured_error_line_is_written_immediately(self):
        parser = self.make_parser(
            error_list=[{"substr": "TEST-UNEXPECTED", "level": ERROR}],
            strict=False,
            test_summary_file=self.summary,
        )
        self.feed(parser, "TEST-UNEXPECTED-FAIL | t1 | boom", "harmless line")

        errors = self.error_lines()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["level"], "ERROR")
        self.assertEqual(errors[0]["message"], " TEST-UNEXPECTED-FAIL | t1 | boom")
        self.assert_on_console(errors[0]["message"])
        parser.finish()

    def test_lines_logged_outside_the_parser_are_captured(self):
        parser = self.make_parser(test_summary_file=self.summary)
        self.feed(parser, record("test_start", test="t1"))
        self.log_obj.log_message(
            "command timed out: 1800 seconds without output", level=ERROR
        )
        self.log_obj.log_message("Return code: 0")
        parser.finish()

        summary = self.read_summary()
        self.assertEqual([r["action"] for r in summary], ["test_start", "error_line"])
        self.assertEqual(summary[1]["level"], "ERROR")
        self.assertEqual(
            summary[1]["message"], "command timed out: 1800 seconds without output"
        )

    def test_observer_resumes_after_finish(self):
        parser = self.make_parser(test_summary_file=self.summary)
        self.feed(parser, record("log", level="ERROR", message="first run"))
        parser.finish()
        self.log_obj.log_message("between runs", level=ERROR)
        self.feed(parser, record("log", level="ERROR", message="second run"))
        parser.finish()

        self.assertEqual(
            [e["message"] for e in self.error_lines()], ["first run", "second run"]
        )

    def test_no_observer_without_a_summary_file(self):
        parser = self.make_parser()
        self.assertIsNone(parser._console_line_handler)
        self.log_obj.log_message("not recorded", level=ERROR)
        parser.finish()

        self.assertFalse(os.path.exists(self.summary))

    def test_finish_stops_observing(self):
        parser = self.make_parser(test_summary_file=self.summary)
        self.feed(parser, record("test_start", test="t1"))
        observer = parser._console_line_handler
        self.assertIn(observer, self.log_obj.logger.handlers)
        parser.finish()
        self.log_obj.log_message("too late", level=ERROR)

        self.assertNotIn(observer, self.log_obj.logger.handlers)
        self.assertEqual(self.error_lines(), [])

    def test_nothing_is_observed_before_the_first_line(self):
        parser = self.make_parser(test_summary_file=self.summary)
        self.log_obj.log_message("before the run", level=ERROR)

        self.assertIsNone(parser._console_line_handler)
        self.assertFalse(os.path.exists(self.summary))

    def test_lines_logged_outside_parsing_are_written_at_once(self):
        parser = self.make_parser(test_summary_file=self.summary)
        self.feed(parser, record("test_start", test="t1"))
        self.log_obj.log_message("command timed out: 1800 seconds", level=ERROR)

        self.assertEqual(
            [e["message"] for e in self.error_lines()],
            ["command timed out: 1800 seconds"],
        )
        parser.finish()

    def test_fatal_line_is_kept(self):
        parser = self.make_parser(test_summary_file=self.summary)
        self.feed(parser, record("test_start", test="t1"))
        with self.assertRaises(SystemExit):
            self.log_obj.log_message("boom", level=FATAL)

        self.assertEqual(
            [(e["level"], e["message"]) for e in self.error_lines()],
            [("FATAL", "boom"), ("FATAL", "Exiting -1")],
        )
        parser.finish()

    def test_evaluation_lines_are_kept_without_harness_output(self):
        parser = self.make_parser(test_summary_file=self.summary)
        parser.evaluate_parser(0)
        parser.finish()

        self.assertEqual(
            [(e["level"], e["message"]) for e in self.error_lines()],
            [
                ("ERROR", "No suite end message was emitted by this harness."),
                ("ERROR", "No checks run."),
            ],
        )


if __name__ == "__main__":
    mozunit.main()
