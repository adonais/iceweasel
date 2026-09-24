# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import json
import os
import pathlib
import platform
import shutil
import signal
import sys
import time

import mozprocess

from mozperftest.layers import Layer
from mozperftest.utils import ON_TRY, archive_folder, temp_dir

# How many lines of the script's output are kept to report the error it failed
# with, and the markers used to find that error in them.
OUTPUT_TAIL_SIZE = 50
TRACEBACK_HEADER = "Traceback (most recent call last):"
CHAINED_ERROR_MARKERS = (
    "During handling of the above exception, another exception occurred:",
    "The above exception was the direct cause of the following exception:",
)


class UnknownScriptError(Exception):
    """Triggered when an unknown script type is encountered."""

    pass


class ScriptFailedError(Exception):
    """Triggered when the script exits with a non-zero return code."""

    pass


class ScriptTimeoutError(Exception):
    """Triggered when the script hits the process or the output timeout."""

    pass


class ShellScriptData:
    SUBMETRICS_SUFFIX = "_submetrics"

    def open_data(self, data):
        return {
            "name": "shellscript",
            "subtest": data["name"],
            "data": [
                {"file": "custom", "value": value, "xaxis": xaxis}
                for xaxis, value in enumerate(data["values"])
            ],
            "shouldAlert": data.get("shouldAlert", True),
            "unit": data.get("unit", "ms"),
            "lowerIsBetter": data.get("lowerIsBetter", True),
            "alertSeverity": data.get("alertSeverity"),
        }

    def transform(self, data):
        return data

    merge = transform

    def summary(self, suite):
        """Use the primary submetric's value as the grouped suite summary.

        Submetric suites are named `<primary>_submetrics` and gather a set of
        related measurements as subtests, one of which (named `<primary>`) is
        the representative value for the group. Reporting that subtest's value
        as the suite summary keeps the grouped suite anchored to a single,
        meaningful number. Returns None for regular suites so the default
        summary (mean of the subtests) applies.

        Only available in the Perfherder layer.
        """
        if not suite["name"].endswith(self.SUBMETRICS_SUFFIX):
            return None
        primary_name = suite["name"][: -len(self.SUBMETRICS_SUFFIX)]
        for subtest in suite["subtests"]:
            if subtest["name"] == primary_name:
                return subtest["value"]
        return None


