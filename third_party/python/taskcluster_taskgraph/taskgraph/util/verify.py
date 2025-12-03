# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import logging
import re
import sys
import warnings
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Callable, Union

from taskgraph import MAX_DEPENDENCIES
from taskgraph.config import GraphConfig
from taskgraph.parameters import Parameters
from taskgraph.taskgraph import TaskGraph
from taskgraph.transforms.task import run_task_suffix
from taskgraph.util.attributes import match_run_on_projects
from taskgraph.util.treeherder import join_symbol

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Verification(ABC):
    func: Callable

    @abstractmethod
    def verify(self, **kwargs) -> None:
        pass


@dataclass(frozen=True)
class InitialVerification(Verification):
    """Verification that doesn't depend on any generation state."""

    def verify(self):
        self.func()


@dataclass(frozen=True)
class GraphConfigVerification(Verification):
    def verify(self, graph_config: GraphConfig):
        self.func(graph_config)


@dataclass(frozen=True)
class GraphVerification(Verification):
    """Verification for a TaskGraph object."""

    run_on_projects: Union[list, None] = field(default=None)

    def verify(
        self, graph: TaskGraph, graph_config: GraphConfig, parameters: Parameters
    ):
        if self.run_on_projects and not match_run_on_projects(
            parameters["project"], self.run_on_projects
        ):
            return

        scratch_pad = {}
        graph.for_each_task(
            self.func,
            scratch_pad=scratch_pad,
            graph_config=graph_config,
            parameters=parameters,
        )
        self.func(
            None,
            graph,
            scratch_pad=scratch_pad,
            graph_config=graph_config,
            parameters=parameters,
        )


@dataclass(frozen=True)
class ParametersVerification(Verification):
    """Verification for a set of parameters."""

    def verify(self, parameters: Parameters):
        self.func(parameters)


@dataclass(frozen=True)
class KindsVerification(Verification):
    """Verification for kinds."""

    def verify(self, kinds: dict):
        self.func(kinds)


@dataclass(frozen=True)
class VerificationSequence:
    """
    Container for a sequence of verifications over a TaskGraph. Each
    verification is represented as a callable taking (task, taskgraph,
    scratch_pad), called for each task in the taskgraph, and one more
    time with no task but with the taskgraph and the same scratch_pad
    that was passed for each task.
    """

    _verifications: dict = field(default_factory=dict)
    _verification_types = {
        "graph": GraphVerification,
        "graph_config": GraphConfigVerification,
        "initial": InitialVerification,
        "kinds": KindsVerification,
        "parameters": ParametersVerification,
    }

    def __call__(self, name, *args, **kwargs):
        for verification in self._verifications.get(name, []):
            verification.verify(*args, **kwargs)

    def add(self, name, **kwargs):
        cls = self._verification_types.get(name, GraphVerification)

        def wrap(func):
            self._verifications.setdefault(name, []).append(cls(func, **kwargs))
            return func

        return wrap


verifications = VerificationSequence()


@verifications.add("full_task_graph")
def verify_task_graph_symbol(task, taskgraph, scratch_pad, graph_config, parameters):
    """
    This function verifies that tuple
    (collection.keys(), machine.platform, groupSymbol, symbol) is unique
    for a target task graph.
    """
    if task is None:
        return
    task_dict = task.task
    if "extra" in task_dict:
        extra = task_dict["extra"]
        if "treeherder" in extra:
            treeherder = extra["treeherder"]

            collection_keys = tuple(sorted(treeherder.get("collection", {}).keys()))
            if len(collection_keys) != 1:
                raise Exception(
                    f"Task {task.label} can't be in multiple treeherder collections "
                    f"(the part of the platform after `/`): {collection_keys}"
                )
            platform = treeherder.get("machine", {}).get("platform")
            group_symbol = treeherder.get("groupSymbol")
            symbol = treeherder.get("symbol")

            key = (platform, collection_keys[0], group_symbol, symbol)
            if key in scratch_pad:
                raise Exception(
                    "Duplicate treeherder platform and symbol in tasks "
                    "`{}` and `{}`: {} {}".format(
                        task.label,
                        scratch_pad[key],
                        f"{platform}/{collection_keys[0]}",
                        join_symbol(group_symbol, symbol),
                    )
                )
            else:
                scratch_pad[key] = task.label


