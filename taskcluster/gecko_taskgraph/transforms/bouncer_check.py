# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
from shlex import quote as shell_quote

from mozilla_taskgraph.worker_types import get_release_config
from taskgraph.transforms.base import TransformSequence

logger = logging.getLogger(__name__)

transforms = TransformSequence()


@transforms.add
def add_command(config, jobs):
    """Build the bouncer-check command from resolved fields."""
    release_config = get_release_config(config)

    for job in jobs:
        run = job["run"]
        command = [
            "python",
            "python/mozrelease/mozrelease/bouncer_check.py",
            "--config",
            run.pop("config"),
            "--bouncer-prefix",
            run.pop("bouncer-prefix"),
        ]
        for locale in run.pop("locales", []):
            command.extend(["--locale", locale])
        for cdn_url in run.pop("cdn-urls", []):
            command.extend(["--cdn-url", cdn_url])

        if config.kind == "cron-bouncer-check":
            command.extend([
                "--product-field",
                run.pop("product-field"),
                "--products-url",
                run.pop("products-url"),
            ])
        elif config.kind == "release-bouncer-check":
            command.extend(["--version", release_config["version"]])

        for partial in release_config.get("partial_versions", "").split(","):
            if partial:
                command.extend([
                    "--previous-version",
                    partial.split("build")[0].strip(),
                ])

        run.update({
            "using": "mach",
            "clone-with": "hg",
            "mach": " ".join(map(shell_quote, command)),
        })
        yield job
