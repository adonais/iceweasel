# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import subprocess
import threading
import time
from queue import Empty, Queue


def run_and_wait(
    args=None,
    cwd=None,
    env=None,
    text=True,
    timeout=None,
    timeout_handler=None,
    output_timeout=None,
    output_timeout_handler=None,
    output_line_handler=None,
):
    """
    Run a process and wait for it to complete, with optional support for
    line-by-line output handling and timeouts.

    On timeout or output timeout, the callback should kill the process;
    many clients use  mozcrash.kill_and_get_minidump() in the timeout
    callback.

    run_and_wait is not intended to be a generic replacement for subprocess.
    Clients requiring different options or behavior should use subprocess
    directly.

    :param args: command to run. May be a string or a list.
    :param cwd: working directory for command.
    :param env: environment to use for the process (defaults to os.environ).
    :param text: open streams in text mode if True; else use binary mode.
    :param timeout: seconds to wait for process to complete before calling timeout_handler
    :param timeout_handler: function to be called if timeout reached
    :param output_timeout: seconds to wait for process to generate output
    :param output_timeout_handler: function to be called if output_timeout is reached
    :param output_line_handler: function to be called for every line of process output
    """
    is_win = os.name == "nt"

    if env is None:
        env = os.environ.copy()

    if is_win:
        kwargs = {
            "creationflags": subprocess.CREATE_NEW_PROCESS_GROUP,
        }
    else:
        kwargs = {
            "preexec_fn": os.setsid,
        }

    deadline = None if timeout is None else time.monotonic() + timeout

    queue = Queue()

    def get_line():
        nonlocal pending_handler
        queue_timeout = pending_handler = None
        if not reader_thread.is_alive():
            return queue.get()
        if deadline is not None:
            queue_timeout = deadline - time.monotonic()
            pending_handler = timeout_handler
            if queue_timeout <= 0:
                return None
        if output_timeout and (queue_timeout is None or output_timeout < queue_timeout):
            queue_timeout = output_timeout
            pending_handler = output_timeout_handler
        try:
            return queue.get(timeout=queue_timeout)
        except Empty:
            return None

    proc = subprocess.Popen(
        args,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=text,
        errors="replace" if text else None,
        **kwargs,
    )

    def reader(fh, queue):
        try:
            for line in iter(fh.readline, "" if text else b""):
                queue.put(line)
        finally:
            # Give a chance to the reading loop to exit without a timeout.
            queue.put(b"")

    reader_thread = threading.Thread(
        name="reader",
        target=reader,
        args=(
            proc.stdout,
            queue,
        ),
        daemon=True,
    )
    reader_thread.start()

    for line in iter(get_line, b""):
        if line is None:
            break
        if output_line_handler:
            output_line_handler(proc, line)
        else:
            print(line)
    else:
        pending_handler = None
        try:
            proc.wait(None if deadline is None else max(0, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            pending_handler = timeout_handler
    if pending_handler:
        pending_handler(proc)

    return proc
