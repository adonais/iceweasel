# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import unittest
from pprint import pprint
from unittest.mock import patch

import pytest
from mozunit import MockedOpen, main
from taskcluster.exceptions import TaskclusterRestFailure
from taskgraph import create
from taskgraph.util import json, taskcluster
from taskgraph.util.taskcluster import _task_definitions_cache

from gecko_taskgraph import actions
from gecko_taskgraph.actions.util import (
    combine_task_graph_files,
    get_label_to_taskid_with_actions,
    get_pushes_in_gap,
    relativize_datestamps,
)
from gecko_taskgraph.decision import read_artifact

TASK_DEF = {
    "created": "2017-10-10T18:33:03.460Z",
    # note that this is not an even number of seconds off!
    "deadline": "2017-10-11T18:33:03.461Z",
    "dependencies": [],
    "expires": "2018-10-10T18:33:04.461Z",
    "payload": {
        "artifacts": {
            "public": {
                "expires": "2018-10-10T18:33:03.463Z",
                "path": "/builds/worker/artifacts",
                "type": "directory",
            },
        },
        "maxRunTime": 1800,
    },
}


@pytest.fixture(scope="module", autouse=True)
def enable_test_mode():
    create.testing = True
    taskcluster.testing = True


class TestRelativize(unittest.TestCase):
    def test_relativize(self):
        rel = relativize_datestamps(TASK_DEF)
        import pprint

        pprint.pprint(rel)
        assert rel["created"] == {"relative-datestamp": "0 seconds"}
        assert rel["deadline"] == {"relative-datestamp": "86400 seconds"}
        assert rel["expires"] == {"relative-datestamp": "31536001 seconds"}
        assert rel["payload"]["artifacts"]["public"]["expires"] == {
            "relative-datestamp": "31536000 seconds"
        }


class TestCombineTaskGraphFiles(unittest.TestCase):
    def test_no_suffixes(self):
        with MockedOpen({}):
            combine_task_graph_files([])
            self.assertRaises(Exception, open("artifacts/to-run.json"))

    @patch("gecko_taskgraph.actions.util.rename_artifact")
    def test_one_suffix(self, rename_artifact):
        combine_task_graph_files(["0"])
        rename_artifact.assert_any_call("task-graph-0.json", "task-graph.json")
        rename_artifact.assert_any_call(
            "label-to-taskid-0.json", "label-to-taskid.json"
        )
        rename_artifact.assert_any_call("to-run-0.json", "to-run.json")

    def test_several_suffixes(self):
        files = {
            "artifacts/task-graph-0.json": json.dumps({"taska": {}}),
            "artifacts/label-to-taskid-0.json": json.dumps({"taska": "TASKA"}),
            "artifacts/to-run-0.json": json.dumps(["taska"]),
            "artifacts/task-graph-1.json": json.dumps({"taskb": {}}),
            "artifacts/label-to-taskid-1.json": json.dumps({"taskb": "TASKB"}),
            "artifacts/to-run-1.json": json.dumps(["taskb"]),
        }
        with MockedOpen(files):
            combine_task_graph_files(["0", "1"])
            self.assertEqual(
                read_artifact("task-graph.json"),
                {
                    "taska": {},
                    "taskb": {},
                },
            )
            self.assertEqual(
                read_artifact("label-to-taskid.json"),
                {
                    "taska": "TASKA",
                    "taskb": "TASKB",
                },
            )
            self.assertEqual(
                sorted(read_artifact("to-run.json")),
                [
                    "taska",
                    "taskb",
                ],
            )


def is_subset(subset, superset):
    if isinstance(subset, dict):
        return all(
            key in superset and is_subset(val, superset[key])
            for key, val in subset.items()
        )

    if isinstance(subset, list) or isinstance(subset, set):
        return all(
            any(is_subset(subitem, superitem) for superitem in superset)
            for subitem in subset
        )

    if isinstance(subset, str):
        return subset in superset

    # assume that subset is a plain value if none of the above match
    return subset == superset


