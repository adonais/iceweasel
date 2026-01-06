# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import taskgraph
from taskgraph.graph import Graph
from taskgraph.transforms.base import TransformSequence
from taskgraph.util.cached_tasks import add_optimization

transforms = TransformSequence()


def order_tasks(config, tasks):
    """Iterate image tasks in an order where parent tasks come first."""
    kind_prefix = config.kind + "-"
    pending = {task["label"]: task for task in tasks}
    nodes = set(pending)
    edges = {
        (label, dep, "")
        for label in pending
        for dep in pending[label].get("dependencies", {}).values()
        if dep.startswith(kind_prefix)
    }
    graph = Graph(nodes, edges)

    for label in graph.visit_postorder():
        yield pending.pop(label)
    assert not pending


def format_task_digest(cached_task):
    return "/".join(
        [
            cached_task["type"],
            cached_task["name"],
            cached_task["digest"],
        ]
    )


@transforms.add
def cache_task(config, tasks):
    if taskgraph.fast:
        for task in tasks:
            yield task
        return

    digests = {}
    for task in config.kind_dependencies_tasks.values():
        if "cached_task" in task.attributes:
            digests[task.label] = format_task_digest(task.attributes["cached_task"])

    for task in order_tasks(config, tasks):
        cache = task.pop("cache", None)
        if cache is None:
            yield task
            continue

        dependency_digests = []
        for p in task.get("dependencies", {}).values():
            if p in digests:
                dependency_digests.append(digests[p])
            else:
                raise Exception(
                    "Cached task {} has uncached parent task: {}".format(
                        task["label"], p
                    )
                )

        digest_data = cache["digest-data"] + sorted(dependency_digests)

        # Chain of trust affects task artifacts therefore it should influence
        # cache digest.
        if task.get("worker", {}).get("chain-of-trust"):
            digest_data.append(str(task["worker"]["chain-of-trust"]))

        add_optimization(
            config,
            task,
            cache_type=cache["type"],
            cache_name=cache["name"],
            digest_data=digest_data,
        )
        digests[task["label"]] = format_task_digest(task["attributes"]["cached_task"])

        yield task
