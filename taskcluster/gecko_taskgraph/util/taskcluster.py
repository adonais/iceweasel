# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import logging

from taskcluster import Hooks
from taskgraph.util.taskcluster import (
    get_root_url,
    get_task_definition,
    get_taskcluster_client,
)

logger = logging.getLogger(__name__)


def insert_index(index_path, task_id, data=None):
    # Find task expiry.
    expires = get_task_definition(task_id)["expires"]

    index = get_taskcluster_client("index")
    response = index.insertTask(
        index_path,
        {
            "taskId": task_id,
            "rank": 0,
            "data": data or {},
            "expires": expires,
        },
    )
    return response


def trigger_hook(hook_group_id, hook_id, hook_payload):
    hooks = Hooks({"rootUrl": get_root_url()})
    response = hooks.triggerHook(hook_group_id, hook_id, hook_payload)

    logger.info(
        "Task seen here: {}/tasks/{}".format(
            get_root_url(),
            response["status"]["taskId"],
        )
    )


def list_task_group_tasks(task_group_id):
    """Generate the tasks in a task group"""
    queue = get_taskcluster_client("queue")

    tasks = []

    def pagination_handler(response):
        tasks.extend(response["tasks"])

    queue.listTaskGroup(task_group_id, paginationHandler=pagination_handler)

    return tasks


def list_task_group_incomplete_task_ids(task_group_id):
    states = ("running", "pending", "unscheduled")
    for task in [t["status"] for t in list_task_group_tasks(task_group_id)]:
        if task["state"] in states:
            yield task["taskId"]


def list_task_group_complete_tasks(task_group_id):
    tasks = {}
    for task in list_task_group_tasks(task_group_id):
        if task.get("status", {}).get("state", "") == "completed":
            tasks[task.get("task", {}).get("metadata", {}).get("name", "")] = task.get(
                "status", {}
            ).get("taskId", "")
    return tasks


def find_task(index_path):
    index = get_taskcluster_client("index")
    return index.findTask(index_path)
