import json

import pytest
from mozlog.formatters import TestSummaryFormatter

# flake8: noqa


@pytest.mark.parametrize(
    "record,kept",
    (
        pytest.param(
            {"action": "log", "level": "INFO", "message": "noise"},
            False,
            id="log_info_dropped",
        ),
        pytest.param(
            {"action": "log", "level": "ERROR", "message": "boom"},
            True,
            id="log_error_kept",
        ),
        pytest.param(
            {"action": "log", "level": "CRITICAL", "message": "crit"},
            True,
            id="log_critical_kept",
        ),
        pytest.param(
            {"action": "log", "level": "WARNING", "message": "warn"},
            False,
            id="log_warning_dropped",
        ),
        pytest.param(
            {"action": "log", "level": "DEBUG", "message": "dbg"},
            False,
            id="log_debug_dropped",
        ),
        pytest.param(
            {"action": "suite_start", "tests": {"manifestA": ["test_foo"]}},
            True,
            id="suite_start_kept",
        ),
        pytest.param({"action": "suite_end"}, True, id="suite_end_kept"),
        pytest.param(
            {"action": "assertion_count", "count": 3},
            False,
            id="assertion_count_dropped",
        ),
        pytest.param(
            {"action": "lsan_leak", "frames": []}, False, id="lsan_leak_dropped"
        ),
        pytest.param(
            {"action": "lsan_summary", "allocated_bytes": 10},
            False,
            id="lsan_summary_dropped",
        ),
        pytest.param(
            {"action": "process_exit", "process": 1234, "exitcode": 0},
            False,
            id="process_exit_dropped",
        ),
        pytest.param(
            {"action": "process_start", "process": 1234},
            False,
            id="process_start_dropped",
        ),
        pytest.param(
            {"action": "tsan_error", "stack": "race"}, False, id="tsan_error_dropped"
        ),
        pytest.param(
            {"action": "group_start", "name": "manifestA"}, True, id="group_start_kept"
        ),
        pytest.param(
            {"action": "group_end", "name": "manifestA"}, True, id="group_end_kept"
        ),
        pytest.param(
            {"action": "test_start", "test": "test_foo", "group": "manifestA"},
            True,
            id="test_start_kept",
        ),
        pytest.param(
            {"action": "test_end", "test": "test_foo", "status": "OK"},
            True,
            id="test_end_kept",
        ),
        pytest.param(
            {
                "action": "test_status",
                "test": "test_foo",
                "subtest": "subtest1",
                "status": "FAIL",
                "expected": "PASS",
            },
            True,
            id="test_status_unexpected_kept",
        ),
        pytest.param(
            {
                "action": "test_status",
                "test": "test_foo",
                "subtest": "subtest1",
                "status": "PASS",
            },
            False,
            id="test_status_no_expected_dropped",
        ),
        pytest.param(
            {
                "action": "test_status",
                "test": "test_foo",
                "subtest": "subtest1",
                "status": "PASS",
                "expected": "PASS",
            },
            False,
            id="test_status_matching_expected_dropped",
        ),
        pytest.param(
            {"action": "crash", "test": "test_foo", "signature": "sig"},
            True,
            id="crash_kept",
        ),
        pytest.param({"action": "shutdown"}, False, id="shutdown_dropped"),
        pytest.param(
            {
                "action": "process_output",
                "process": 1234,
                "command": "xpcshell",
                "data": "stdout chatter",
            },
            False,
            id="process_output_dropped",
        ),
        pytest.param(
            {
                "action": "mozleak_total",
                "process": "default",
                "bytes": 856,
                "threshold": 0,
                "objects": ["CondVar"],
            },
            True,
            id="mozleak_total_over_threshold_kept",
        ),
        pytest.param(
            {
                "action": "mozleak_total",
                "process": "tab",
                "bytes": 0,
                "threshold": 0,
                "objects": [],
            },
            False,
            id="mozleak_total_no_leak_dropped",
        ),
        pytest.param(
            {
                "action": "mozleak_total",
                "process": "gmplugin",
                "bytes": 20000,
                "threshold": 20000,
                "objects": ["nsFoo"],
            },
            False,
            id="mozleak_total_within_threshold_dropped",
        ),
        pytest.param(
            {
                "action": "mozleak_total",
                "process": "default",
                "bytes": None,
                "threshold": 0,
                "objects": [],
            },
            True,
            id="mozleak_total_missing_total_kept",
        ),
        pytest.param(
            {
                "action": "mozleak_total",
                "process": "tab",
                "bytes": None,
                "threshold": 0,
                "objects": [],
                "ignore_missing": True,
            },
            False,
            id="mozleak_total_ignored_missing_total_dropped",
        ),
        pytest.param(
            {
                "action": "mozleak_total",
                "process": "tab",
                "bytes": None,
                "threshold": 0,
                "objects": [],
                "induced_crash": True,
            },
            False,
            id="mozleak_total_induced_crash_dropped",
        ),
    ),
)
def test_testsummary_filters(record, kept):
    fmt = TestSummaryFormatter()
    out = fmt(record)
    if kept:
        assert out is not None
        assert out.endswith("\n")
    else:
        assert out is None or out == ""


