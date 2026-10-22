# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from typing import Optional

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import (
    Schema,
    optionally_keyed_by,
    resolve_keyed_by,
    validate_schema,
)

MOZCONFIG_PLATFORMS = (
    "android-aarch64",
    "android-arm",
    "android-x86_64",
    "ios",
    "ios-sim",
    "linux64",
    "linux64-aarch64",
    "macosx64",
    "macosx64-aarch64",
    "win32",
    "win64",
    "win64-aarch64",
)


class MozconfigSchema(Schema, kw_only=True):
    variant: optionally_keyed_by("release-type", str, use_msgspec=True)
    platform: Optional[str] = None
    app: Optional[str] = None


transforms = TransformSequence()


def default_platform(name):
    build_platform = name.split("/")[0]
    matches = [
        platform
        for platform in MOZCONFIG_PLATFORMS
        if build_platform == platform or build_platform.startswith(platform + "-")
    ]
    return max(matches, key=len, default=None)


@transforms.add
def set_mozconfig(config, tasks):
    for task in tasks:
        mozconfig = task.pop("mozconfig", None)
        if mozconfig is None:
            yield task
            continue

        name = task["name"]
        validate_schema(MozconfigSchema, mozconfig, f"In mozconfig of {name!r}:")
        resolve_keyed_by(
            mozconfig,
            "variant",
            item_name=name,
            **{"release-type": config.params["release_type"]},
        )
        platform = mozconfig.get("platform") or default_platform(name)
        if platform is None:
            raise Exception(
                f"{name} needs mozconfig.platform, its name does not start with "
                f"one of {MOZCONFIG_PLATFORMS}"
            )
        app = mozconfig.get("app")
        if app is None:
            if platform.startswith("android-"):
                app = "mobile/android"
            else:
                app = config.graph_config["product-dir"]
        task.setdefault("worker", {}).setdefault("env", {})["MOZCONFIG"] = (
            f"{app}/config/mozconfigs/{platform}/{mozconfig['variant']}"
        )
        yield task
