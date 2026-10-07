# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import pathlib

from mozperftest.perfdocs.logger import PerfDocLogger
from mozperftest.perfdocs.utils import read_yaml

logger = PerfDocLogger()

# Config that contains all the hardware info, and mappings
HARDWARE_YAML = pathlib.Path(__file__).parent / "hardware.yml"

# Prefix for cross-referencing in the docs
ANCHOR_PREFIX = "hardware-"


class HardwareDocs:
    """
    Builds the hardware documentation from `hardware.yml`, and resolves the
    worker pools the documented tasks run on to a cross-reference pointing at
    the hardware they are made of.

    The taskcluster platform labels are gathered from the task graph as the
    frameworks are being documented, so that the hardware documentation can
    list the platforms that run on each of the worker pools.

    This is a singleton so that the platforms found by every framework
    gatherer end up in the same place, and so that the warnings for the pools
    that are missing a mapping are only issued once. The setup is done in
    `__new__` rather than in an `__init__`, which would run again, and reset
    the gathered platforms, on every instantiation.
    """

    _instance = None

    def __new__(cls, yaml_path=HARDWARE_YAML):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._setup(yaml_path)
        return cls._instance

    def _setup(self, yaml_path):
        self._yaml_path = yaml_path
        self._hardware = (read_yaml(yaml_path) or {}).get("hardware", {})
        self._warned = set()

        # Reverse index of the `worker-pools` fields, which is the mapping
        # from a worker pool to the hardware it is made of.
        self._pools = {}
        for key, hardware in self._hardware.items():
            for pool in hardware.get("worker-pools") or []:
                self._pools[pool] = key

        # Platforms found in the task graph, keyed by worker pool
        self._platforms = {}

    def _warn(self, msg):
        if msg in self._warned:
            return
        self._warned.add(msg)
        logger.warning(msg, self._yaml_path, restricted=False)

    def record_platform(self, platform, worker_pool):
        """
        Records that a taskcluster platform label was found running on a
        worker pool so that it can be documented under it.

        :param str platform: The taskcluster platform label, e.g.
            `test-linux2404-64-shippable/opt`.
        :param str worker_pool: The `<provisioner>/<worker type>` pool the
            tasks of that platform run on.
        """
        if self.get_hardware_key(worker_pool, platform=platform) is None:
            return
        self._platforms.setdefault(worker_pool, set()).add(platform)

    def get_hardware_key(self, worker_pool, platform=None):
        """
        Returns the key of the hardware entry a worker pool is made of, or
        None when the pool has no mapping.

        A warning is issued for the pools that have no mapping so that
        `./mach perfdocs` fails until one is added.

        :param str worker_pool: The `<provisioner>/<worker type>` pool.
        :param str platform: The platform the pool was found through. Only
            used to give more context in the warning.
        :return str: The hardware key, or None.
        """
        key = self._pools.get(worker_pool)
        if key is None:
            self._warn(
                f"Missing a hardware mapping for the worker pool `{worker_pool}`"
                + (f" (used by `{platform}`)" if platform else "")
                + f". Add it to {self._yaml_path.name}."
            )
        return key

    def get_platform_link(self, platform, worker_pools):
        """
        Returns a cross-reference from a platform to the hardware it runs on.

        A platform can run on more than one pool, e.g. the A55 tests are split
        across two device farms, but those pools are all made of the same
        hardware so a single reference is produced.

        :param str platform: The taskcluster platform label.
        :param list worker_pools: The pools the tasks of that platform run on.
        :return str: The platform, referencing the hardware it runs on.
        """
        keys = sorted({
            key
            for key in (
                self.get_hardware_key(worker_pool, platform=platform)
                for worker_pool in worker_pools
            )
            if key is not None
        })

        if not keys:
            return platform
        return f"{{ref}}`{platform} <{ANCHOR_PREFIX}{keys[0]}>`"

    def build_hardware_documentation(self):
        """
        Builds the documentation of all the hardware that is used, grouped by
        the `group` field of the hardware entries.

        :return list: The lines of the hardware documentation.
        """
        groups = {}
        for key, hardware in self._hardware.items():
            groups.setdefault(hardware.get("group", "Other"), []).append((
                key,
                hardware,
            ))

        documentation = []
        for group, entries in groups.items():
            documentation.extend([f"### {group}", ""])

            for key, hardware in entries:
                name = hardware["name"]
                if hardware.get("reference"):
                    name = f"[{name}]({hardware['reference']})"

                documentation.extend([
                    f"({ANCHOR_PREFIX}{key})=",
                    "",
                    f"#### {name}",
                    "",
                ])

                if hardware.get("description"):
                    documentation.extend([hardware["description"], ""])

                for field in ("location", "machines", "notes"):
                    if hardware.get(field):
                        documentation.append(
                            f"* **{field.capitalize()}**: {hardware[field]}"
                        )

                documentation.append("* **Worker pools, and their platforms**:")
                for pool in hardware.get("worker-pools") or []:
                    documentation.append(f"  * `{pool}`")
                    for platform in sorted(self._platforms.get(pool, [])):
                        documentation.append(f"    * `{platform}`")

                documentation.extend(["", "```text"])
                for field, value in hardware.get("specifications", {}).items():
                    documentation.append(f"{field}: {value}")
                documentation.extend(["```", ""])

        return documentation
