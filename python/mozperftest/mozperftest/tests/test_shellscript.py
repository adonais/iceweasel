#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import pathlib
from unittest import mock

import mozunit
import pytest

from mozperftest.environment import TEST
from mozperftest.test.shellscript import (
    OUTPUT_TAIL_SIZE,
    TRACEBACK_HEADER,
    ScriptFailedError,
    ScriptTimeoutError,
    ShellScriptData,
    ShellScriptRunner,
    UnknownScriptError,
)
from mozperftest.tests.support import EXAMPLE_SHELL_TEST, get_running_env
from mozperftest.utils import temp_dir

FAILING_SCRIPT_OUTPUT = [
    b"Something went wrong, retrying image validation",
    b"Error we found in images: 0.9207113839487225",
    TRACEBACK_HEADER.encode(),
    b'  File "android_startup_videoapplink.py", line 434, in <module>',
    b"    ImageObject.validate_end_frame(nav_done_frame)",
    b"__main__.InvalidLastFrame: Difference in Images is too high",
    b"",
    b"During handling of the above exception, another exception occurred:",
    b"",
    TRACEBACK_HEADER.encode(),
    b'  File "android_startup_videoapplink.py", line 438, in <module>',
    b"    ImageObject.validate_end_frame(nav_done_frame)",
    b"__main__.InvalidLastFrame: Difference in Images is too high",
]


def running_env(**kw):
    return get_running_env(flavor="custom-script", **kw)


def test_shell_script_metric_parsing():
    mach_cmd, metadata, env = running_env(
        app="firefox", tests=[str(EXAMPLE_SHELL_TEST)], output=None
    )

    runner = ShellScriptRunner(env, mach_cmd)
    line_handler = runner.line_handler_wrapper()

    line_handler(mock.MagicMock(), b"don't parse line")
    assert len(runner.metrics) == 0

    line_handler(
        mock.MagicMock(), b'perfMetrics: [{{"name": "metric1", "values": []}}]'
    )
    line_handler(mock.MagicMock(), b'perfMetrics: {{"name": "metric2", "values": [1]}}')
    assert len(runner.metrics) == 2

    parsed_metrics = runner.parse_metrics()
    assert len(parsed_metrics) == 2
    assert parsed_metrics[0]["name"] == "metric1"
    assert parsed_metrics[1]["name"] == "metric2"
    assert len(parsed_metrics[1]["values"]) == 1


def test_shell_script_alert_severity_passthrough():
    data = ShellScriptData()

    without_severity = data.open_data({"name": "metric1", "values": [1]})
    assert without_severity["alertSeverity"] is None

    with_severity = data.open_data({
        "name": "metric2",
        "values": [1],
        "alertSeverity": "critical",
    })
    assert with_severity["alertSeverity"] == "critical"


@pytest.mark.parametrize(
    "on_try_setting",
    [
        [True],
        [False],
    ],
)
@mock.patch("mozperftest.test.shellscript.temp_dir")
@mock.patch("mozperftest.test.shellscript.ShellScriptRunner.parse_metrics")
@mock.patch("mozperftest.test.shellscript.mozprocess.run_and_wait")
def test_shell_script(
    mocked_mozprocess, mocked_metrics, mocked_temp_dir, on_try_setting
):
    with mock.patch(
        "mozperftest.test.shellscript.ON_TRY", new=on_try_setting
    ), temp_dir() as tmp_output_dir, temp_dir() as tmp_testing_dir:
        mach_cmd, metadata, env = running_env(
            app="firefox", tests=[str(EXAMPLE_SHELL_TEST)], output=tmp_output_dir
        )

        mocked_metrics.return_value = [
            {"name": "metric1", "values": [1, 2]},
        ]
        mocked_mozprocess.return_value.returncode = 0

        with pathlib.Path(tmp_testing_dir, "tmp.txt").open("w") as f:
            f.write("sample output")
        mocked_temp_dir.return_value.__enter__.return_value = tmp_testing_dir

        customscript = env.layers[TEST]
        metadata.binary = "a_binary"
        with customscript as c:
            c(metadata)

        # Check that the output is handled properly
        if on_try_setting:
            assert (
                len(
                    list(
                        pathlib.Path(tmp_output_dir).glob(
                            f"{metadata.script['name']}.tgz"
                        )
                    )
                )
                == 1
            )
        else:
            tmp_output_dir_path = pathlib.Path(tmp_output_dir)
            assert len(list(tmp_output_dir_path.glob("custom-script-test"))) == 1

            run_folders = list(
                pathlib.Path(tmp_output_dir_path / "custom-script-test").glob("*")
            )
            assert len(run_folders) == 1
            assert len(list(run_folders[0].glob("*"))) == 1

        # Check that the results are properly parsed
        res = metadata.get_results()
        assert len(res) == 1
        assert "metric1" == res[0]["results"][0]["name"]


@mock.patch("mozperftest.test.shellscript.temp_dir")
@mock.patch("mozperftest.test.shellscript.mozprocess.run_and_wait")
def test_shell_script_non_zero_return_code(mocked_mozprocess, mocked_temp_dir):
    with temp_dir() as tmp_testing_dir:
        mach_cmd, metadata, env = running_env(
            app="firefox", tests=[str(EXAMPLE_SHELL_TEST)], output=None
        )
        mocked_temp_dir.return_value.__enter__.return_value = tmp_testing_dir
        mocked_mozprocess.return_value.returncode = 1

        def run_and_wait(*args, **kwargs):
            for line in FAILING_SCRIPT_OUTPUT:
                kwargs["output_line_handler"](mocked_mozprocess.return_value, line)
            return mocked_mozprocess.return_value

        mocked_mozprocess.side_effect = run_and_wait

        metadata.binary = "a_binary"
        runner = ShellScriptRunner(env, mach_cmd)
        with pytest.raises(ScriptFailedError) as raised:
            runner.run(metadata)

        error = str(raised.value)

        # Log parsers only keep the first line, so it has to name the error
        # the script died on rather than just announce that it failed
        assert error.splitlines()[0] == (
            "custom-script-test failed with return code 1: "
            "__main__.InvalidLastFrame: Difference in Images is too high"
        )

        # The exception the script died on was chained to an earlier one, both
        # of them are needed to understand the failure
        assert error.count(TRACEBACK_HEADER) == 2
        assert "retrying image validation" not in error

        # The failure must not be masked by results gathered from a bad run
        assert len(metadata.get_results()) == 0