@pytest.mark.parametrize(
    "task_def,expected",
    [
        pytest.param(
            {"tags": {"kind": "decision-task"}},
            {
                "hookPayload": {
                    "decision": {
                        "action": {"cb_name": "retrigger-decision"},
                    },
                },
            },
            id="retrigger_decision",
        ),
        pytest.param(
            {"tags": {"action": "backfill-task"}},
            {
                "hookPayload": {
                    "decision": {
                        "action": {"cb_name": "retrigger-decision"},
                    },
                },
            },
            id="retrigger_backfill",
        ),
    ],
)
def test_extract_applicable_action(
    responses, monkeypatch, actions_json, task_def, expected
):
    _task_definitions_cache.cache.clear()
    base_url = "https://taskcluster"
    decision_task_id = "dddd"
    task_id = "tttt"

    monkeypatch.setenv("TASK_ID", task_id)
    monkeypatch.setenv("TASKCLUSTER_ROOT_URL", base_url)
    monkeypatch.setenv("TASKCLUSTER_PROXY_URL", base_url)
    responses.add(
        responses.GET,
        f"{base_url}/api/queue/v1/task/{task_id}",
        status=200,
        json=task_def,
    )
    action = actions.util._extract_applicable_action(
        actions_json, "retrigger", decision_task_id, task_id
    )
    pprint(action, indent=2)
    assert is_subset(expected, action)


GRAPH_CONFIG = {"trust-domain": "gecko", "project-repo-param-prefix": ""}


def test_get_pushes_in_gap_finds_boundary(mocker):
    """Stop early when a push with the label is found within first chunk."""
    label = "raptor-browsertime-firefox-tp6"
    parameters = {
        "pushlog_id": "125",
        "head_repository": "https://hg.mozilla.org/mozilla-central",
        "project": "mozilla-central",
    }

    # pushes 100..124, boundary found at push 106 (has the label)
    mocker.patch(
        "gecko_taskgraph.actions.util.get_pushes",
        return_value=[str(i) for i in range(100, 125)],
    )

    def fake_label_to_taskid(project, push_id, graph_config, label=None):
        if push_id == "106":
            return {label: "task-abc"}
        return {}

    mocker.patch(
        "gecko_taskgraph.actions.util.get_label_to_taskid_with_actions",
        side_effect=fake_label_to_taskid,
    )

    result = get_pushes_in_gap(parameters, label, GRAPH_CONFIG)

    # only pushes after the boundary (107..124) should be in gap
    assert result == [str(i) for i in range(107, 125)]


def test_get_pushes_in_gap_no_boundary_found(mocker):
    """Return all fetched pushes when no boundary is found within max depth."""
    label = "raptor-browsertime-firefox-tp6"
    parameters = {
        "pushlog_id": "125",
        "head_repository": "https://hg.mozilla.org/mozilla-central",
        "project": "mozilla-central",
    }

    # 4 chunks of 25, none has the label
    mocker.patch(
        "gecko_taskgraph.actions.util.get_pushes",
        side_effect=[
            [str(i) for i in range(100, 125)],
            [str(i) for i in range(75, 100)],
            [str(i) for i in range(50, 75)],
            [str(i) for i in range(25, 50)],
        ],
    )
    mocker.patch(
        "gecko_taskgraph.actions.util.get_label_to_taskid_with_actions",
        return_value={},
    )

    result = get_pushes_in_gap(parameters, label, GRAPH_CONFIG)

    # all 100 pushes should be returned as gap
    assert result == [str(i) for i in range(25, 125)]


