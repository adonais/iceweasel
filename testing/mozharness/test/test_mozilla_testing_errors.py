import mozunit
import pytest
from mozharness.mozilla.testing.errors import TreeherderErrorParser


@pytest.mark.parametrize(
    "level,message,expected",
    (
        ("ERROR", "anything at error level", True),
        ("CRITICAL", "anything", True),
        ("FATAL", "anything", True),
        ("INFO", "TEST-UNEXPECTED-FAIL | t | boom", True),
        ("INFO", " TEST-UNEXPECTED-FAIL | t | boom", True),
        ("WARNING", "TEST-UNEXPECTED-FAIL | t | boom", True),
        ("INFO", "GECKO(1) | [2] Assertion failure: x, at a.cpp:1", True),
        ("INFO", "PID 3 | [2] Hit MOZ_CRASH(boom) at a.cpp:1", True),
        ("INFO", "PROCESS-CRASH | t | application crashed [@ f]", True),
        ("INFO", "command timed out: 1800 seconds without output", True),
        (
            "INFO",
            "GECKO(1) | [Parent 2, Main Thread] ###!!! ABORT: x: 'y', file a.cpp:1",
            True,
        ),
        ("INFO", "KeyError: 'x'", True),
        ("INFO", "  KeyError: 'x'", True),
        ("INFO", "[  FAILED  ] Foo.Bar", True),
        ("INFO", "a.cpp:12: error: boom", True),
        ("INFO", "TEST-PASS | t | ok", False),
        ("INFO", "TEST-INFO | expected FAIL", False),
        (
            "ERROR",
            "GECKO(1) | A content process crashed and "
            "MOZ_CRASHREPORTER_SHUTDOWN is set, shutting down",
            False,
        ),
        ("INFO", "TEST-UNEXPECTED-WARNING | t | meh", False),
        ("INFO", " TEST-UNEXPECTED-WARNING | t | meh", False),
        (
            "INFO",
            "GECKO(1) | [Parent 2, Main Thread] ###!!! ASSERTION: x: 'y', file a.cpp:1",
            False,
        ),
        ("INFO", "TEST-START | t", False),
        ("INFO", "GECKO(1) | Assertion failure", False),
        ("INFO", "GECKO(1) | Assertion failure  ", False),
        ("INFO", "non-fatal error in foo", False),
        ("INFO", "TimeoutException: x", False),
    ),
)
def test_is_error_line(level, message, expected):
    assert TreeherderErrorParser().is_error_line(level, message) is expected


if __name__ == "__main__":
    mozunit.main()