def test_shell_script_error_falls_back_on_the_output_tail():
    runner = ShellScriptRunner(mock.MagicMock(), mock.MagicMock())
    line_handler = runner.line_handler_wrapper()

    # Only the tail of the output is kept, and it's all that can be reported
    # for a failure that didn't come from python
    for ind in range(OUTPUT_TAIL_SIZE * 2):
        line_handler(mock.MagicMock(), f"line {ind}".encode())
    line_handler(mock.MagicMock(), b"ERROR: HTTP/2 server failed to start")

    error = runner.script_error()
    assert error.endswith("ERROR: HTTP/2 server failed to start")
    assert len(error.splitlines()) == OUTPUT_TAIL_SIZE
    assert "line 0" not in error


def test_shell_script_summary_skips_output_trailing_the_traceback():
    runner = ShellScriptRunner(mock.MagicMock(), mock.MagicMock())
    line_handler = runner.line_handler_wrapper()

    # Scripts keep going after the python process died, to tear down whatever
    # they set up, and what those commands print must not be mistaken for the
    # error (see cvne-newssite.sh)
    for line in FAILING_SCRIPT_OUTPUT + [
        b"adb reverse --remove-all",
        b"Killing server",
    ]:
        line_handler(mock.MagicMock(), line)

    assert (
        runner.script_summary()
        == "__main__.InvalidLastFrame: Difference in Images is too high"
    )


def test_shell_script_summary_falls_back_on_the_last_line_of_output():
    runner = ShellScriptRunner(mock.MagicMock(), mock.MagicMock())
    line_handler = runner.line_handler_wrapper()

    # A failure that didn't come from python has no traceback to summarize
    line_handler(mock.MagicMock(), b"Starting the HTTP/2 server")
    line_handler(mock.MagicMock(), b"ERROR: HTTP/2 server failed to start")
    line_handler(mock.MagicMock(), b"")

    assert runner.script_summary() == "ERROR: HTTP/2 server failed to start"


def test_shell_script_summary_without_any_output():
    runner = ShellScriptRunner(mock.MagicMock(), mock.MagicMock())
    assert runner.script_summary() == "no output"


def test_shell_script_error_ignores_unrelated_tracebacks():
    runner = ShellScriptRunner(mock.MagicMock(), mock.MagicMock())
    line_handler = runner.line_handler_wrapper()

    for line in FAILING_SCRIPT_OUTPUT + [
        b"Recovered, running the next iteration",
        TRACEBACK_HEADER.encode(),
        b"ValueError: something else went wrong",
    ]:
        line_handler(mock.MagicMock(), line)

    error = runner.script_error()
    assert error.count(TRACEBACK_HEADER) == 1
    assert error.endswith("ValueError: something else went wrong")
    assert "InvalidLastFrame" not in error


@pytest.mark.parametrize("timeout_attribute", ["timed_out", "output_timed_out"])
@mock.patch("mozperftest.test.shellscript.temp_dir")
@mock.patch("mozperftest.test.shellscript.mozprocess.run_and_wait")
def test_shell_script_timeouts(mocked_mozprocess, mocked_temp_dir, timeout_attribute):
    with temp_dir() as tmp_testing_dir:
        mach_cmd, metadata, env = running_env(
            app="firefox", tests=[str(EXAMPLE_SHELL_TEST)], output=None
        )
        mocked_temp_dir.return_value.__enter__.return_value = tmp_testing_dir
        mocked_mozprocess.return_value.returncode = 0

        metadata.binary = "a_binary"
        runner = ShellScriptRunner(env, mach_cmd)

        def run_and_wait(*args, **kwargs):
            setattr(runner, timeout_attribute, True)
            return mocked_mozprocess.return_value

        mocked_mozprocess.side_effect = run_and_wait

        with pytest.raises(ScriptTimeoutError):
            runner.run(metadata)

        assert len(metadata.get_results()) == 0


def test_shell_script_unknown_type_error():
    runner = ShellScriptRunner(mock.MagicMock(), mock.MagicMock())
    with pytest.raises(UnknownScriptError):
        mocked_metadata = mock.MagicMock()
        mocked_metadata.script = {"filename": "unknown"}
        runner.run(mocked_metadata)


@mock.patch("mozperftest.test.shellscript.signal")
@mock.patch("mozperftest.test.shellscript.os")
@mock.patch("mozperftest.test.shellscript.platform")
def test_shell_script_kill(mocked_platform, mocked_os, mocked_signal):
    runner = ShellScriptRunner(mock.MagicMock(), mock.MagicMock())
    mocked_proc = mock.MagicMock()

    mocked_platform.system.return_value = "linux"
    runner.kill(mocked_proc)

    mocked_proc.wait.assert_called_once()
    mocked_os.killpg.assert_called_once()

    mocked_platform.system.return_value = "windows"
    runner.kill(mocked_proc)

    mocked_proc.send_signal.assert_called_once()
    assert mocked_proc.wait.call_count == 2


if __name__ == "__main__":
    mozunit.main()
