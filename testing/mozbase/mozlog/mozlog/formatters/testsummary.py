# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import json

from .base import BaseFormatter


class TestSummaryFormatter(BaseFormatter):
    """Passthrough formatter that emits only:
      - `group_start`, `group_end`, `suite_start`, `suite_end`, `test_start`
        and `test_end` actions
      - `test_status` actions where the status differs from the expected
        status (i.e. the subtest result was unexpected)
      - `crash` actions

    All other actions are dropped.

    In addition, the fields `thread`, `pid`, `source`, `extra`, `tests`, `js_source`, `minidump_path`, `crashing_thread_stack`, `stack` and any
    field whose name starts with `stackwalk_` are stripped from every
    emitted record, except that `stack` is preserved for `crash` actions
    """

    _ALLOWED_ACTIONS = frozenset({
        "group_start",
        "group_end",
        "suite_start",
        "suite_end",
        "test_start",
        "test_end",
        "test_status",
        "crash",
    })
    _ALWAYS_STRIP = frozenset({
        "crashing_thread_stack",
        "extra",
        "js_source",
        "minidump_path",
        "pid",
        "source",
        "stack",
        "tests",
        "thread",
    })
    _ALWAYS_STRIP_CRASH = _ALWAYS_STRIP - {"stack"}

    def __call__(self, data):
        action = data.get("action")
        if action not in self._ALLOWED_ACTIONS:
            return
        if action == "test_status" and (
            "expected" not in data or data["expected"] == data.get("status")
        ):
            return

        strip = self._ALWAYS_STRIP_CRASH if action == "crash" else self._ALWAYS_STRIP

        data = {
            k: v
            for k, v in data.items()
            if k not in strip and not k.startswith("stackwalk_")
        }

        return json.dumps(data) + "\n"
