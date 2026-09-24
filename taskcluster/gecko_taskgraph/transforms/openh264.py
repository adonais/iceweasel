# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import taskgraph
from taskgraph.transforms.base import TransformSequence

from gecko_taskgraph import GECKO
from gecko_taskgraph.util.hash import hash_paths

CACHE_TYPE = "openh264.v1"

# Files the build reads out of the checkout, and so which change its output.
RESOURCES = [
    "taskcluster/scripts/openh264/build.sh",
    "taskcluster/scripts/misc/vs-setup.sh",
    "testing/mozharness/external_tools/packagesymbols.py",
]

transforms = TransformSequence()

# Runs after the job transforms, since the cache key is derived from the label,
# and before gecko_taskgraph.transforms.cached_tasks, which consumes `cache`.
cache_transforms = TransformSequence()


@transforms.add
def set_openh264_version(config, jobs):
    fetch_task = config.kind_dependencies_tasks.get("fetch-openh264-source")
    if not fetch_task:
        raise Exception("fetch-openh264-source task not found in kind dependencies")
    version = fetch_task.attributes["openh264_version"]
    for job in jobs:
        job.setdefault("attributes", {})["openh264_version"] = version
        yield job


@cache_transforms.add
def add_cache(config, jobs):
    """Allow the plugin to be reused when nothing that built it has changed.

    The OpenH264 source and gmp-api revisions, and the toolchains, all reach
    the digest via the dependency digests that cached_tasks accumulates, so
    only what is not expressed as a dependency needs to be named here.
    """
    for job in jobs:
        if taskgraph.fast or job["attributes"].get("cached_task") is False:
            yield job
            continue

        digest_data = [
            hash_paths(GECKO, RESOURCES),
            job["attributes"]["openh264_version"],
            job["worker"]["env"]["TARGET"],
        ]
        # The image contents cannot be seen from here, so its name stands in.
        image = job["worker"].get("docker-image", {}).get("in-tree")
        if image:
            digest_data.append(image)

        name = job["label"].replace(f"{config.kind}-", "", 1).replace("/", "-")
        job["cache"] = {
            "type": CACHE_TYPE,
            "name": name,
            "digest-data": digest_data,
        }
        yield job
