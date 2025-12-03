# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import copy
import datetime
import functools
import io
import logging
import os
from typing import Any, Union

import requests
import taskcluster_urls as liburls
from requests.packages.urllib3.util.retry import Retry  # type: ignore

import taskcluster
from taskgraph.task import Task
from taskgraph.util import yaml

logger = logging.getLogger(__name__)

# this is set to true for `mach taskgraph action-callback --test`
testing = False

# Default rootUrl to use if none is given in the environment; this should point
# to the production Taskcluster deployment used for CI.
PRODUCTION_TASKCLUSTER_ROOT_URL = None

# the maximum number of parallel Taskcluster API calls to make
CONCURRENCY = 50


@functools.cache
def get_root_url(block_proxy=False):
    if "TASKCLUSTER_PROXY_URL" in os.environ and not block_proxy:
        logger.debug(
            "Using taskcluster-proxy at {}".format(os.environ["TASKCLUSTER_PROXY_URL"])
        )
        return liburls.normalize_root_url(os.environ["TASKCLUSTER_PROXY_URL"])

    if "TASKCLUSTER_ROOT_URL" in os.environ:
        logger.debug(
            "Running in Taskcluster instance {}".format(
                os.environ["TASKCLUSTER_ROOT_URL"]
            )
        )
        return liburls.normalize_root_url(os.environ["TASKCLUSTER_ROOT_URL"])

    if PRODUCTION_TASKCLUSTER_ROOT_URL is not None:
        logger.debug("Using default TASKCLUSTER_ROOT_URL")
        return liburls.normalize_root_url(PRODUCTION_TASKCLUSTER_ROOT_URL)

    if "TASK_ID" in os.environ:
        raise RuntimeError("$TASKCLUSTER_ROOT_URL must be set when running in a task")
    else:
        raise RuntimeError(
            "Could not detect Taskcluster instance, set $TASKCLUSTER_ROOT_URL"
        )


@functools.cache
def get_taskcluster_client(service: str):
    if "TASKCLUSTER_PROXY_URL" in os.environ:
        options = {"rootUrl": os.environ["TASKCLUSTER_PROXY_URL"]}
    else:
        options = taskcluster.optionsFromEnvironment({"rootUrl": get_root_url()})

    return getattr(taskcluster, service[0].upper() + service[1:])(options)


def _handle_artifact(
    path: str, response: Union[requests.Response, dict[str, Any]]
) -> Any:
    # When taskcluster client returns non-JSON responses, it wraps them in {"response": <Response>}
    if (
        isinstance(response, dict)
        and "response" in response
        and isinstance(response["response"], requests.Response)
    ):
        response = response["response"]

    if not isinstance(response, requests.Response):
        # At this point, if we don't have a response object, it's already parsed, return it
        return response

    # We have a response object, load the content based on the path extension.
    if path.endswith(".json"):
        return response.json()

    if path.endswith(".yml"):
        return yaml.load_stream(response.content)

    # Otherwise return raw response content
    if hasattr(response.raw, "tell") and response.raw.tell() > 0:
        # Stream was already read, create a new one from content. This can
        # happen when mocking with responses.
        return io.BytesIO(response.content)

    response.raw.read = functools.partial(response.raw.read, decode_content=True)
    return response.raw


def requests_retry_session(
    retries,
    backoff_factor=0.1,
    status_forcelist=(500, 502, 503, 504),
    concurrency=CONCURRENCY,
    session=None,
    allowed_methods=None,
):
    session = session or requests.Session()
    kwargs = {}
    if allowed_methods is not None:
        kwargs["allowed_methods"] = allowed_methods
    retry = Retry(
        total=retries,
        read=retries,
        connect=retries,
        backoff_factor=backoff_factor,
        status_forcelist=status_forcelist,
        **kwargs,
    )

    # Default HTTPAdapter uses 10 connections. Mount custom adapter to increase
    # that limit. Connections are established as needed, so using a large value
    # should not negatively impact performance.
    http_adapter = requests.adapters.HTTPAdapter(  # type: ignore
        pool_connections=concurrency,
        pool_maxsize=concurrency,
        max_retries=retry,
    )
    session.mount("http://", http_adapter)
    session.mount("https://", http_adapter)

    return session


@functools.cache
def get_session():
    return requests_retry_session(retries=5)


def get_artifact_url(task_id, path, use_proxy=False):
    url = get_root_url(block_proxy=not use_proxy)
    artifact_tmpl = liburls.api(url, "queue", "v1", "task/{}/artifacts/{}")
    return artifact_tmpl.format(task_id, path)


