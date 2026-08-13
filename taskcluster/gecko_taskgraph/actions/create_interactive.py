# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import logging
import re

import taskcluster_urls
from taskgraph.util.taskcluster import get_root_url, get_task_definition

from gecko_taskgraph.actions.registry import register_callback_action
from gecko_taskgraph.actions.util import create_tasks, fetch_graph_and_labels
from gecko_taskgraph.util.constants import TEST_KINDS

logger = logging.getLogger(__name__)

EMAIL_SUBJECT = "Your Interactive Task for {label}"
EMAIL_CONTENT = """\
As you requested, Firefox CI has created an interactive task to run {label}
on revision {revision} in {repo}. Click the button below to connect to the
task. You may need to wait for it to begin running.
"""

###
# Security Concerns
#
# An "interactive task" is, quite literally, shell access to a worker.
#
# Interactive tasks should never be allowed on hosts that build binaries
# leading to a release -- level 3 builders.
#
# Users must not be allowed to create interactive tasks for tasks above
# their own level.
#
# Interactive tasks must not have any routes that might make them appear
# in the index to be used by other production tasks.
#
# Interactive tasks should not be able to write to any shared caches.

SCOPE_WHITELIST = [
    # these are not actually secrets, and just about everything needs them
    re.compile(r"^secrets:get:project/taskcluster/gecko/(hgfingerprint|hgmointernal)$"),
    # public downloads are OK
    re.compile(r"^docker-worker:relengapi-proxy:tooltool.download.public$"),
    re.compile(r"^project:releng:services/tooltool/api/download/public$"),
    # internal downloads are OK
    re.compile(r"^docker-worker:relengapi-proxy:tooltool.download.internal$"),
    re.compile(r"^project:releng:services/tooltool/api/download/internal$"),
    # private toolchain artifacts from tasks
    re.compile(r"^queue:get-artifact:project/gecko/.*$"),
    # level-appropriate secrets are generally necessary to run a task; these
    # also are "not that secret" - most of them are built into the resulting
    # binary and could be extracted by someone with `strings`.
    re.compile(r"^secrets:get:project/releng/gecko/build/level-[0-9]/\*"),
    # ptracing is generally useful for interactive tasks, too!
    re.compile(r"^docker-worker:feature:allowPtrace$"),
    # docker-worker capabilities include loopback devices
    re.compile(r"^docker-worker:capability:device:.*$"),
    re.compile(r"^docker-worker:capability:privileged$"),
    re.compile(r"^docker-worker:cache:gecko-level-1-checkouts.*$"),
    re.compile(r"^docker-worker:cache:gecko-level-1-tooltool-cache.*$"),
    re.compile(r"^generic-worker:cache:gecko-level-1-checkouts.*$"),
    re.compile(r"^generic-worker:cache:gecko-level-1-tooltool-cache.*$"),
]


def context(params):
    # available for docker-worker and generic-worker tasks at levels 1, 2; and for
    # test tasks on level 3 (level-3 builders are firewalled off)
    if int(params["level"]) < 3:
        return [
            {"worker-implementation": "docker-worker"},
            {"worker-implementation": "generic-worker"},
        ]
    return [
        {"worker-implementation": impl, "kind": kind}
        for impl in ("docker-worker", "generic-worker")
        for kind in TEST_KINDS
    ]


@register_callback_action(
    title="Create Interactive Task",
    name="create-interactive",
    symbol="create-inter",
    description=("Create a a copy of the task that you can interact with"),
    order=50,
    context=context,
    schema={
        "type": "object",
        "properties": {
            "notify": {
                "type": "string",
                "format": "email",
                "title": "Who to notify of the pending interactive task",
                "description": (
                    "Enter your email here to get an email containing a link "
                    "to interact with the task"
                ),
                # include a default for ease of users' editing
                "default": "noreply@noreply.mozilla.org",
            },
        },
        "additionalProperties": False,
    },
)
def create_interactive_action(parameters, graph_config, input, task_group_id, task_id):
    # fetch the original task definition from the taskgraph, to avoid
    # creating interactive copies of unexpected tasks.
    decision_task_id, full_task_graph, label_to_taskid, _ = fetch_graph_and_labels(
        parameters, graph_config
    )
    task = get_task_definition(task_id)
    label = task["metadata"]["name"]

    def edit(task):
        if task.label != label:
            return task
        task_def = task.task

        # drop task routes (don't index this!)
        task_def["routes"] = []

        # only try this once
        task_def["retries"] = 0

        # short expirations, at least 3 hour maxRunTime
        task_def["deadline"] = {"relative-datestamp": "12 hours"}
        task_def["created"] = {"relative-datestamp": "0 hours"}
        task_def["expires"] = {"relative-datestamp": "1 day"}

        # filter scopes with the SCOPE_WHITELIST
        task.task["scopes"] = [
            s
            for s in task.task.get("scopes", [])
            if any(p.match(s) for p in SCOPE_WHITELIST)
        ]

        payload = task_def["payload"]

        # make sure the task runs for long enough..
        payload["maxRunTime"] = max(3600 * 3, payload.get("maxRunTime", 0))

        # no caches or artifacts
        worker_impl = task_def.get("tags", {}).get("worker-implementation")
        if worker_impl == "generic-worker":
            # strip writable caches from mounts; read-only mounts are fine
            payload["mounts"] = [
                m for m in payload.get("mounts", []) if "cacheName" not in m
            ]
            payload["artifacts"] = []
            # runAsAdministrator would be rejected without its scope anyway, but
            # remove it explicitly to avoid a malformed-payload exception
            payload.get("features", {}).pop("runAsAdministrator", None)
        else:
            payload["cache"] = {}
            payload["artifacts"] = {}

        # enable interactive mode
        payload.setdefault("features", {})["interactive"] = True
        payload.setdefault("env", {})["TASKCLUSTER_INTERACTIVE"] = "true"

        # add notification
        email = input.get("notify")
        # no point sending to a noreply address!
        if email and email != "noreply@noreply.mozilla.org":
            info = {
                "url": taskcluster_urls.ui(
                    get_root_url(block_proxy=True), "tasks/${status.taskId}/connect"
                ),
                "label": label,
                "revision": parameters["head_rev"],
                "repo": parameters["head_repository"],
            }
            task_def.setdefault("extra", {}).setdefault("notify", {})["email"] = {
                "subject": EMAIL_SUBJECT.format(**info),
                "content": EMAIL_CONTENT.format(**info),
                "link": {"text": "Connect", "href": info["url"]},
            }
            task_def["routes"].append(f"notify.email.{email}.on-pending")

        return task

    label_to_taskid = create_tasks(
        graph_config,
        [label],
        full_task_graph,
        label_to_taskid,
        parameters,
        decision_task_id=decision_task_id,
        modifier=edit,
    )

    taskId = label_to_taskid[label]
    logger.info(f"Created interactive task {taskId}")
