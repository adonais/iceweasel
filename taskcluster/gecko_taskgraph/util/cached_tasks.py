# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from taskgraph.util.cached_tasks import TARGET_CACHE_INDEX
from taskgraph.util.cached_tasks import add_optimization as tg_add_optimization


def add_optimization(
    config, taskdesc, cache_type, cache_name, digest=None, digest_data=None
):
    """
    Allow the results of this task to be cached. This adds index routes to the
    task so it can be looked up for future runs, and optimization hints so that
    cached artifacts can be found. Exactly one of `digest` and `digest_data`
    must be passed.

    :param TransformConfig config: The configuration for the kind being transformed.
    :param dict taskdesc: The description of the current task.
    :param str cache_type: The type of task result being cached.
    :param str cache_name: The name of the object being cached.
    :param digest: A unique string indentifying this version of the artifacts
        being generated. Typically this will be the hash of inputs to the task.
    :type digest: bytes or None
    :param digest_data: A list of bytes representing the inputs of this task.
        They will be concatenated and hashed to create the digest for this
        task.
    :type digest_data: list of bytes or None
    """
    if taskdesc.get("attributes", {}).get("cached_task") is False:
        return

    tg_add_optimization(
        config, taskdesc, cache_type, cache_name, digest=digest, digest_data=digest_data
    )

    if "cached-task-prefix" in config.graph_config["taskgraph"]:
        cache_prefix = config.graph_config["taskgraph"]["cached-task-prefix"]
    else:
        cache_prefix = config.graph_config["trust-domain"]

    # Allow future pushes to find this task before it completes
    # Implementation in morphs
    taskdesc["attributes"]["eager_indexes"] = [
        TARGET_CACHE_INDEX.format(
            cache_prefix=cache_prefix,
            level=config.params["level"],
            type=cache_type,
            name=cache_name,
            digest=taskdesc["attributes"]["cached_task"]["digest"],
        )
    ]
