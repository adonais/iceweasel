# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import json

from .base import BaseFormatter


class TestSummaryFormatter(BaseFormatter):
    """Passthrough formatter that emits every raw structured log record
    verbatim, except for:
      - `log` actions not at level ERROR, which are dropped
      - `test_status` actions where the status matches the expected status
        (i.e. the subtest result was expected) which are dropped
      - `process_output` actions, which are dropped

    In addition, the fields `thread`, `pid`, `source`, `extra`, `tests`, and any
    field whose name starts with `stackwalk_` are stripped from every
    emitted record
    """

    _ALWAYS_STRIP = ("thread", "pid", "source", "extra", "tests")

    def __call__(self, data):
        action = data.get("action")
        if action == "log" and data.get("level") != "ERROR":
            return
        if action == "process_output":
            return
        if action == "mozleak_total":
            return

        data = {
            k: v
            for k, v in data.items()
            if k not in self._ALWAYS_STRIP and not k.startswith("stackwalk_")
        }

        return json.dumps(data) + "\n"
