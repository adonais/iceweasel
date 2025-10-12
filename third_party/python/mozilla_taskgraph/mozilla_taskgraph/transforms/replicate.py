# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import annotations

import os
import re
from textwrap import dedent

from requests.exceptions import HTTPError
from taskgraph.transforms.base import TransformSequence
from taskgraph.util.attributes import attrmatch
from taskgraph.util.schema import Schema
from taskgraph.util.taskcluster import (
    find_task_id,
    get_artifact,
    get_task_definition,
)
from voluptuous import ALLOW_EXTRA, Any, Optional, Required

REPLICATE_SCHEMA = Schema(
    {
        Required(
            "replicate",
            description=dedent(
                """
            Configuration for the replicate transforms.
            """.lstrip(),
            ),
        ): {
            Required(
                "target",
                description=dedent(
                    """
                Define which tasks to target for replication.

                Each item in the list can be either:

                    1. A taskId
                    2. An index path that points to a single task

                If any of the resolved tasks are a Decision task, targeted
                tasks will be derived from the `task-graph.json` artifact.
                """.lstrip()
                ),
            ): [str],
            Optional(
                "include-attrs",
                description=dedent(
                    """
                A dict of attribute key/value pairs that targeted tasks will be
                filtered on. Targeted tasks must *match all* of the given
                attributes or they will be ignored.

                Matching is performed by the :func:`~taskgraph.util.attrmatch`
                utility function.
                """.lstrip(),
                ),
            ): {str: Any(str, [str])},
            Optional(
                "exclude-attrs",
                description=dedent(
                    """
                A dict of attribute key/value pairs that targeted tasks will be
                filtered on. Targeted tasks must *not match any* of the given
                attributes or they will be ignored.

                Matching is performed by the :func:`~taskgraph.util.attrmatch`
                utility function.
                """.lstrip(),
                ),
            ): {str: Any(str, [str])},
        },
    },
    extra=ALLOW_EXTRA,
)

TASK_ID_RE = re.compile(
    r"^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$"
)

transforms = TransformSequence()
transforms.add_validate(REPLICATE_SCHEMA)


@transforms.add
def resolve_targets(config, tasks):
    for task in tasks:
        config = task.pop("replicate")

        task_defs = []
        for target in config["target"]:
            if TASK_ID_RE.match(target):
                # target is a task id
                task_id = target
            else:
                # target is an index path
                task_id = find_task_id(target)

            try:
                # we have a decision task, add all tasks from task-graph.json
                result = get_artifact(task_id, "public/task-graph.json").values()
                task_defs.extend(result)
            except HTTPError as e:
                if e.response.status_code != 404:
                    raise

                # we have a regular task, just yield its definition and move on
                task_defs.append(get_task_definition(target))

        for task_def in task_defs:
            attributes = task_def.get("attributes", {})

            # filter out some unsupported / undesired cases implicitly
            if task_def["task"]["provisionerId"] == "releng-hardware":
                continue

            if (
                task_def["task"]["payload"]
                .get("features", {})
                .get("runAsAdministrator")
            ):
                continue

            # filter out tasks that don't satisfy include-attrs
            if not attrmatch(attributes, **config.get("include-attrs", {})):
                continue

            # filter out tasks that satisfy exclude-attrs
            if exclude_attrs := config.get("exclude-attrs"):
                excludes = {
                    key: lambda attr: any([attr.startswith(v) for v in values])
                    for key, values in exclude_attrs.items()
                }
                if attrmatch(attributes, **excludes):
                    continue

            task_def["name-prefix"] = task["name"]
            yield task_def


def _rewrite_datestamps(task_def):
    """Rewrite absolute datestamps from a concrete task definition into
    relative ones that can then be used to schedule a new task."""
    # Arguably, we should try to figure out what these values should be from
    # the repo that created them originally. In practice it probably doesn't
    # matter.
    task_def["created"] = {"relative-datestamp": "0 seconds"}
    task_def["deadline"] = {"relative-datestamp": "1 day"}
    task_def["expires"] = {"relative-datestamp": "1 month"}

    if artifacts := task_def.get("payload", {}).get("artifacts"):
        artifacts = artifacts.values() if isinstance(artifacts, dict) else artifacts
        for artifact in artifacts:
            if "expires" in artifact:
                artifact["expires"] = {"relative-datestamp": "1 month"}


def _remove_revisions(task_def):
    """Rewrite revisions in task payloads to ensure that tasks do not refer to
    out of date revisions."""
    to_remove = set()
    for k in task_def.get("payload", {}).get("env", {}):
        if k.endswith("_REV"):
            to_remove.add(k)

    for k in to_remove:
        del task_def["payload"]["env"][k]


@transforms.add
def rewrite_task(config, task_defs):
    assert "TASK_ID" in os.environ

    trust_domain = config.graph_config["trust-domain"]
    level = config.params["level"]

    # Replace strings like `gecko-level-3` with the active trust domain and
    # level.
    pattern = re.compile(r"[a-z]+-level-[1-3]")
    repl = f"{trust_domain}-level-{level}"

    for task_def in task_defs:
        task = task_def["task"]

        task.update(
            {
                "schedulerId": repl,
                "taskGroupId": os.environ["TASK_ID"],
                "priority": "low",
                "routes": ["checks"],
            }
        )

        # Remove treeherder config
        if "treeherder" in task["extra"]:
            del task["extra"]["treeherder"]

        cache = task["payload"].get("cache", {})
        for name, value in cache.copy().items():
            del cache[name]
            name = pattern.sub(repl, name)
            cache[name] = value

        for mount in task["payload"].get("mounts", []):
            if "cacheName" in mount:
                mount["cacheName"] = pattern.sub(
                    repl,
                    mount["cacheName"],
                )

        for i, scope in enumerate(task.get("scopes", [])):
            task["scopes"][i] = pattern.sub(repl, scope)

        # Drop down to level 1 to match the current context.
        for key in ("taskQueueId", "provisionerId", "worker-type"):
            if key in task:
                task_def[key] = task[key].replace("3", level)

        # All datestamps come in as absolute ones, many of which
        # will be in the past. We need to rewrite these to relative
        # ones to make the task reschedulable.
        _rewrite_datestamps(task)

        # We also need to remove absolute revisions from payloads
        # to avoid issues with revisions not matching the refs
        # that are given.
        _remove_revisions(task)

        name_prefix = task_def.pop("name-prefix")
        task["metadata"]["name"] = f"{name_prefix}-{task['metadata']['name']}"
        taskdesc = {
            "label": task["metadata"]["name"],
            "dependencies": {},
            "description": task["metadata"]["description"],
            "task": task,
            "attributes": {"replicate": name_prefix},
        }

        yield taskdesc
