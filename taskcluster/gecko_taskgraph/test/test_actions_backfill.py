# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


from unittest import mock

import pytest
from mozunit import main

from gecko_taskgraph.actions.backfill import (
    _is_perf_task,
    _lower_priority,
    backfill_modifier,
)


@pytest.mark.parametrize(
    "current,max_priority,expected",
    [
        ("high", "very-low", "very-low"),
        ("low", "very-low", "very-low"),
        ("very-low", "very-low", "very-low"),
        ("lowest", "very-low", "lowest"),
        (None, "very-low", "very-low"),
        ("high", "unknown", "high"),
    ],
)
def test_lower_priority(current, max_priority, expected):
    assert _lower_priority(current, max_priority) == expected


@pytest.mark.parametrize(
    "kind,attributes,expected_perf",
    [
        ("test", {"unittest_suite": "talos"}, True),
        ("browsertime", {"unittest_suite": "raptor"}, True),
        ("perftest", {}, True),
        ("test", {"unittest_suite": "mochitest-browser-chrome"}, False),
        ("test", {"unittest_suite": "xpcshell"}, False),
        ("build", {}, False),
    ],
)
def test_is_perf_task(kind, attributes, expected_perf):
    task = mock.MagicMock()
    task.kind = kind
    task.attributes = attributes
    assert _is_perf_task(task) == expected_perf


def _make_task(label, priority):
    task = mock.MagicMock()
    task.label = label
    task.task = {"priority": priority}
    return task


def test_backfill_modifier_lowers_priority_for_all_tasks():
    target = _make_task("test-raptor", "low")
    dependency = _make_task("build-opt", "high")
    for task in (target, dependency):
        backfill_modifier(task, input={"label": "test-raptor"}, lower_priority=True)
    assert target.task["priority"] == "very-low"
    assert dependency.task["priority"] == "very-low"


def test_backfill_modifier_keeps_priority_when_not_lowered():
    target = _make_task("test-mochitest", "low")
    dependency = _make_task("build-opt", "high")
    for task in (target, dependency):
        backfill_modifier(task, input={"label": "test-mochitest"}, lower_priority=False)
    assert target.task["priority"] == "low"
    assert dependency.task["priority"] == "high"


def test_backfill_modifier_does_not_raise_when_already_lowest():
    task = _make_task("test-raptor", "lowest")
    backfill_modifier(task, input={"label": "test-raptor"}, lower_priority=True)
    assert task.task["priority"] == "lowest"


if __name__ == "__main__":
    main()
