# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from unittest import mock

import mozunit
import pytest
import yaml

TASKS = [
    {
        "kind": "build",
        "label": "build-windows",
        "attributes": {
            "build_platform": "windows",
        },
    },
    {
        "kind": "test",
        "label": "test-windows-mochitest-e10s",
        "attributes": {
            "unittest_suite": "mochitest",
            "unittest_flavor": "browser-chrome",
            "mochitest_try_name": "mochitest",
        },
    },
]


@pytest.fixture(autouse=True)
def skip_taskgraph_generation(monkeypatch, tg):
    def fake_generate_tasks(*args, **kwargs):
        return tg

    from tryselect import tasks

    monkeypatch.setattr(tasks, "generate_tasks", fake_generate_tasks)


@pytest.mark.xfail(
    strict=False, reason="Bug 1635204: test_shared_presets[sample-suites] is flaky"
)
def test_shared_presets(run_mach, shared_name, shared_preset):
    """This test makes sure that we don't break any of the in-tree presets when
    renaming/removing variables in any of the selectors.
    """
    assert "description" in shared_preset
    assert "selector" in shared_preset

    selector = shared_preset["selector"]
    if selector == "fuzzy":
        assert "query" in shared_preset
        assert isinstance(shared_preset["query"], list)

    # Run the preset and assert there were no exceptions.
    assert run_mach(["try", "--no-push", "--preset", shared_name]) == 0


@pytest.fixture
def run_perf_preset(run_mach, monkeypatch, tmp_path):
    def inner(preset):
        preset_path = tmp_path / "try_presets.yml"
        preset_path.write_text(yaml.safe_dump({"test-preset": preset}))
        monkeypatch.setenv("MACH_TRY_PRESET_PATHS", str(preset_path))

        with mock.patch("tryselect.selectors.perf.run", return_value=None) as run:
            result = run_mach(["try", "perf", "--preset", "test-preset"])
        return result, run

    return inner


@pytest.mark.parametrize(
    "preset, full_task_graph",
    [
        ({"selector": "fuzzy", "query": ["'foo"], "rebuild": 10}, False),
        ({"selector": "fuzzy", "query": ["'foo"], "rebuild": 10, "full": True}, True),
    ],
)
def test_fuzzy_preset_with_perf(run_perf_preset, preset, full_task_graph):
    result, run = run_perf_preset(preset)
    assert result == 0

    kwargs = run.call_args.kwargs
    assert kwargs["show_all"]
    assert kwargs["full_task_graph"] == full_task_graph
    assert kwargs["query"] == ["'foo"]
    assert kwargs["try_config_params"]["try_task_config"]["rebuild"] == 10


def test_fuzzy_preset_with_perf_unsupported(run_perf_preset):
    with pytest.raises(SystemExit) as e:
        run_perf_preset({"selector": "fuzzy", "query": ["'foo"], "exact": True})
    assert e.value.code == 1


def test_perf_preset(run_perf_preset):
    result, run = run_perf_preset({
        "selector": "perf",
        "show_all": True,
        "query": ["'foo"],
        "rebuild": 5,
    })
    assert result == 0

    kwargs = run.call_args.kwargs
    assert kwargs["show_all"]
    assert "full_task_graph" not in kwargs
    assert kwargs["query"] == ["'foo"]
    assert kwargs["try_config_params"]["try_task_config"]["rebuild"] == 5


if __name__ == "__main__":
    mozunit.main()