@verifications.add("full_task_graph")
def verify_trust_domain_v2_routes(
    task, taskgraph, scratch_pad, graph_config, parameters
):
    """
    This function ensures that any two tasks have distinct ``index.{trust-domain}.v2`` routes.
    """
    if task is None:
        return
    route_prefix = "index.{}.v2".format(graph_config["trust-domain"])
    task_dict = task.task
    routes = task_dict.get("routes", [])

    for route in routes:
        if route.startswith(route_prefix):
            if route in scratch_pad:
                raise Exception(
                    f"conflict between {task.label}:{scratch_pad[route]} for route: {route}"
                )
            else:
                scratch_pad[route] = task.label


@verifications.add("full_task_graph")
def verify_routes_notification_filters(
    task, taskgraph, scratch_pad, graph_config, parameters
):
    """
    This function ensures that only understood filters for notifications are
    specified.

    See: https://docs.taskcluster.net/reference/core/taskcluster-notify/docs/usage
    """
    if task is None:
        return
    route_prefix = "notify."
    valid_filters = (
        "on-any",
        "on-completed",
        "on-defined",
        "on-failed",
        "on-exception",
        "on-pending",
        "on-resolved",
        "on-running",
        "on-transition",
    )
    task_dict = task.task
    routes = task_dict.get("routes", [])

    for route in routes:
        if route.startswith(route_prefix):
            # Get the filter of the route
            route_filter = route.split(".")[-1]
            if route_filter not in valid_filters:
                raise Exception(
                    f"{task.label} has invalid notification filter ({route_filter})"
                )
            if route_filter == "on-any":
                warnings.warn(
                    DeprecationWarning(
                        f"notification filter '{route_filter}' is deprecated. Use "
                        "'on-transition' or 'on-resolved'."
                    )
                )


@verifications.add("full_task_graph")
def verify_index_route(task, taskgraph, scratch_pad, graph_config, parameters):
    """
    This function ensures that routes do not contain forward slashes.
    """
    if task is None:
        return
    task_dict = task.task
    routes = task_dict.get("routes", [])
    route_prefix = "index."

    for route in routes:
        # Check for invalid / in the index route
        if route.startswith(route_prefix) and "/" in route:
            raise Exception(
                f"{task.label} has invalid route with forward slash: {route}"
            )


@verifications.add("full_task_graph")
def verify_dependency_tiers(task, taskgraph, scratch_pad, graph_config, parameters):
    tiers = scratch_pad
    if task is not None:
        tiers[task.label] = (
            task.task.get("extra", {}).get("treeherder", {}).get("tier", sys.maxsize)
        )
    else:

        def printable_tier(tier):
            if tier == sys.maxsize:
                return "unknown"
            return tier

        for task in taskgraph.tasks.values():
            tier = tiers[task.label]
            for d in task.dependencies.values():
                if taskgraph[d].task.get("workerType") == "always-optimized":
                    continue
                if "dummy" in taskgraph[d].kind:
                    continue
                if tier < tiers[d]:
                    raise Exception(
                        f"{task.label} (tier {printable_tier(tier)}) cannot depend on {d} (tier {printable_tier(tiers[d])})"
                    )


@verifications.add("full_task_graph")
def verify_toolchain_alias(task, taskgraph, scratch_pad, graph_config, parameters):
    """
    This function verifies that toolchain aliases are not reused.
    """
    if task is None:
        return
    attributes = task.attributes
    if "toolchain-alias" in attributes:
        keys = attributes["toolchain-alias"]
        if not keys:
            keys = []
        elif isinstance(keys, str):
            keys = [keys]
        for key in keys:
            if key in scratch_pad:
                raise Exception(
                    "Duplicate toolchain-alias in tasks "
                    f"`{task.label}`and `{scratch_pad[key]}`: {key}"
                )
            else:
                scratch_pad[key] = task.label


RE_RESERVED_CACHES = re.compile(r"^(checkouts|tooltool-cache)", re.VERBOSE)