def test_testsummary_strips_noise_fields():
    fmt = TestSummaryFormatter()
    record = {
        "action": "test_status",
        "time": 1780300269164,
        "thread": "Thread-11",
        "pid": None,
        "source": "xpcshell/head.js",
        "test": "xpcom/tests/unit/test_bug476919.js",
        "subtest": "run_test",
        "status": "FAIL",
        "expected": "PASS",
        "message": "[run_test : 25] force fail - false == true",
        "stack": "stack/trace\nlines",
        "js_source": "head.js",
        "minidump_path": "/tmp/foo.dmp",
        "crashing_thread_stack": "frame\nframe",
        "tests": {"manifestA": ["test_foo"]},
        "stackwalk_stdout": "...",
        "stackwalk_stderr": "...",
        "extra": {"key": "value"},
    }
    out = fmt(record)
    result = json.loads(out)
    for stripped in (
        "thread",
        "pid",
        "source",
        "extra",
        "tests",
        "stack",
        "js_source",
        "minidump_path",
        "crashing_thread_stack",
        "stackwalk_stdout",
        "stackwalk_stderr",
    ):
        assert stripped not in result
    assert result["action"] == "test_status"
    assert result["test"] == "xpcom/tests/unit/test_bug476919.js"
    assert result["status"] == "FAIL"
    assert result["expected"] == "PASS"


def test_testsummary_log_error_keeps_only_level_and_message():
    fmt = TestSummaryFormatter()
    message = (
        "TEST-UNEXPECTED-FAIL | LeakSanitizer leak at nsTimer, NS_NewTimer"
        " | netwerk/test/browser/browser.toml"
    )
    record = {
        "action": "log",
        "time": 1787844653959,
        "thread": "MainThread",
        "pid": 9594,
        "source": "mochitest",
        "level": "ERROR",
        "message": message,
    }
    out = fmt(record)
    result = json.loads(out)
    assert result == {
        "action": "log",
        "time": 1787844653959,
        "level": "ERROR",
        "message": message,
    }


def test_testsummary_mozleak_total_keeps_the_leak_fields():
    fmt = TestSummaryFormatter()
    objects = ["CondVar", "MozPromiseRefcountable", "Mutex", "nsThread"]
    scope = "browser/components/aiwindow/ui/test/browser/browser.toml"
    record = {
        "action": "mozleak_total",
        "time": 1789627855830,
        "thread": "MainThread",
        "pid": 1517,
        "source": "mochitest",
        "process": "default",
        "bytes": 856,
        "threshold": 0,
        "objects": objects,
        "scope": scope,
        "induced_crash": False,
        "ignore_missing": False,
    }
    out = fmt(record)
    result = json.loads(out)
    assert result == {
        "action": "mozleak_total",
        "time": 1789627855830,
        "process": "default",
        "bytes": 856,
        "threshold": 0,
        "objects": objects,
        "scope": scope,
        "induced_crash": False,
        "ignore_missing": False,
    }


def test_testsummary_crash_keeps_stack():
    fmt = TestSummaryFormatter()
    record = {
        "action": "crash",
        "test": "test_foo",
        "signature": "sig",
        "stack": "frame1\nframe2",
        "thread": "main",
        "pid": 1234,
    }
    out = fmt(record)
    result = json.loads(out)
    assert result["stack"] == "frame1\nframe2"
    assert "thread" not in result
    assert "pid" not in result


def test_testsummary_emits_test_start_and_end_separately():
    fmt = TestSummaryFormatter()
    out_start = fmt({"action": "test_start", "test": "test_foo", "time": 1000})
    result_start = json.loads(out_start)
    assert result_start["action"] == "test_start"
    assert result_start["time"] == 1000

    out_end = fmt({
        "action": "test_end",
        "test": "test_foo",
        "status": "OK",
        "time": 2000,
    })
    result_end = json.loads(out_end)
    assert result_end["action"] == "test_end"
    assert result_end["time"] == 2000
    assert result_end["test"] == "test_foo"
    assert result_end["status"] == "OK"


def test_testsummary_keeps_a_harness_abort_as_log_and_test_end():
    """
    A harness abort reaches the summary as an ERROR log line, but only the
    test_end RemoteProcessMonitor emits alongside it carries a status and the
    test it is attributed to.
    """
    fmt = TestSummaryFormatter()
    message = "application timed out after 370 seconds with no output"

    log_record = json.loads(
        fmt({
            "action": "log",
            "level": "ERROR",
            "message": f"TEST-UNEXPECTED-FAIL | test_foo | {message}",
        })
    )
    assert log_record["level"] == "ERROR"
    assert "test" not in log_record
    assert "status" not in log_record

    result = json.loads(
        fmt({
            "action": "test_end",
            "test": "test_foo",
            "status": "TIMEOUT",
            "expected": "PASS",
            "message": message,
            "source": "mozdevice",
        })
    )
    assert result["status"] == "TIMEOUT"
    assert result["test"] == "test_foo"
    assert result["message"] == message
    assert "source" not in result


if __name__ == "__main__":
    import mozunit

    mozunit.main()
