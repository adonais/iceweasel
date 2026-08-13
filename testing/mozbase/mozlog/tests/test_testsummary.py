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
            False,
            id="log_critical_dropped",
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
            True,
            id="test_status_no_expected_kept",
        ),
        pytest.param(
            {
                "action": "test_status",
                "test": "test_foo",
                "subtest": "subtest1",
                "status": "PASS",
                "expected": "PASS",
            },
            True,
            id="test_status_matching_expected_kept",
        ),
        pytest.param(
            {"action": "crash", "test": "test_foo", "signature": "sig"},
            True,
            id="crash_kept",
        ),
        pytest.param({"action": "shutdown"}, True, id="shutdown_kept"),
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
            {"action": "mozleak_total", "leak_total": 123},
            False,
            id="mozleak_total_dropped",
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
        "stackwalk_stdout",
        "stackwalk_stderr",
    ):
        assert stripped not in result
    assert result["action"] == "test_status"
    assert result["test"] == "xpcom/tests/unit/test_bug476919.js"
    assert result["stack"] == "stack/trace\nlines"


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


if __name__ == "__main__":
    import mozunit

    mozunit.main()