def test_get_pushes_in_gap_boundary_at_first_push(mocker):
    """
    Boundary found at the first searched push (124, newest push),
    so no pushes are added to gap before returning
    """
    label = "raptor-browsertime-firefox-tp6"
    parameters = {
        "pushlog_id": "125",
        "head_repository": "https://hg.mozilla.org/mozilla-central",
        "project": "mozilla-central",
    }

    mocker.patch(
        "gecko_taskgraph.actions.util.get_pushes",
        return_value=[str(i) for i in range(100, 125)],
    )

    def _label_map(project, push_id, graph_config, label=None):
        if push_id == "124":
            return {label: "task-abc"}
        return {}

    mocker.patch(
        "gecko_taskgraph.actions.util.get_label_to_taskid_with_actions",
        side_effect=_label_map,
    )

    result = get_pushes_in_gap(parameters, label, GRAPH_CONFIG)

    # boundary found first searched push at push 124, gap should be empty
    assert result == []


def test_get_label_to_taskid_with_actions_early_exit_on_decision_hit(mocker):
    """Skip action task fetch when label is already in the decision snapshot."""
    label = "test-label"
    project = "mozilla-central"
    push_id = "100"

    mocker.patch(
        "gecko_taskgraph.actions.util.get_decision_task_id",
        return_value="decision-task-id",
    )
    mocker.patch(
        "gecko_taskgraph.actions.util.get_artifact",
        return_value={label: "task-from-decision"},
    )
    list_tasks_mock = mocker.patch("gecko_taskgraph.actions.util.list_tasks")
    get_parameters_mock = mocker.patch("gecko_taskgraph.actions.util.get_parameters")

    result = get_label_to_taskid_with_actions(project, push_id, GRAPH_CONFIG, label)

    assert result == {label: "task-from-decision"}
    list_tasks_mock.assert_not_called()
    get_parameters_mock.assert_not_called()


def test_get_label_to_taskid_with_actions_merges_action_tasks(mocker):
    """Labels added by action tasks are merged into the result."""
    label = "test-label"
    project = "mozilla-central"
    push_id = "100"

    mocker.patch(
        "gecko_taskgraph.actions.util.get_decision_task_id",
        return_value="decision-task-id",
    )
    mocker.patch(
        "gecko_taskgraph.actions.util.get_parameters",
        return_value={"project": "mozilla-central", "head_rev": "abc123"},
    )

    action_task_id = "action-task-id"
    mocker.patch(
        "gecko_taskgraph.actions.util.list_tasks",
        return_value=[action_task_id],
    )

    def fake_get_artifact(task_id, artifact):
        if task_id == "decision-task-id":
            return {"other-label": "task-from-decision"}
        if task_id == action_task_id:
            return {label: "task-from-action"}
        return {}

    mocker.patch(
        "gecko_taskgraph.actions.util.get_artifact",
        side_effect=fake_get_artifact,
    )

    result = get_label_to_taskid_with_actions(project, push_id, GRAPH_CONFIG, label)

    assert result[label] == "task-from-action"
    assert result["other-label"] == "task-from-decision"


def test_get_label_to_taskid_with_actions_handles_404(mocker):
    """A 404 from an action task's artifact is silently ignored."""
    label = "test-label"
    project = "mozilla-central"
    push_id = "100"

    mocker.patch(
        "gecko_taskgraph.actions.util.get_decision_task_id",
        return_value="decision-task-id",
    )
    mocker.patch(
        "gecko_taskgraph.actions.util.get_parameters",
        return_value={"project": "mozilla-central", "head_rev": "abc123"},
    )
    mocker.patch(
        "gecko_taskgraph.actions.util.list_tasks",
        return_value=["action-task-id"],
    )

    def fake_get_artifact(task_id, artifact):
        if task_id == "decision-task-id":
            return {}
        err = TaskclusterRestFailure("not found", None, status_code=404)
        raise err

    mocker.patch(
        "gecko_taskgraph.actions.util.get_artifact",
        side_effect=fake_get_artifact,
    )

    result = get_label_to_taskid_with_actions(project, push_id, GRAPH_CONFIG, label)

    assert result == {}


if __name__ == "__main__":
    main()
