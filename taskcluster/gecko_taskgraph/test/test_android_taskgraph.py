# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Tests for the android_taskgraph job handlers and transforms.
"""

import os

import pytest
from android_taskgraph import job
from android_taskgraph.transforms import build_android_app
from mozunit import main
from taskgraph.config import load_graph_config
from taskgraph.transforms.base import TransformConfig

from gecko_taskgraph import GECKO
from gecko_taskgraph.test.conftest import FakeParameters

here = os.path.abspath(os.path.dirname(__file__))


@pytest.fixture(scope="module")
def config():
    graph_config = load_graph_config(os.path.join(GECKO, "taskcluster"))
    params = FakeParameters({
        "base_repository": "http://hg.example.com",
        "head_repository": "http://hg.example.com",
        "head_rev": "abcdef",
        "level": 1,
        "moz_build_date": "20260917000000",
        "project": "example",
    })
    return TransformConfig(
        "android_test", here, {}, params, {}, graph_config, write_artifacts=False
    )


def test_gradlew_uploads_build_metrics(config, monkeypatch):
    monkeypatch.setattr(job, "configure_taskdesc_for_run", lambda *args: None)
    task = {
        "run": {
            "using": "gradlew",
            "gradlew": ["clean", "assembleDebug"],
        },
        "worker": {"implementation": "docker-worker"},
    }
    taskdesc = {}

    job.configure_gradlew(config, task, taskdesc)

    worker = taskdesc["worker"]
    assert worker["env"]["GRADLEW_ARGS"] == "clean assembleDebug"
    assert worker["env"]["BUILD_METRICS_DIR"] == job.BUILD_METRICS_DIR
    assert {
        "type": "directory",
        "name": "public/build/build-metrics",
        "path": job.BUILD_METRICS_DIR,
    } in worker["artifacts"]


def test_track_build_times_labels_the_perfherder_series(config):
    tasks = [
        {
            "name": "fenix-debug",
            "run": {
                "gradle-build-type": "debug",
                "gradle-build-name": "debug",
                "track-build-times": True,
            },
        },
        {
            "name": "fenix-debug",
            "run": {
                "gradle-build-type": "debug",
                "gradle-build-name": "debug",
                "gradle-package-command": "bundle",
                "track-build-times": True,
            },
        },
        {
            "name": "fenix-nightly-firebase",
            "run": {"gradle-build-type": "nightly", "gradle-build-name": "nightly"},
        },
    ]

    tracked, bundle, untracked = build_android_app.build_gradle_command(config, tasks)

    assert tracked["run"]["gradlew"] == [
        "clean",
        "assembleDebug",
        "-PbuildMetricsPerfherderOptions=fenix-debug",
    ]
    assert "track-build-times" not in tracked["run"]
    assert bundle["run"]["gradlew"] == [
        "clean",
        "bundleDebug",
        "-PbuildMetricsPerfherderOptions=fenix-debug-bundle",
    ]
    assert untracked["run"]["gradlew"] == ["clean", "assembleNightly"]


if __name__ == "__main__":
    main()
