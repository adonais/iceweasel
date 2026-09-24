# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Tests for the 'job' transform subsystem.
"""

import os
from copy import deepcopy

import pytest
from mozunit import main
from taskgraph.config import load_graph_config
from taskgraph.transforms.base import TransformConfig

from gecko_taskgraph import GECKO
from gecko_taskgraph.test.conftest import FakeParameters
from gecko_taskgraph.transforms import job
from gecko_taskgraph.transforms.job import get_platform, run_task  # noqa: F401
from gecko_taskgraph.transforms.task import group_name_variant

here = os.path.abspath(os.path.dirname(__file__))


TASK_DEFAULTS = {
    "description": "fake description",
    "label": "fake-task-label",
    "run": {
        "using": "run-task",
    },
}


@pytest.fixture(scope="module")
def config():
    graph_config = load_graph_config(os.path.join(GECKO, "taskcluster"))
    params = FakeParameters({
        "base_repository": "http://hg.example.com",
        "head_repository": "http://hg.example.com",
        "head_rev": "abcdef",
        "level": 1,
        "project": "example",
    })
    return TransformConfig(
        "job_test", here, {}, params, {}, graph_config, write_artifacts=False
    )


@pytest.fixture()
def transform(monkeypatch, config):
    """Run the job transforms on the specified task but return the inputs to
    `configure_taskdesc_for_run` without executing it.

    This gives test functions an easy way to generate the inputs required for
    many of the `run_using` subsystems.
    """

    def inner(task_input):
        task = deepcopy(TASK_DEFAULTS)
        task.update(task_input)
        frozen_args = []

        def _configure_taskdesc_for_run(*args):
            frozen_args.extend(args)

        monkeypatch.setattr(
            job, "configure_taskdesc_for_run", _configure_taskdesc_for_run
        )

        for _ in job.transforms(config, [task]):
            # This forces the generator to be evaluated
            pass

        return frozen_args

    return inner


@pytest.mark.parametrize(
    "groupSymbol,description",
    [
        pytest.param("M", "Mochitests", id="no_variants"),
        pytest.param(
            "M-spi",
            "Mochitests with socket process enabled",
            id="spi variant",
        ),
        pytest.param(
            "M-spi-nofis",
            "Mochitests without fission enabled with socket process enabled",
            id="spi and nofis variants",
        ),
        pytest.param("M-fake", "", id="invalid group name"),
    ],
    ids=lambda t: t["worker-type"],
)
def test_group_name(config, groupSymbol, description):
    group_names = config.graph_config["treeherder"]["group-names"]
    generated_description = group_name_variant(group_names, groupSymbol)
    assert description == generated_description


@pytest.mark.parametrize(
    "worker_os,worker_type,expected",
    [
        # Apple Silicon macOS workers select the native arm64 python: the
        # arm64 builders and the M-series test pools (whose aliases carry an
        # -m<n>/-m-vms suffix rather than "arm64").
        pytest.param("macosx", "b-osx-arm64", "macosx64-aarch64", id="mac-arm-build"),
        pytest.param(
            "macosx",
            "gecko-3-b-osx-arm64",
            "macosx64-aarch64",
            id="mac-arm-build-resolved",
        ),
        pytest.param("macosx", "t-osx-1500-m4", "macosx64-aarch64", id="mac-arm-m4"),
        pytest.param(
            "macosx", "t-osx-1500-m-vms", "macosx64-aarch64", id="mac-arm-m-vms"
        ),
        pytest.param("macosx", "t-osx-1400-m2", "macosx64-aarch64", id="mac-arm-m2"),
        # Intel macOS workers stay on the x86_64 python.
        pytest.param("macosx", "b-osx-1015", "macosx64", id="mac-intel-build"),
        pytest.param("macosx", "t-osx-1015-r8", "macosx64", id="mac-intel-r8"),
        pytest.param("macosx", "t-osx-1400-r8", "macosx64", id="mac-intel-1400-r8"),
        pytest.param("macosx", "t-osx-1015-power", "macosx64", id="mac-intel-power"),
        # Other platforms are unaffected.
        pytest.param("linux", "b-linux-aarch64", "linux64-aarch64", id="linux-arm"),
        pytest.param("linux", "b-linux-docker-amd", "linux64", id="linux-x64"),
        pytest.param("windows", "b-win-aarch64", "win64", id="windows-arm"),
        pytest.param("windows", "b-win2022", "win64", id="windows-x64"),
    ],
)
def test_get_platform(worker_os, worker_type, expected):
    task = {"worker": {"os": worker_os}, "worker-type": worker_type}
    assert get_platform(task) == expected


if __name__ == "__main__":
    main()