def get_artifact(task_id, path):
    """
    Returns the artifact with the given path for the given task id.

    If the path ends with ".json" or ".yml", the content is deserialized as,
    respectively, json or yaml, and the corresponding python data (usually
    dict) is returned.
    For other types of content, a file-like object is returned.
    """
    queue = get_taskcluster_client("queue")
    response = queue.getLatestArtifact(task_id, path)
    return _handle_artifact(path, response)


def list_artifacts(task_id):
    queue = get_taskcluster_client("queue")
    response = queue.listLatestArtifacts(task_id)
    return response["artifacts"]


def get_artifact_prefix(task):
    prefix = None
    if isinstance(task, dict):
        prefix = task.get("attributes", {}).get("artifact_prefix")
    elif isinstance(task, Task):
        prefix = task.attributes.get("artifact_prefix")
    else:
        raise Exception(f"Can't find artifact-prefix of non-task: {task}")
    return prefix or "public/build"


def get_artifact_path(task, path):
    return f"{get_artifact_prefix(task)}/{path}"


def get_index_url(index_path, multiple=False, use_proxy=False):
    index_tmpl = liburls.api(
        get_root_url(block_proxy=not use_proxy), "index", "v1", "task{}/{}"
    )
    return index_tmpl.format("s" if multiple else "", index_path)


def find_task_id(index_path):
    index = get_taskcluster_client("index")
    task = index.findTask(index_path)
    return task["taskId"]  # type: ignore


def find_task_id_batched(index_paths):
    """Gets the task id of multiple tasks given their respective index.

    Args:
        index_paths (List[str]): A list of task indexes.

    Returns:
        Dict[str, str]: A dictionary object mapping each valid index path
                        to its respective task id.

    See the endpoint here:
        https://docs.taskcluster.net/docs/reference/core/index/api#findTasksAtIndex
    """
    index = get_taskcluster_client("index")
    task_ids = {}

    def pagination_handler(response):
        task_ids.update(
            {
                t["namespace"]: t["taskId"]
                for t in response["tasks"]
                if "namespace" in t and "taskId" in t
            }
        )

    index.findTasksAtIndex(
        payload={"indexes": index_paths}, paginationHandler=pagination_handler
    )

    return task_ids


def get_artifact_from_index(index_path, artifact_path):
    index = get_taskcluster_client("index")
    response = index.findArtifactFromTask(index_path, artifact_path)
    return _handle_artifact(index_path, response)


def list_tasks(index_path):
    """
    Returns a list of task_ids where each task_id is indexed under a path
    in the index. Results are sorted by expiration date from oldest to newest.
    """
    index = get_taskcluster_client("index")
    tasks = []

    def pagination_handler(response):
        tasks.extend(response["tasks"])

    index.listTasks(index_path, paginationHandler=pagination_handler)

    # We can sort on expires because in the general case
    # all of these tasks should be created with the same expires time so they end up in
    # order from earliest to latest action. If more correctness is needed, consider
    # fetching each task and sorting on the created date.
    tasks.sort(key=lambda t: parse_time(t["expires"]))

    task_ids = [t["taskId"] for t in tasks]

    return task_ids


def parse_time(timestamp):
    """Turn a "JSON timestamp" as used in TC APIs into a datetime"""
    return datetime.datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S.%fZ")


def get_task_url(task_id):
    task_tmpl = liburls.api(get_root_url(), "queue", "v1", "task/{}")
    return task_tmpl.format(task_id)


@functools.cache
def get_task_definition(task_id):
    queue = get_taskcluster_client("queue")
    return queue.task(task_id)


def cancel_task(task_id):
    """Cancels a task given a task_id. In testing mode, just logs that it would
    have cancelled."""
    if testing:
        logger.info(f"Would have cancelled {task_id}.")
    else:
        queue = get_taskcluster_client("queue")
        queue.cancelTask(task_id)


def status_task(task_id):
    """Gets the status of a task given a task_id.

    In testing mode, just logs that it would have retrieved status and return an empty dict.

    Args:
        task_id (str): A task id.

    Returns:
        dict: A dictionary object as defined here:
          https://docs.taskcluster.net/docs/reference/platform/queue/api#status
    """
    if testing:
        logger.info(f"Would have gotten status for {task_id}.")
        return {}
    else:
        queue = get_taskcluster_client("queue")
        response = queue.status(task_id)
        if response:
            return response.get("status", {})
        else:
            return {}


