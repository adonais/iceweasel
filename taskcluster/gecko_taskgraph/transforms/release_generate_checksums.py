# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Transform the checksums task into an actual task description.
"""

import logging
from shlex import quote as shell_quote

from mozilla_taskgraph.worker_types import get_release_config
from taskgraph.transforms.base import TransformSequence

logger = logging.getLogger(__name__)

transforms = TransformSequence()


@transforms.add
def add_command(config, jobs):
    release_config = get_release_config(config)
    for job in jobs:
        run = job["run"]
        command = [
            "python",
            "python/mozrelease/mozrelease/generate_checksums.py",
            "--stage-product",
            run.pop("stage-product"),
            "--bucket-name",
            run.pop("bucket-name"),
            "--version",
            release_config["version"],
            "--build-number",
            str(release_config["build_number"]),
            "--output-dir",
            run.pop("output-dir"),
        ]
        run.update({
            "using": "mach",
            "mach": " ".join(map(shell_quote, command)),
        })
        yield job
