#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.
"""does_it_crash.py

Runs a thing to see if it crashes within a set period.
"""

import argparse
import logging
import os
import signal
import subprocess
import sys

import mozinstall
import mozprocess
import requests

log = logging.getLogger(__name__)


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--thing-url",
        required=True,
        help="An URL that points to a package containing the thing to run",
    )
    parser.add_argument(
        "--thing-to-run",
        required=True,
        help="The thing to run. If --thing-url is a package, this should be "
        "its location relative to the root of the package.",
    )
    parser.add_argument(
        "--thing-arg",
        action="append",
        dest="thing_args",
        default=[],
        help="Args for the thing. May be passed multiple times",
    )
    parser.add_argument(
        "--run-for",
        default=30,
        type=int,
        help="How long to run the thing for, in seconds",
    )
    return parser.parse_args(argv)


def download_file(url, file_name):
    req = requests.get(url, stream=True, timeout=30)
    file_path = os.path.join(os.getcwd(), file_name)

    with open(file_path, "wb") as f:
        for chunk in req.iter_content(chunk_size=1024):
            if not chunk:
                continue
            f.write(chunk)
            f.flush()
    return file_path


def download(url):
    fn = "thing." + url.split(".")[-1]
    download_file(url=url, file_name=fn)
    if mozinstall.is_installer(fn):
        return mozinstall.install(fn, "thing")
    return ""


def kill(proc):
    is_win = os.name == "nt"
    for retry in range(3):
        if is_win:
            proc.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(proc.pid, signal.SIGKILL)
        try:
            proc.wait(5)
            log.info("process terminated")
            break
        except subprocess.TimeoutExpired:
            log.error("unable to terminate process!")


def run_thing(install_dir, thing_to_run, thing_args, timeout):
    timed_out = False
    output = []

    def timeout_handler(proc):
        nonlocal timed_out
        log.info(f"timeout detected: killing pid {proc.pid}")
        timed_out = True
        kill(proc)

    def output_line_handler(proc, line):
        output.append(line)

    thing = os.path.abspath(os.path.join(install_dir, thing_to_run))

    log.info(f"Running {thing} with args {thing_args}")
    cmd = [thing]
    cmd.extend(thing_args)
    mozprocess.run_and_wait(
        cmd,
        timeout=timeout,
        timeout_handler=timeout_handler,
        output_line_handler=output_line_handler,
    )
    if not timed_out:
        # It crashed, oh no!
        log.critical(f"TEST-UNEXPECTED-FAIL: {thing} did not run for {timeout} seconds")
        log.critical("Output was:")
        for l in output:
            log.critical(l)
        return False
    log.info(f"PASS: {thing} ran successfully for {timeout} seconds")
    return True


def main(argv=None):
    logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")
    args = parse_args(argv)
    install_dir = download(args.thing_url)
    if run_thing(install_dir, args.thing_to_run, args.thing_args, args.run_for):
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
