# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import pytest
from mozunit import main
from taskgraph.util.schema import SchemaValidationError

from gecko_taskgraph.test.conftest import FakeParameters
from gecko_taskgraph.transforms.mozconfig import set_mozconfig


def run_mozconfig(run_transform, task, release_type="nightly", product_dir="browser"):
    return list(
        run_transform(
            set_mozconfig,
            [task],
            params=FakeParameters({"release_type": release_type}),
            graph_config={"product-dir": product_dir},
        )
    )[0]


@pytest.mark.parametrize(
    "name,mozconfig,expected",
    (
        pytest.param(
            "linux64-shippable/opt",
            {"variant": "nightly"},
            "browser/config/mozconfigs/linux64/nightly",
            id="default-platform",
        ),
        pytest.param(
            "linux64-aarch64-shippable/opt",
            {"variant": "nightly"},
            "browser/config/mozconfigs/linux64-aarch64/nightly",
            id="longest-prefix",
        ),
        pytest.param(
            "firefox-source/opt",
            {"variant": "source", "platform": "linux64"},
            "browser/config/mozconfigs/linux64/source",
            id="explicit-platform",
        ),
        pytest.param(
            "android-aarch64-shippable-lite/opt",
            {"variant": "nightly", "platform": "android-aarch64-lite"},
            "mobile/android/config/mozconfigs/android-aarch64-lite/nightly",
            id="explicit-platform-overrides-default",
        ),
        pytest.param(
            "android-x86_64-shippable/opt",
            {"variant": "nightly"},
            "mobile/android/config/mozconfigs/android-x86_64/nightly",
            id="android-app",
        ),
        pytest.param(
            "ios-sim/debug",
            {"variant": "debug", "app": "mobile/ios"},
            "mobile/ios/config/mozconfigs/ios-sim/debug",
            id="explicit-app",
        ),
    ),
)
def test_mozconfig(run_transform, name, mozconfig, expected):
    task = run_mozconfig(run_transform, {"name": name, "mozconfig": mozconfig})
    assert task == {"name": name, "worker": {"env": {"MOZCONFIG": expected}}}


def test_mozconfig_keyed_variant(run_transform):
    task = run_mozconfig(
        run_transform,
        {
            "name": "linux64-shippable/opt",
            "mozconfig": {
                "variant": {"by-release-type": {"beta": "beta", "default": "nightly"}}
            },
        },
        release_type="beta",
    )
    assert (
        task["worker"]["env"]["MOZCONFIG"] == "browser/config/mozconfigs/linux64/beta"
    )


def test_mozconfig_product_dir(run_transform):
    task = run_mozconfig(
        run_transform,
        {"name": "linux64/opt", "mozconfig": {"variant": "nightly"}},
        product_dir="comm/mail",
    )
    assert (
        task["worker"]["env"]["MOZCONFIG"]
        == "comm/mail/config/mozconfigs/linux64/nightly"
    )


@pytest.mark.parametrize(
    "task",
    (
        pytest.param({"name": "macosx64-shippable/opt"}, id="absent"),
        pytest.param({"name": "macosx64-shippable/opt", "mozconfig": None}, id="null"),
    ),
)
def test_mozconfig_none(run_transform, task):
    assert run_mozconfig(run_transform, task) == {"name": "macosx64-shippable/opt"}


def test_mozconfig_unknown_platform(run_transform):
    with pytest.raises(Exception, match="needs mozconfig.platform"):
        run_mozconfig(
            run_transform,
            {"name": "android-geckoview-docs/opt", "mozconfig": {"variant": "nightly"}},
        )


def test_mozconfig_missing_variant(run_transform):
    with pytest.raises(SchemaValidationError, match="variant"):
        run_mozconfig(
            run_transform,
            {"name": "linux64/opt", "mozconfig": {"platform": "linux64"}},
        )


if __name__ == "__main__":
    main()
