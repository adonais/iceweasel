# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json

from mozsystemmonitor.resourcemonitor import SystemResourceMonitor

from ..reader import LogHandler


class ResourceHandler(LogHandler):
    """Handler class for recording a resource usage profile."""

    def __init__(self, command_context, **kwargs):
        super(ResourceHandler, self).__init__(**kwargs)

        self.build_resources_profile_path = command_context._get_state_filename(
            "profile_build_resources.json"
        )
        self.resources = SystemResourceMonitor(
            poll_interval=0.1,
        )
        self.resources.start()

    def shutdown(self, data):
        if not self.resources:
            return

        self.resources.stop()
        with open(
            self.build_resources_profile_path, "w", encoding="utf-8", newline="\n"
        ) as fh:
            to_write = json.dumps(self.resources.as_profile(), separators=(",", ":"))
            fh.write(to_write)

    def suite_start(self, data):
        self.current_suite = data.get("name")
        SystemResourceMonitor.begin_marker("suite", self.current_suite)

    def suite_end(self, data):
        SystemResourceMonitor.end_marker("suite", self.current_suite)

    def group_start(self, data):
        SystemResourceMonitor.begin_marker("test", data["name"])

    def group_end(self, data):
        SystemResourceMonitor.end_marker("test", data["name"])

    def test_start(self, data):
        SystemResourceMonitor.begin_marker("test", data["test"])

    def test_end(self, data):
        SystemResourceMonitor.end_marker("test", data["test"])

    def log(self, data):
        level = data.get("level").upper()
        time = self.resources.convert_to_monotonic_time(data.get("time") / 1000)
        SystemResourceMonitor.record_marker(level, time, time, data.get("message"))