@verifications.add("full_task_graph")
def verify_run_task_caches(task, taskgraph, scratch_pad, graph_config, parameters):
    """Audit for caches requiring run-task.

    run-task manages caches in certain ways. If a cache managed by run-task
    is used by a non run-task task, it could cause problems. So we audit for
    that and make sure certain cache names are exclusive to run-task.

    IF YOU ARE TEMPTED TO MAKE EXCLUSIONS TO THIS POLICY, YOU ARE LIKELY
    CONTRIBUTING TECHNICAL DEBT AND WILL HAVE TO SOLVE MANY OF THE PROBLEMS
    THAT RUN-TASK ALREADY SOLVES. THINK LONG AND HARD BEFORE DOING THAT.
    """
    if task is None:
        return

    cache_prefix = "{trust_domain}-level-{level}-".format(
        trust_domain=graph_config["trust-domain"],
        level=parameters["level"],
    )

    suffix = run_task_suffix()

    payload = task.task.get("payload", {})
    command = payload.get("command") or [""]

    main_command = command[0] if isinstance(command[0], str) else ""
    run_task = main_command.endswith("run-task")

    for cache in payload.get("cache", {}).get(
        "task-reference", payload.get("cache", {})
    ):
        if not cache.startswith(cache_prefix):
            raise Exception(
                f"{task.label} is using a cache ({cache}) which is not appropriate "
                f"for its trust-domain and level. It should start with {cache_prefix}."
            )

        cache = cache[len(cache_prefix) :]

        if not RE_RESERVED_CACHES.match(cache):
            continue

        if not run_task:
            raise Exception(
                f"{task['label']} is using a cache ({cache}) reserved for run-task "
                "change the task to use run-task or use a different "
                "cache name"
            )

        if suffix not in cache:
            raise Exception(
                f"{task['label']} is using a cache ({cache}) reserved for run-task "
                "but the cache name is not dependent on the contents "
                "of run-task; change the cache name to conform to the "
                "naming requirements"
            )


@verifications.add("full_task_graph")
def verify_task_identifiers(task, taskgraph, scratch_pad, graph_config, parameters):
    """Ensures that all tasks have well defined identifiers:
    ``^[a-zA-Z0-9_-]{1,38}$``
    """
    if task is None:
        return

    e = re.compile("^[a-zA-Z0-9_-]{1,38}$")
    for attrib in ("workerType", "provisionerId"):
        if not e.match(task.task[attrib]):
            raise Exception(
                f"task {task.label}.{attrib} is not a valid identifier: {task.task[attrib]}"
            )


@verifications.add("full_task_graph")
def verify_task_dependencies(task, taskgraph, scratch_pad, graph_config, parameters):
    """Ensures that tasks don't have more than 100 dependencies."""
    if task is None:
        return

    number_of_dependencies = (
        len(task.dependencies) + len(task.if_dependencies) + len(task.soft_dependencies)
    )
    if number_of_dependencies > MAX_DEPENDENCIES:
        raise Exception(
            f"task {task.label} has too many dependencies ({number_of_dependencies} > {MAX_DEPENDENCIES})"
        )


@verifications.add("full_task_graph")
def verify_caches_are_volumes(task, taskgraph, scratch_pad, graph_config, parameters):
    """Ensures that all cache paths are defined as volumes.

    Caches and volumes are the only filesystem locations whose content
    isn't defined by the Docker image itself. Some caches are optional
    depending on the task environment. We want paths that are potentially
    caches to have as similar behavior regardless of whether a cache is
    used. To help enforce this, we require that all paths used as caches
    to be declared as Docker volumes. This check won't catch all offenders.
    But it is better than nothing.
    """
    if task is None:
        return

    taskdef = task.task
    if taskdef.get("worker", {}).get("implementation") != "docker-worker":
        return

    volumes = set(taskdef["worker"]["volumes"])
    paths = {c["mount-point"] for c in taskdef["worker"].get("caches", [])}
    missing = paths - volumes

    if missing:
        raise Exception(
            "task {} (image {}) has caches that are not declared as "
            "Docker volumes: {} "
            "(have you added them as VOLUMEs in the Dockerfile?)".format(
                task.label,
                taskdef["worker"]["docker-image"],
                ", ".join(sorted(missing)),
            )
        )


@verifications.add("optimized_task_graph")
def verify_always_optimized(task, taskgraph, scratch_pad, graph_config, parameters):
    """
    This function ensures that always-optimized tasks have been optimized.
    """
    if task is None:
        return
    if task.task.get("workerType") == "always-optimized":
        raise Exception(f"Could not optimize the task {task.label!r}")
