# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import os
import subprocess
import sys

from mach.decorators import Command, CommandArgument
from mozbuild.base import MozbuildObject
from mozbuild.nodeutil import find_node_executable

suites = [
    "aboutdebugging",
    "accessibility",
    "all",
    "application",
    "compatibility",
    "debugger",
    "framework",
    "netmonitor",
    "performance",
    "shared_components",
    "webconsole",
]


class DevToolsNodeTestRunner(MozbuildObject):
    """Run DevTools node tests."""

    def run_node_tests(self, suite=None, artifact=None):
        """Run the DevTools node test suites."""
        devtools_bin_dir = os.path.join(self.topsrcdir, "devtools", "client", "bin")
        test_runner_script = os.path.join(
            devtools_bin_dir, "devtools-node-test-runner.js"
        )

        if suite and suite not in suites:
            print(
                f"ERROR: Invalid suite '{suite}'. Valid suites are: {', '.join(suites)}"
            )
            return 1

        # Build the command to run
        node_binary, _ = find_node_executable()
        cmd = [node_binary, test_runner_script]

        # Add artifact argument if specified
        if artifact:
            cmd.append(f"--artifact={artifact}")

        # Add suite argument
        cmd.append(f"--suite={suite}")

        print(f"Running: {' '.join(cmd)}")
        print(f"Working directory: {devtools_bin_dir}")

        try:
            # Run the test runner from the devtools bin directory
            result = subprocess.run(cmd, cwd=devtools_bin_dir, check=False)
            return result.returncode
        except FileNotFoundError:
            print(
                "ERROR: Node.js not found. Please ensure Node.js is installed and in your PATH."
            )
            return 1
        except Exception as e:
            print(f"ERROR: Failed to run DevTools node tests: {e}")
            return 1


def create_parser_compat_test():
    """Build the devtools-compat-test parser.

    Mach resolves a callable ``parser`` only when the command is dispatched or
    its help is requested, which keeps the harness (and its mozbase
    dependencies) out of the import path of every other mach command.
    """
    import mozlog.commandline
    from backward_compat_test_server.session import SERVERS

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--server",
        default="local",
        choices=SERVERS,
        help="Firefox to run as the DevTools server.",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run the client and server without a visible window.",
    )
    mozlog.commandline.add_logging_group(parser)
    parser.add_argument(
        "extra_args",
        nargs=argparse.REMAINDER,
        help="Additional arguments forwarded to the mochitest harness.",
    )
    return parser


@Command(
    "devtools-compat-test",
    category="testing",
    description="Run the DevTools remote debugging backward compatibility tests.",
    parser=create_parser_compat_test,
    # adds devtools/client/aboutdebugging/test in the path for this virtualenv.
    virtualenv_name="devtools-compat-test",
)
def run_devtools_compat_test(
    command_context, server="local", headless=False, extra_args=None, **kwargs
):
    """Run the DevTools remote debugging backward compatibility tests."""
    import mozlog.commandline
    from backward_compat_test_server.logs import LOGGER_NAME
    from backward_compat_test_server.runner import run

    # Default to mach formatting rather than letting mozlog pick raw logs when
    # stdout is not a terminal. Pass --log-raw - to get them back.
    mozlog.commandline.setup_logging(LOGGER_NAME, kwargs, {"mach": sys.stdout})

    # Downloaded builds are cached in the state directory, so that they survive
    # clobbers and are shared between checkouts.
    cache_dir = os.path.join(
        command_context._mach_context.state_dir, "cache", "devtools-compat-test"
    )

    return run(
        topsrcdir=command_context.topsrcdir,
        binary=command_context.get_binary_path("app"),
        cache_dir=cache_dir,
        server=server,
        headless=headless,
        extra_args=extra_args,
    )


@Command(
    "devtools-node-test",
    category="testing",
    description="Run DevTools node tests",
    parser=argparse.ArgumentParser(),
)
@CommandArgument(
    "--suite",
    default="all",
    help=f"(optional) Test suite to run. Runs all suites when omitted. Available suites: {', '.join(suites)}",
)
@CommandArgument(
    "--artifact",
    help="Path to write test error artifacts as JSON. Useful for CI integration "
    "and error reporting.",
)
def run_devtools_node_test(command_context, suite=None, artifact=None, **kwargs):
    """Run DevTools node tests."""
    runner = DevToolsNodeTestRunner.from_environment(
        cwd=os.getcwd(), detect_virtualenv_mozinfo=False
    )

    return runner.run_node_tests(suite=suite, artifact=artifact)
