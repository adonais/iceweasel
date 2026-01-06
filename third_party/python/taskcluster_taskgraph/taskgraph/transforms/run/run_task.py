# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Support for running tasks that are invoked via the `run-task` script.
"""

import dataclasses
import os
from textwrap import dedent

from voluptuous import Any, Optional, Required

from taskgraph.transforms.run import run_task_using
from taskgraph.transforms.run.common import (
    support_caches,
    support_vcs_checkout,
)
from taskgraph.transforms.task import taskref_or_string
from taskgraph.util import path, taskcluster
from taskgraph.util.caches import CACHES
from taskgraph.util.schema import Schema

EXEC_COMMANDS = {
    "bash": ["bash", "-cx"],
    "powershell": ["powershell.exe", "-ExecutionPolicy", "Bypass"],
}


#: Schema for run.using run_task
run_task_schema = Schema(
    {
        Required(
            "using",
            description=dedent(
                """
                Specifies the task type. Must be 'run-task'.
                """.lstrip()
            ),
        ): "run-task",
        Optional(
            "use-caches",
            description=dedent(
                """
                Specifies which caches to use. May take a boolean in which case either all
                (True) or no (False) caches will be used. Alternatively, it can accept a
                list of caches to enable. Defaults to only the checkout cache enabled.
                """.lstrip()
            ),
        ): Any(bool, list(CACHES.keys())),
        Required(
            "checkout",
            description=dedent(
                """
                If true (the default), perform a checkout on the worker. Can also be a
                dictionary specifying explicit checkouts.
                """.lstrip()
            ),
        ): Any(bool, {str: dict}),
        Optional(
            "cwd",
            description=dedent(
                """
                Path to run command in. If a checkout is present, the path to the checkout
                will be interpolated with the key `checkout`.
                """.lstrip()
            ),
        ): str,
        Required(
            "command",
            description=dedent(
                """
                The command arguments to pass to the `run-task` script, after the checkout
                arguments. If a list, it will be passed directly; otherwise it will be
                included in a single argument to the command specified by `exec-with`.
                """.lstrip()
            ),
        ): Any([taskref_or_string], taskref_or_string),
        Optional(
            "exec-with",
            description=dedent(
                """
                Specifies what to execute the command with in the event the command is a
                string.
                """.lstrip()
            ),
        ): Any(*list(EXEC_COMMANDS)),
        Optional(
            "run-task-command",
            description=dedent(
                """
                Command used to invoke the `run-task` script. Can be used if the script
                or Python installation is in a non-standard location on the workers.
                """.lstrip()
            ),
        ): list,
        Required(
            "workdir",
            description=dedent(
                """
                Base work directory used to set up the task.
                """.lstrip()
            ),
        ): str,
        Optional(
            "run-as-root",
            description=dedent(
                """
                Whether to run as root. Defaults to False.
                """.lstrip()
            ),
        ): bool,
    }
)


def common_setup(config, task, taskdesc, command):
    run = task["run"]
    if run["checkout"]:
        repo_configs = config.repo_configs
        if len(repo_configs) > 1 and run["checkout"] is True:
            raise Exception("Must explicitly specify checkouts with multiple repos.")
        elif run["checkout"] is not True:
            repo_configs = {
                repo: dataclasses.replace(repo_configs[repo], **config)
                for (repo, config) in run["checkout"].items()
            }

        vcs_path = support_vcs_checkout(
            config,
            task,
            taskdesc,
            repo_configs=repo_configs,
        )

        for repo_config in repo_configs.values():
            checkout_path = path.join(vcs_path, repo_config.path)
            command.append(f"--{repo_config.prefix}-checkout={checkout_path}")

        if "cwd" in run:
            run["cwd"] = path.normpath(run["cwd"].format(checkout=vcs_path))
    elif "cwd" in run and "{checkout}" in run["cwd"]:
        raise Exception(
            "Found `{{checkout}}` interpolation in `cwd` for task {name} "
            "but the task doesn't have a checkout: {cwd}".format(
                cwd=run["cwd"], name=task.get("name", task.get("label"))
            )
        )

    if "cwd" in run:
        command.extend(("--task-cwd", run["cwd"]))

    support_caches(config, task, taskdesc)
    taskdesc["worker"].setdefault("env", {})["MOZ_SCM_LEVEL"] = config.params["level"]


worker_defaults = {
    "checkout": True,
    "run-as-root": False,
}


def script_url(config, script):
    if "MOZ_AUTOMATION" in os.environ and "TASK_ID" not in os.environ:
        raise Exception("TASK_ID must be defined to use run-task on generic-worker")
    task_id = os.environ.get("TASK_ID", "<TASK_ID>")
    # Assumes the cluster allows anonymous downloads of public artifacts
    tc_url = taskcluster.get_root_url(block_proxy=True)
    # TODO: Use util/taskcluster.py:get_artifact_url once hack for Bug 1405889 is removed
    return f"{tc_url}/api/queue/v1/task/{task_id}/artifacts/public/{script}"


@run_task_using(
    "docker-worker", "run-task", schema=run_task_schema, defaults=worker_defaults
)
def docker_worker_run_task(config, task, taskdesc):
    run = task["run"]
    worker = taskdesc["worker"] = task["worker"]
    command = run.pop("run-task-command", ["/usr/local/bin/run-task"])
    common_setup(config, task, taskdesc, command)

    run_command = run["command"]

    # dict is for the case of `{'task-reference': str}`.
    if isinstance(run_command, str) or isinstance(run_command, dict):
        exec_cmd = EXEC_COMMANDS[run.pop("exec-with", "bash")]
        run_command = exec_cmd + [run_command]
    if run["run-as-root"]:
        command.extend(("--user", "root", "--group", "root"))
    command.append("--")
    command.extend(run_command)
    worker["command"] = command


@run_task_using(
    "generic-worker", "run-task", schema=run_task_schema, defaults=worker_defaults
)
def generic_worker_run_task(config, task, taskdesc):
    run = task["run"]
    worker = taskdesc["worker"] = task["worker"]
    is_win = worker["os"] == "windows"
    is_bitbar = worker["os"] == "linux-bitbar"

    command = run.pop("run-task-command", None)
    if not command:
        if is_win:
            command = ["C:/mozilla-build/python3/python3.exe", "run-task"]
        else:
            command = ["./run-task"]

    common_setup(config, task, taskdesc, command)

    worker.setdefault("mounts", [])
    worker["mounts"].append(
        {
            "content": {
                "url": script_url(config, "run-task"),
            },
            "file": "./run-task",
        }
    )
    if worker.get("env", {}).get("MOZ_FETCHES"):
        worker["mounts"].append(
            {
                "content": {
                    "url": script_url(config, "fetch-content"),
                },
                "file": "./fetch-content",
            }
        )

    run_command = run["command"]

    if isinstance(run_command, str):
        if is_win:
            run_command = f'"{run_command}"'
        exec_cmd = EXEC_COMMANDS[run.pop("exec-with", "bash")]
        run_command = exec_cmd + [run_command]

    if run["run-as-root"]:
        command.extend(("--user", "root", "--group", "root"))
    command.append("--")
    if is_bitbar:
        # Use the bitbar wrapper script which sets up the device and adb
        # environment variables
        command.append("/builds/taskcluster/script.py")
    command.extend(run_command)

    if is_win:
        worker["command"] = [" ".join(command)]
    else:
        worker["command"] = [
            ["chmod", "+x", "run-task"],
            command,
        ]
