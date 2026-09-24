# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import filters
from base_python_support import BasePythonSupport
from cmdline import FIREFOX_APPS
from logger.logger import RaptorLogger

LOG = RaptorLogger(component="perftest-support-class")


class MediaPlayback(BasePythonSupport):
    """Summarizes the media playback benchmark.

    The energy this suite measures comes from add_additional_metrics, which has to
    be called explicitly from summarize_test.
    """

    # name -> (unit, lower_is_better)
    PAGE_METRICS = {
        "presentedFps": ("fps", False),
    }

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.subtest_alert_on = []
        self.measured_a_cycle = False
        self.run_local = False
        self.saw_power = False

    def setup_test(self, next_test, args):
        super().setup_test(next_test, args)
        # Runs before the manifest turns alert_on into a list, so it is still raw.
        alert_on = next_test.get("alert_on", "") or ""
        if isinstance(alert_on, str):
            alert_on = alert_on.replace("\n", ",").split(",")
        self.subtest_alert_on = [name.strip() for name in alert_on if name.strip()]
        self.run_local = getattr(args, "run_local", False)

    def _should_alert(self, name):
        return name in self.subtest_alert_on and self.app in FIREFOX_APPS

    def handle_result(self, bt_result, raw_result, **kwargs):
        for extras in raw_result.get("extras", []):
            data = extras.get("custom_data", {})
            if data:
                self.measured_a_cycle = True
            for name in self.PAGE_METRICS:
                value = data.get(name)
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    bt_result["measurements"].setdefault(name, []).append(value)

    def report_test_success(self):
        # Either half can go missing without anything raising, leaving a green
        # suite that measured nothing.
        if not self.measured_a_cycle:
            return False
        if self.platform == "Windows" and not self.run_local and not self.saw_power:
            LOG.error("no power data was collected; this suite exists to measure it")
            return False
        return True

    def _merge_subtest(self, suite, subtest):
        """summarize_test runs once per page cycle against a shared suite, so an
        appended subtest would appear once per cycle with one replicate each.
        """
        name = subtest["name"]
        subtests = suite["subtests"]
        existing = None
        if isinstance(subtests, dict):
            existing = subtests.get(name)
            if existing is None:
                subtests[name] = subtest
        else:
            existing = next((s for s in subtests if s["name"] == name), None)
            if existing is None:
                subtests.append(subtest)
        if existing is not None:
            existing["replicates"].extend(subtest["replicates"])
            existing["value"] = round(filters.mean(existing["replicates"]), 3)

    def summarize_test(self, test, suite, **kwargs):
        suite["type"] = "benchmark"
        if suite["subtests"] == {}:
            suite["subtests"] = []

        for name, replicates in test["measurements"].items():
            if not replicates or self.is_additional_metric(name):
                continue
            if name not in self.PAGE_METRICS:
                continue
            unit, lower_is_better = self.PAGE_METRICS[name]
            subtest = self._build_standard_subtest(
                test,
                replicates,
                name,
                unit=unit,
                should_alert=self._should_alert(name),
            )
            # Assigned, not passed: _build_standard_subtest folds a False argument
            # into the test-level default.
            subtest["lowerIsBetter"] = lower_is_better
            self._merge_subtest(suite, subtest)

        # cpuTime's replicates do not correspond to the windows this suite brackets.
        self.add_additional_metrics(test, suite, exclude=["cpuTime"], **kwargs)
        self.saw_power = any(
            s["name"].startswith("powerUsage_") and s.get("replicates")
            for s in suite["subtests"]
        )

        # Rebuilt from the whole run each cycle, so the last copy is complete.
        deduped = {}
        for subtest in suite["subtests"]:
            deduped[subtest["name"]] = subtest

        for name, subtest in deduped.items():
            subtest["shouldAlert"] = self._should_alert(name)
            # Median, not the base class's mean: a disturbed cycle would move a
            # mean. Replicates are left whole so the raw values stay inspectable.
            if subtest.get("replicates"):
                subtest["value"] = round(filters.median(subtest["replicates"]), 3)

        suite["subtests"] = sorted(deduped.values(), key=lambda s: s["name"])
