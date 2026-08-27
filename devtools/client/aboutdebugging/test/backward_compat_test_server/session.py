# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Provisioning session shared by the local and the CI entry points.

Wraps everything the client tests need on the other end of the connection: the
server Firefox, the control channel, and the JSON configuration file that
DEVTOOLS_COMPAT_CONFIG points at.
"""

from __future__ import annotations

import contextlib
import json
import os
from typing import Iterator, Mapping

from . import downloads
from .control import ControlServer
from .logs import log
from .servers import DesktopServer

# Server recipes. "local" runs the build under test, the other ones download the
# latest build of a distribution channel.
SERVERS = ["local"] + sorted(downloads.PRODUCTS)


def create_server(
    recipe: str,
    binary: str,
    cache_dir: str,
    log_dir: str,
    headless: bool,
) -> DesktopServer:
    if recipe not in SERVERS:
        raise ValueError(
            f"Unknown server recipe '{recipe}', expected one of {', '.join(SERVERS)}"
        )

    if recipe != "local":
        binary = downloads.provision(recipe, cache_dir)
        log(f"Using the {recipe} binary at {binary}")

    return DesktopServer(
        binary=binary,
        gecko_log=os.path.join(log_dir, "compat-server.log"),
        headless=headless,
    )


@contextlib.contextmanager
def provisioned_server(
    binary: str,
    cache_dir: str,
    log_dir: str,
    server: str = "local",
    headless: bool = True,
) -> Iterator[Mapping[str, str]]:
    """Provision a server and describe it in a JSON configuration file.

    :param binary: path of the Firefox binary, used by the "local" recipe.
    :param cache_dir: where downloaded builds are cached.
    :param log_dir: where the server log and the configuration are written.
    :returns: a context manager yielding a dict of environment variables
        to be merged with the target environment.
    """
    instance = create_server(server, binary, cache_dir, log_dir, headless)
    control = ControlServer(instance)

    log(f"Starting the '{server}' DevTools server")
    instance.start()

    try:
        control.start()

        description = instance.describe()
        config = {
            "server": server,
            "host": instance.host,
            "control": control.url,
            "runtime": description,
        }
        log(
            "DevTools server ready on {} ({} {}, {} channel)".format(
                config["host"],
                description["brandName"],
                description["version"],
                description["channel"],
            )
        )

        config_path = os.path.join(log_dir, "config.json")
        with open(config_path, "w") as fp:
            json.dump(config, fp, indent=2)

        yield {"DEVTOOLS_COMPAT_CONFIG": config_path}
    finally:
        control.stop()
        instance.stop()
