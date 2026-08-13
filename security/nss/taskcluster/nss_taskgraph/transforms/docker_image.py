# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from taskgraph.transforms.base import TransformSequence

transforms = TransformSequence()


#: Published arm64 build of the image_builder. The default
#: ``mozillareleases/image_builder`` is amd64-only and fails with "exec format
#: error" on an aarch64 host, so arm64 images must be built with this instead.
ARM64_IMAGE_BUILDER = (
    "mozillareleases/image_builder_arm64:6.2.0"
    "@sha256:517a288809aaa4d2cbaa82be6febaf13fb49f3c05c8a4da01ceb9f013f3e000c"
)


@transforms.add
def build_aarch64_images_on_aarch64(config, tasks):
    """Build aarch64 docker images natively on an aarch64 worker.

    Docker images are architecture specific, so images destined for aarch64
    workers must be built natively on an aarch64 worker. We follow the
    convention that any image whose name ends in ``-aarch64`` is an arm64 image
    and make two changes the upstream ``taskgraph.transforms.docker_image``
    transform can't make for us:

    1. Route the build to the ``images-aarch64`` worker alias (the upstream
       transform hardcodes ``images``). See taskcluster/config.yml.
    2. Build it with the published arm64 image_builder instead of the amd64-only
       ``mozillareleases/image_builder`` the upstream transform hardcodes.
    """
    for task in tasks:
        image_name = task["attributes"]["image_name"]
        if not image_name.endswith("-aarch64"):
            yield task
            continue
        task["worker-type"] = "images-aarch64"
        task["worker"]["docker-image"] = ARM64_IMAGE_BUILDER
        cache = task.get("cache")
        if cache and "digest-data" in cache:
            cache["digest-data"].append(f"image-builder-image:{ARM64_IMAGE_BUILDER}")
        yield task
