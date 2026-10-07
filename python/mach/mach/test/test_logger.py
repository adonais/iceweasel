# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import io
import logging
import time
import unittest

from mozunit import main

from mach.logging import LoggingManager, StructuredHumanFormatter


class DummyLogger(logging.Logger):
    def __init__(self, cb):
        logging.Logger.__init__(self, "test")

        self._cb = cb

    def handle(self, record):
        self._cb(record)


class TestStructuredHumanFormatter(unittest.TestCase):
    def test_non_ascii_logging(self):
        # Ensures the formatter doesn't choke when non-ASCII characters are
        # present in printed parameters.
        formatter = StructuredHumanFormatter(time.time())

        def on_record(record):
            result = formatter.format(record)
            relevant = result[9:]

            self.assertEqual(relevant, "Test: s\xe9curit\xe9")

        logger = DummyLogger(on_record)

        value = "s\xe9curit\xe9"

        logger.log(
            logging.INFO,
            "Test: {utf}",
            extra={"action": "action", "params": {"utf": value}},
        )


class TestLoggingManager(unittest.TestCase):
    def test_enable_all_structured_loggers_after_enable_unstructured(self):
        # enable_all_structured_loggers() removes the terminal handler from
        # the structured loggers and only keeps it on the root logger. Loggers
        # whose propagation enable_unstructured() disabled must propagate
        # again, otherwise their messages are lost, while a logger that never
        # propagated is left alone.
        manager = LoggingManager()
        stream = io.StringIO()
        manager.add_terminal_logging(fh=stream, write_times=False)
        root_logger = logging.getLogger()
        self.addCleanup(root_logger.removeHandler, manager.terminal_handler)

        mach_logger = logging.getLogger("mach")
        quiet_logger = logging.getLogger("mach.test.quiet")
        quiet_logger.propagate = False
        manager.register_structured_logger(quiet_logger)

        manager.enable_unstructured()
        self.assertFalse(mach_logger.propagate)

        manager.enable_all_structured_loggers()
        self.assertTrue(mach_logger.propagate)
        self.assertFalse(quiet_logger.propagate)

        logging.getLogger("mach.test.child").log(
            logging.WARNING,
            "{count} warnings present.",
            extra={"action": "test", "params": {"count": 3}},
        )
        self.assertEqual(stream.getvalue(), "3 warnings present.\n")


if __name__ == "__main__":
    main()
