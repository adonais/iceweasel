# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Logging for the backward compatibility harness."""

from __future__ import annotations

import sys

import mozlog
import mozlog.commandline

LOGGER_NAME = "devtools-compat"

_logger = None


def _get_logger():
    global _logger
    if _logger is None:
        # ./mach devtools-compat-test configures the logger but CI entry point
        # does not, so set up mach formatting here.
        _logger = mozlog.get_default_logger(LOGGER_NAME) or (
            mozlog.commandline.setup_logging(LOGGER_NAME, {}, {"mach": sys.stdout})
        )
    return _logger


def log(message: str) -> None:
    _get_logger().info(message)
