# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import pytest
from mozunit import main

from gecko_taskgraph.test.conftest import FakeParameters
from gecko_taskgraph.transforms.build import collapse_unified_builds


def unified_build():
    return {
        "name": "macosx64-shippable/opt",
        "attributes": {"shippable": True},
        "index": {"job-name": "macosx64-opt"},
        "worker": {"env": {}, "max-run-time": 1800},
        "run": {"job-script": "taskcluster/scripts/misc/unify.sh"},
        "dependencies": {
            "x64": "build-macosx64-x64-shippable/opt",
            "aarch64": "build-macosx64-aarch64-shippable/opt",
        },
        "fetches": {
            "x64": [{"artifact": "target.dmg", "dest": "x64"}],
            "aarch64": [{"artifact": "target.dmg", "dest": "aarch64"}],
        },
    }


def per_arch_build(arch, package_tests=True):
    env = {"MOZ_AUTOMATION_PACKAGE_TESTS": "1"} if package_tests else {}
    return {
        "name": f"macosx64-{arch}-shippable/opt",
        "attributes": {},
        "index": {"job-name": f"macosx64-{arch}-opt"},
        "worker": {"env": env, "max-run-time": 7200},
        "run": {"config": ["builds/releng_base_mac_64_cross_builds.py"]},
        "fetches": {"toolchain": ["linux64-clang"]},
    }


def run(run_transform, use_artifact, package_tests=True):
    jobs = [
        per_arch_build("x64", package_tests),
        per_arch_build("aarch64", package_tests),
        unified_build(),
    ]
    params = FakeParameters({
        "try_task_config": {"use-artifact-builds": use_artifact},
    })
    return list(
        run_transform(collapse_unified_builds, jobs, kind="build", params=params)
    )[-1]


def test_collapse_unified_build(run_transform):
    job = run(run_transform, use_artifact=True)
    assert "dependencies" not in job
    assert "job-script" not in job["run"]
    assert job["run"]["config"] == ["builds/releng_base_mac_64_cross_builds.py"]
    assert job["fetches"] == {"toolchain": ["linux64-clang"]}
    assert job["worker"]["env"]["MOZ_AUTOMATION_PACKAGE_TESTS"] == "1"
    assert job["worker"]["max-run-time"] == 7200


@pytest.mark.parametrize(
    "use_artifact,package_tests",
    (
        pytest.param(False, True, id="artifact-builds-disabled"),
        pytest.param(True, False, id="tests-not-packaged"),
    ),
)
def test_unified_build_left_alone(run_transform, use_artifact, package_tests):
    job = run(run_transform, use_artifact, package_tests)
    assert job == unified_build()


if __name__ == "__main__":
    main()
