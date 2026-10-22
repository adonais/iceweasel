# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os
import sys
import threading
import time
from contextlib import contextmanager

_marker_lock = threading.Lock()


def _print_buildstatus(message, timestamp=None):
    with _marker_lock:
        sys.stdout.write(f"BUILDSTATUS {timestamp or time.time()} {message}\n")
        sys.stdout.flush()


@contextmanager
def build_marker(name, text, start=None, log=None):
    """Emit a marker spanning the ``with`` block for the resource usage profile.

    ``mach build`` runs commands with ``MACH`` set in the environment, and its
    resource monitor turns ``BUILDSTATUS`` lines they print on stdout into
    markers in the resource usage profile. This makes steps that happen within
    a single command, which can take a long time without emitting any output,
    visible there.

    ``name`` is a single token naming the step; ``text`` is free-form detail
    (e.g. a url or path). ``start`` optionally overrides the start time of the
    marker. When not running under ``mach build`` (or during a partial-tree
    build, where the monitor cannot reliably track markers), no marker is
    emitted. In all cases, if ``log`` is given, the duration of the step is
    logged at debug level.
    """
    start = start or time.time()
    emit = os.environ.get("MACH") and not os.environ.get("NO_BUILDSTATUS_MESSAGES")
    if emit:
        _print_buildstatus(f"START_{name} {text}", start)
    try:
        yield
    finally:
        end = time.time()
        if emit:
            _print_buildstatus(f"END_{name} {text}", end)
        if log:
            log(
                logging.DEBUG,
                "build_marker",
                {"name": name, "text": text, "elapsed": end - start},
                "{name} {text} took {elapsed:.3f}s",
            )
