# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import logging

from taskgraph.util.taskcluster import get_taskcluster_client

from .registry import register_callback_action

logger = logging.getLogger(__name__)


@register_callback_action(
    title="Change Priority",
    name="change-priority",
    symbol="prio",
    description=(
        "Change the priority of all unresolved tasks created by the decision task "
        "this action task is associated with. Running tasks keep their current "
        "priority until they are retried."
    ),
    order=410,
    permission="change-priority",
    context=[],
    schema={
        "type": "object",
        "properties": {
            "priority": {
                "type": "string",
                "enum": [
                    "highest",
                    "very-high",
                    "high",
                    "medium",
                    "low",
                    "very-low",
                    "lowest",
                ],
                "default": "medium",
                "title": "Priority",
                "description": "The new priority for the unresolved tasks in the push.",
            },
        },
        "required": ["priority"],
        "additionalProperties": False,
    },
)
def change_priority_action(parameters, graph_config, input, task_group_id, task_id):
    priority = input["priority"]
    logger.info(f"Changing priority of task group {task_group_id} to {priority}")
    response = get_taskcluster_client("queue").changeTaskGroupPriority(
        task_group_id, {"newPriority": priority}
    )
    logger.info(f"Changed {response['tasksAffected']} tasks to {priority}")