def status_task_batched(task_ids):
    """Gets the status of multiple tasks given task_ids.

    In testing mode, just logs that it would have retrieved statuses.

    Args:
        task_id (List[str]): A list of task ids.

    Returns:
        dict: A dictionary object as defined here:
          https://docs.taskcluster.net/docs/reference/platform/queue/api#statuses
    """
    if testing:
        logger.info(f"Would have gotten status for {len(task_ids)} tasks.")
        return {}

    queue = get_taskcluster_client("queue")
    statuses = {}

    def pagination_handler(response):
        statuses.update(
            {
                t["taskId"]: t["status"]
                for t in response.get("statuses", [])
                if "status" in t and "taskId" in t
            }
        )

    queue.statuses(payload={"taskIds": task_ids}, paginationHandler=pagination_handler)

    return statuses


def state_task(task_id):
    """Gets the state of a task given a task_id.

    In testing mode, just logs that it would have retrieved state. This is a subset of the
    data returned by :func:`status_task`.

    Args:
        task_id (str): A task id.

    Returns:
        str: The state of the task, one of
          ``pending, running, completed, failed, exception, unknown``.
    """
    if testing:
        logger.info(f"Would have gotten state for {task_id}.")
    else:
        status = status_task(task_id).get("state") or "unknown"  # type: ignore
        return status


def rerun_task(task_id):
    """Reruns a task given a task_id. In testing mode, just logs that it would
    have reran."""
    if testing:
        logger.info(f"Would have rerun {task_id}.")
    else:
        queue = get_taskcluster_client("queue")
        queue.rerunTask(task_id)


def get_current_scopes():
    """Get the current scopes.  This only makes sense in a task with the Taskcluster
    proxy enabled, where it returns the actual scopes accorded to the task."""
    auth = get_taskcluster_client("auth")
    resp = auth.currentScopes()
    if resp:
        return resp.get("scopes")  # type: ignore
    return []


def get_purge_cache_url(provisioner_id, worker_type):
    url_tmpl = liburls.api(get_root_url(), "purge-cache", "v1", "purge-cache/{}/{}")
    return url_tmpl.format(provisioner_id, worker_type)


def purge_cache(provisioner_id, worker_type, cache_name):
    """Requests a cache purge from the purge-caches service."""
    worker_pool_id = f"{provisioner_id}/{worker_type}"

    if testing:
        logger.info(f"Would have purged {worker_pool_id}/{cache_name}.")
    else:
        logger.info(f"Purging {worker_pool_id}/{cache_name}.")
        purge_cache_client = get_taskcluster_client("purgeCache")
        purge_cache_client.purgeCache(worker_pool_id, {"cacheName": cache_name})


def send_email(address, subject, content, link):
    """Sends an email using the notify service"""
    logger.info(f"Sending email to {address}.")
    notify = get_taskcluster_client("notify")
    notify.email(
        {
            "address": address,
            "subject": subject,
            "content": content,
            "link": link,
        }
    )


def list_task_group_incomplete_tasks(task_group_id):
    """Generate the incomplete tasks in a task group"""
    queue = get_taskcluster_client("queue")

    incomplete_tasks = []

    def pagination_handler(response):
        incomplete_tasks.extend(
            task["status"]["taskId"]
            for task in response["tasks"]
            if task["status"]["state"] in ("running", "pending", "unscheduled")
        )

    queue.listTaskGroup(task_group_id, paginationHandler=pagination_handler)

    return incomplete_tasks


@functools.cache
def _get_deps(task_ids):
    upstream_tasks = {}
    for task_id in task_ids:
        task_def = get_task_definition(task_id)
        if not task_def:
            continue

        metadata = task_def.get("metadata", {})  # type: ignore
        name = metadata.get("name")  # type: ignore
        if name:
            upstream_tasks[task_id] = name

        dependencies = task_def.get("dependencies", [])
        if dependencies:
            upstream_tasks.update(_get_deps(tuple(dependencies)))

    return upstream_tasks


def get_ancestors(task_ids: Union[list[str], str]) -> dict[str, str]:
    """Gets the ancestor tasks of the given task_ids as a dictionary of taskid -> label.

    Args:
        task_ids (str or [str]): A single task id or a list of task ids to find the ancestors of.

    Returns:
        dict: A dict whose keys are task ids and values are task labels.
    """
    upstream_tasks: dict[str, str] = {}

    if isinstance(task_ids, str):
        task_ids = [task_ids]

    for task_id in task_ids:
        try:
            task_def = get_task_definition(task_id)
        except taskcluster.TaskclusterRestFailure as e:
            # Task has most likely expired, which means it's no longer a
            # dependency for the purposes of this function.
            if e.status_code == 404:
                continue
            raise e

        dependencies = task_def.get("dependencies", [])
        if dependencies:
            upstream_tasks.update(_get_deps(tuple(dependencies)))

    return copy.deepcopy(upstream_tasks)
