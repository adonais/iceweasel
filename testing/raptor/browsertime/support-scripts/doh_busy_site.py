# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import re
from pathlib import Path
from subprocess import PIPE, STDOUT, Popen

from base_python_support import BasePythonSupport
from logger.logger import RaptorLogger

LOG = RaptorLogger(component="raptor-browsertime")

SERVER_JS = Path(__file__).parents[2] / "browsertime/utils/doh_busy_site_server.js"
COUNT_METRICS = (
    "resources",
    "resources_failed",
    "dns_phase_count",
    "dns_over_100ms",
    "doh_reconnects",
)


class DohBusySite(BasePythonSupport):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.server = None
        self.port = None
        # Ports the Android harness reverse-forwards so the device reaches the
        # host-side servers at 127.0.0.1.
        self.reverse_ports = []

    def __deepcopy__(self, memo):
        # The extra profiler run deep-copies the test; share this instance so
        # it keeps using the server started in setup_test.
        return self

    def setup_test(self, test, args):
        super().setup_test(test, args)
        self.server = Popen(
            [args.browsertime_node, str(SERVER_JS)],
            stdout=PIPE,
            stderr=STDOUT,
            universal_newlines=True,
        )
        msg = self.server.stdout.readline().strip()
        ports = re.findall(r":(\d+)", msg)
        if len(ports) != 2:
            raise Exception(f"doh_busy_site server failed to start: {msg!r}")
        LOG.info(f"doh_busy_site: {msg}")
        self.port = ports[0]
        self.reverse_ports = [int(p) for p in ports]

    def modify_command(self, cmd, test):
        cmd += [
            "--firefox.acceptInsecureCerts",
            "true",
            "--firefox.preference",
            "network.trr.mode:2",
            "--firefox.preference",
            f"network.trr.uri:https://doh.busy.example:{self.port}/dns-query",
            "--firefox.preference",
            "network.trr.bootstrapAddr:127.0.0.1",
            "--browsertime.server_url",
            f"https://site.busy.example:{self.port}",
        ]

    def handle_result(self, bt_result, raw_result, last_result=False, **kwargs):
        # One browserScripts and one extras entry per browser cycle.
        for cycle in raw_result["browserScripts"]:
            loadtime = cycle["timings"].get("loadEventEnd")
            if loadtime:
                bt_result["measurements"].setdefault("loadtime", []).append(loadtime)
        for extra in raw_result.get("extras") or []:
            for key, val in extra.get("custom_data", {}).items():
                vals = val if isinstance(val, list) else [val]
                if vals and all(isinstance(v, (int, float)) for v in vals):
                    bt_result["measurements"].setdefault(key, []).extend(vals)

    def summarize_test(self, test, suite, **kwargs):
        if suite.get("subtests") == {}:
            suite["subtests"] = []
        for name, replicates in test["measurements"].items():
            if not replicates:
                continue
            suite["subtests"].append(
                self._build_standard_subtest(
                    test,
                    replicates,
                    name,
                    unit="count" if name in COUNT_METRICS else "ms",
                    should_alert=False,
                )
            )
        suite["subtests"].sort(key=lambda st: st["name"])

    def clean_up(self):
        if self.server:
            self.server.terminate()
            self.server.wait()
