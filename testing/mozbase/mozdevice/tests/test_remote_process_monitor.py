#!/usr/bin/env python

from unittest.mock import MagicMock

import mozunit
import pytest
from mozdevice import RemoteProcessMonitor


class FakeMessageLogger:
    """Stand-in for mochitest's MessageLogger, recording what it is handed."""

    def __init__(self, is_test_running=True):
        self.is_test_running = is_test_running
        self.messages = []

    def process_message(self, message):
        self.messages.append(message)


@pytest.fixture
def rpm():
    device = MagicMock()
    device.is_file.return_value = False
    return RemoteProcessMonitor(
        "org.mozilla.geckoview.test",
        device,
        MagicMock(),
        FakeMessageLogger(),
        "/sdcard/log.txt",
        "/sdcard/profile",
    )


def test_log_test_end_reports_a_structured_result(rpm):
    rpm.last_test_seen = "dom/media/test_autoplay.html"

    assert rpm.log_test_end("TIMEOUT", "application timed out") is True

    (message,) = rpm.message_logger.messages
    assert message["action"] == "test_end"
    assert message["status"] == "TIMEOUT"
    assert message["expected"] == "PASS"
    assert message["test"] == "dom/media/test_autoplay.html"
    assert message["message"] == "application timed out"


def test_log_test_end_is_skipped_when_no_test_is_running(rpm):
    rpm.message_logger.is_test_running = False
    rpm.last_test_seen = "dom/media/test_autoplay.html"

    assert rpm.log_test_end("TIMEOUT", "application timed out") is False
    assert rpm.message_logger.messages == []


def test_test_in_flight_is_none_before_any_test_starts(rpm):
    assert rpm.test_in_flight is None


def test_last_test_seen_keeps_the_test_name_after_it_ends(rpm):
    """The name must stay usable for crash attribution once the test finishes."""
    rpm.stdout_len = 0
    rpm.log_buffer = ""
    rpm.device.get_file.return_value = b"line\n"
    rpm.message_logger.write = lambda line: [
        {"action": "test_end", "test": "dom/media/test_autoplay.html"}
    ]

    rpm.read_stdout()

    assert rpm.last_test_seen == "dom/media/test_autoplay.html"
    assert rpm.test_in_flight == "dom/media/test_autoplay.html"


def test_suite_end_is_tracked_apart_from_the_test_name(rpm):
    rpm.stdout_len = 0
    rpm.log_buffer = ""
    rpm.device.get_file.return_value = b"line\n"
    rpm.message_logger.write = lambda line: [{"action": "suite_end"}]
    rpm.last_test_seen = "dom/media/test_autoplay.html"

    rpm.read_stdout()

    assert rpm.suite_finished is True
    assert rpm.last_test_seen == "dom/media/test_autoplay.html"


if __name__ == "__main__":
    mozunit.main()