class ShellScriptRunner(Layer):
    """
    This is a layer that can be used to run custom shell scripts. They
    are expected to produce a log message prefixed with `perfMetrics` and
    contain the data from the test.
    """

    name = "shell-script"
    activated = True
    arguments = {
        "output-timeout": {
            "default": 120,
            "help": "Output timeout for the script, or how long to wait for a log message.",
        },
        "process-timeout": {
            "default": 600,
            "help": "Process timeout for the script, or the max run time.",
        },
    }

    def __init__(self, env, mach_cmd):
        super().__init__(env, mach_cmd)
        self.metrics = []
        self.timed_out = False
        self.output_timed_out = False
        self.output_tail = []

    def kill(self, proc):
        if "win" in platform.system().lower():
            proc.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()

    def parse_metrics(self):
        parsed_metrics = []
        for metrics in self.metrics:
            prepared_metrics = (
                metrics
                .replace("perfMetrics:", "")
                .replace("{{", "{")
                .replace("}}", "}")
                .strip()
            )

            metrics_json = json.loads(prepared_metrics)
            if isinstance(metrics_json, list):
                parsed_metrics.extend(metrics_json)
            else:
                parsed_metrics.append(metrics_json)

        return parsed_metrics

    def script_error(self):
        """Returns the error the script failed with, from its output.

        The complete traceback is returned when the script failed with one,
        including any exception it was chained to. Otherwise, the tail of the
        output is returned since the failure may come from the shell script
        itself, or from any of the commands it ran, rather than from python.
        """
        lines = list(self.output_tail)
        headers = [
            ind for ind, line in enumerate(lines) if line.startswith(TRACEBACK_HEADER)
        ]

        start = 0
        if headers:
            start = headers[-1]
            for header in reversed(headers[:-1]):
                if not any(
                    line.startswith(CHAINED_ERROR_MARKERS)
                    for line in lines[header:start]
                ):
                    break
                start = header

        return "\n".join(lines[start:])

    def script_summary(self):
        """Returns a one line summary of the error the script failed with.

        Log parsers only keep single lines, so the error the script died on
        has to sit on the first line of the failure, otherwise it gets grouped
        on a message that says nothing about what actually went wrong.
        """
        lines = list(self.output_tail)
        headers = [
            ind for ind, line in enumerate(lines) if line.startswith(TRACEBACK_HEADER)
        ]

        # The traceback is indented and the exception it ends on is not,
        # the first unindented line after the last header is the error
        if headers:
            for line in lines[headers[-1] + 1 :]:
                if line and not line.startswith((" ", "\t")):
                    return line

        for line in reversed(lines):
            if line.strip():
                return line

        return "no output"

    def line_handler_wrapper(self):
        """This function is used to gather the perfMetrics logs."""

        def _line_handler(proc, line):
            # NOTE: this hack is to workaround encoding issues on windows
            # a newer version of browsertime adds a `σ` character to output
            line = line.replace(b"\xcf\x83", b"")

            line = line.decode("utf-8")
            if "perfMetrics" in line:
                self.metrics.append(line)
            self.output_tail.append(line.rstrip())
            del self.output_tail[:-OUTPUT_TAIL_SIZE]

            # Bug 1900056 - Use a different logger in mozperftest because the current
            # one can't handle messages with curly braces or JSONs in them
            print(line.strip())

        return _line_handler

    def run(self, metadata):
        test = metadata.script

        cmd = []
        if test["filename"].endswith(".sh"):
            cmd = ["bash", test["filename"]]
        else:
            raise UnknownScriptError(
                "Only `.sh` (bash) scripts are currently implemented."
            )

        def timeout_handler(proc):
            self.timed_out = True
            self.error("Process timed out")
            self.kill(proc)

        def output_timeout_handler(proc):
            self.output_timed_out = True
            self.error("Process output timed out")
            self.kill(proc)

        with temp_dir() as testing_dir:
            os.environ["APP"] = self.get_arg("app")
            os.environ["TESTING_DIR"] = testing_dir
            os.environ["BROWSER_BINARY"] = metadata.binary
            os.environ["PYTHON_PATH_SHELL_SCRIPT"] = sys.executable

            # Setup a python packages path for python scripts. This is required since
            # the sys.path modifications made by mozperftest don't get propagated
            # to the scripts. Furthermore, PYTHONPATH can't be used here since it
            # gets overrided by something like a ._pth file somewhere along the way.
            venv_site_lib = str(
                pathlib.Path(
                    self.mach_cmd.virtualenv_manager.bin_path, "..", "lib"
                ).resolve()
            )
            venv_site_packages = pathlib.Path(
                venv_site_lib,
                f"python{sys.version_info.major}.{sys.version_info.minor}",
                "site-packages",
            )
            if not venv_site_packages.exists():
                venv_site_packages = pathlib.Path(
                    venv_site_lib,
                    "site-packages",
                )
            os.environ["PYTHON_PACKAGES"] = str(venv_site_packages)

            proc = mozprocess.run_and_wait(
                cmd,
                output_line_handler=self.line_handler_wrapper(),
                env=os.environ,
                timeout=self.get_arg("process-timeout"),
                timeout_handler=timeout_handler,
                output_timeout=self.get_arg("output-timeout"),
                output_timeout_handler=output_timeout_handler,
                text=False,
            )

            if self.get_arg("output"):
                if ON_TRY:
                    # In CI, make an archive of the files and upload those
                    archive_folder(
                        pathlib.Path(testing_dir),
                        pathlib.Path(self.get_arg("output")),
                        archive_name=test["name"],
                    )
                else:
                    output_dir = pathlib.Path(
                        self.get_arg("output"),
                        test["name"],
                        f"run-{str(time.time()).split('.')[0]}",
                    )
                    self.info(f"Copying testing directory to {output_dir}")
                    shutil.copytree(testing_dir, output_dir)
                    self.env.set_arg("output", output_dir)

        if self.timed_out:
            raise ScriptTimeoutError(
                f"{test['name']} timed out after "
                f"{self.get_arg('process-timeout')}s, last output was:\n"
                f"{self.script_error()}"
            )
        if self.output_timed_out:
            raise ScriptTimeoutError(
                f"{test['name']} produced no output for "
                f"{self.get_arg('output-timeout')}s, last output was:\n"
                f"{self.script_error()}"
            )
        if proc.returncode != 0:
            raise ScriptFailedError(
                f"{test['name']} failed with return code {proc.returncode}: "
                f"{self.script_summary()}\n{self.script_error()}"
            )

        # Route each metric to a suite based on its optional `suite` tag,
        # defaulting to the test name. Grouping the submetrics and computing a
        # suite summary value is left to the metrics layer (see ShellScriptData),
        # keeping this layer focused on running the test and reporting raw data.
        default_suite = test["name"]
        suites = {}
        for m in self.parse_metrics():
            suite_name = m.pop("suite", default_suite)
            suites.setdefault(suite_name, []).append(m)

        for suite_name, suite_metrics in suites.items():
            metadata.add_result({
                "name": suite_name,
                "framework": {"name": "mozperftest"},
                "transformer": "mozperftest.test.shellscript:ShellScriptData",
                "shouldAlert": True,
                "results": suite_metrics,
            })

        return metadata
