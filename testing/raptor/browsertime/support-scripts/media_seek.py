# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from base_python_support import BasePythonSupport


class MediaSeek(BasePythonSupport):
    """Summarizes the media seek-latency benchmark.

    The browsertime test script measures seeks in two decoder states and reports
    one replicate per seek as custom_data
    {"seekedWarm": [...], "seekedCold": [...]}. We surface each as a subtest that
    carries all of its replicates so the perf tooling performs the aggregation.
    """

    MEASUREMENTS = {
        "seekedWarm": "seekedWarmLatency",
        "seekedCold": "seekedColdLatency",
    }

    def handle_result(self, bt_result, raw_result, last_result=False, **kwargs):
        for extras in raw_result.get("extras", []):
            data = extras.get("custom_data", {})
            for key, measurement in self.MEASUREMENTS.items():
                values = data.get(key)
                if values:
                    bt_result["measurements"].setdefault(measurement, []).extend(values)

    def summarize_test(self, test, suite, **kwargs):
        suite["type"] = "pageload"
        if suite["subtests"] == {}:
            suite["subtests"] = []
        for measurement_name, replicates in test["measurements"].items():
            if not replicates:
                continue
            suite["subtests"].append(
                self._build_standard_subtest(test, replicates, measurement_name)
            )
        suite["subtests"].sort(key=lambda subtest: subtest["name"])
