# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


"""Utility functions to handle test chunking."""

import logging
import os
import traceback
from abc import ABCMeta, abstractmethod

from manifestparser import TestManifest
from manifestparser.filters import chunk_by_runtime, tags
from mozbuild.util import memoize
from mozinfo.platforminfo import PlatformInfo
from moztest.resolve import TEST_SUITES, TestManifestLoader, TestResolver
from requests.exceptions import RetryError
from taskgraph.util import json
from taskgraph.util.yaml import load_yaml

from gecko_taskgraph import GECKO, TEST_CONFIGS
from gecko_taskgraph.util.bugbug import CT_LOW, BugbugTimeoutException, push_schedules

logger = logging.getLogger(__name__)
here = os.path.abspath(os.path.dirname(__file__))
resolver = TestResolver.from_environment(cwd=here, loader_cls=TestManifestLoader)

VARIANTS_YML = os.path.join(TEST_CONFIGS, "variants.yml")
TEST_VARIANTS = {}
if os.path.exists(VARIANTS_YML):
    TEST_VARIANTS = load_yaml(VARIANTS_YML)

WPT_SUBSUITES = {
    "canvas": ["html/canvas"],
    "webgpu": ["_mozilla/webgpu"],
    "webcodecs": ["webcodecs"],
    "eme": ["encrypted-media"],
}


def get_test_tags(config, env):
    tags = json.loads(
        config.params["try_task_config"].get("env", {}).get("MOZHARNESS_TEST_TAG", "[]")
    )
    tags.extend(env.get("MOZHARNESS_TEST_TAG", []))
    return list(set(tags))


def guess_mozinfo_from_task(task, repo="", app_version="", test_tags=[]):
    """Attempt to build a mozinfo dict from a task definition.

    This won't be perfect and many values used in the manifests will be missing. But
    it should cover most of the major ones and be "good enough" for chunking in the
    taskgraph.

    Args:
        task (dict): A task definition.

    Returns:
        A dict that can be used as a mozinfo replacement.
    """
    setting = task["test-setting"]
    runtime_keys = setting["runtime"].keys()

    platform_info = PlatformInfo(setting)

    info = {
        "debug": platform_info.debug,
        "bits": platform_info.bits,
        "asan": setting["build"].get("asan", False),
        "tsan": setting["build"].get("tsan", False),
        "ccov": setting["build"].get("ccov", False),
        "mingwclang": setting["build"].get("mingwclang", False),
        "nightly_build": "a1"
        in app_version,  # https://searchfox.org/mozilla-central/source/build/moz.configure/init.configure#1101
        "release_or_beta": "a" not in app_version,
        "repo": repo,
    }
    # the following are used to evaluate reftest skip-if
    info["webrtc"] = not info["mingwclang"]
    info["opt"] = (
        not info["debug"] and not info["asan"] and not info["tsan"] and not info["ccov"]
    )
    info["os"] = platform_info.os

    # crashreporter is disabled for asan / tsan builds
    if info["asan"] or info["tsan"]:
        info["crashreporter"] = False
    else:
        info["crashreporter"] = True

    info["appname"] = "fennec" if info["os"] == "android" else "firefox"
    info["buildapp"] = "browser"

    info["processor"] = platform_info.arch

    # guess toolkit
    if info["os"] == "android":
        info["toolkit"] = "android"
    elif info["os"] == "win":
        info["toolkit"] = "windows"
    elif info["os"] == "mac":
        info["toolkit"] = "cocoa"
    else:
        info["toolkit"] = "gtk"
        info["display"] = platform_info.display or "x11"

    info["os_version"] = platform_info.os_version

    for variant in TEST_VARIANTS:
        tag = TEST_VARIANTS[variant].get("mozinfo", "")
        if tag == "":
            continue

        value = variant in runtime_keys

        if variant == "1proc":
            value = not value
        elif "fission" in variant:
            value = any(
                "1proc" not in key or "no-fission" not in key for key in runtime_keys
            )
            if "no-fission" not in variant:
                value = not value
        elif tag == "xorigin":
            value = any("xorigin" in key for key in runtime_keys)

        info[tag] = value

    # wpt has canvas and webgpu as tags, lets find those
    for tag in WPT_SUBSUITES.keys():
        if tag in task["test-name"]:
            info[tag] = True
        else:
            info[tag] = False

    # NOTE: as we are using an array here, frozenset() cannot work with a 'list'
    # this is cast to a string
    info["tag"] = json.dumps(test_tags)

    info["automation"] = True
    return info


@memoize
def get_runtimes(platform, suite_name):
    if not suite_name or not platform:
        raise TypeError("suite_name and platform cannot be empty.")

    base = os.path.join(GECKO, "testing", "runtimes", "manifest-runtimes-{}.json")
    for key in ("android", "windows"):
        if key in platform:
            path = base.format(key)
            break
    else:
        path = base.format("unix")

    if not os.path.exists(path):
        raise OSError(f"manifest runtime file at {path} not found.")

    with open(path) as fh:
        return json.load(fh).get(suite_name, {})


def chunk_manifests(suite, platform, chunks, manifests):
    """Run the chunking algorithm.

    Args:
        platform (str): Platform used to find runtime info.
        chunks (int): Number of chunks to split manifests into.
        manifests(list): Manifests to chunk.

    Returns:
        A list of length `chunks` where each item contains a list of manifests
        that run in that chunk.
    """
    if "web-platform-tests" not in suite:
        ini_manifests = {x.replace(".toml", ".ini"): x for x in manifests}
        runtimes = {
            k: v for k, v in get_runtimes(platform, suite).items() if k in ini_manifests
        }

        cbr = chunk_by_runtime(None, chunks, runtimes)
        return [
            [ini_manifests.get(m, m) for m in c]
            for _, c in cbr.get_chunked_manifests(manifests)
        ]

    # Keep track of test paths for each chunk, and the runtime information.
    # Spread out the test manifests evenly across all chunks.
    sorted_manifests = sorted(manifests)
    chunked_manifests = [sorted_manifests[c::chunks] for c in range(chunks)]
    return chunked_manifests


class BaseManifestLoader(metaclass=ABCMeta):
    def __init__(self, params):
        self.params = params

    @abstractmethod
    def get_manifests(self, flavor, subsuite, mozinfo):
        """Compute which manifests should run for the given flavor, subsuite and mozinfo.

        This function returns skipped manifests separately so that more balanced
        chunks can be achieved by only considering "active" manifests in the
        chunking algorithm.

        Args:
            flavor (str): The suite to run. Values are defined by the 'build_flavor' key
                in `moztest.resolve.TEST_SUITES`.
            subsuite (str): The subsuite to run or 'undefined' to denote no subsuite.
            mozinfo (frozenset): Set of data in the form of (<key>, <value>) used
                                 for filtering.

        Returns:
            A tuple of two manifest lists. The first is the set of active manifests (will
            run at least one test. The second is a list of skipped manifests (all tests are
            skipped).
        """


class DefaultLoader(BaseManifestLoader):
    """Load manifests using metadata from the TestResolver."""

    @memoize
    def get_tests(self, suite):
        suite_definition = TEST_SUITES[suite]
        return list(
            resolver.resolve_tests(
                flavor=suite_definition["build_flavor"],
                subsuite=suite_definition.get("kwargs", {}).get(
                    "subsuite", "undefined"
                ),
            )
        )

    @memoize
    def get_manifests(self, suite, frozen_mozinfo):
        mozinfo = dict(frozen_mozinfo)

        tests = self.get_tests(suite)

        mozinfo_tags = json.loads(mozinfo.get("tag", "[]"))

        if "web-platform-tests" in suite:
            manifests = set()

            subsuite = next((x for x in WPT_SUBSUITES.keys() if mozinfo.get(x)), None)

            if subsuite:
                subsuite_paths = WPT_SUBSUITES[subsuite]
                for t in tests:
                    if mozinfo_tags and not any(
                        x in t.get("tags", []) for x in mozinfo_tags
                    ):
                        continue

                    manifest = t["manifest"]
                    if any(x in manifest for x in subsuite_paths):
                        manifests.add(manifest)
            else:

                all_subsuite_paths = [
                    path for paths in WPT_SUBSUITES.values() for path in paths
                ]
                for t in tests:
                    if mozinfo_tags and not any(
                        x in t.get("tags", []) for x in mozinfo_tags
                    ):
                        continue

                    manifest = t["manifest"]
                    if not any(path in manifest for path in all_subsuite_paths):
                        manifests.add(manifest)

            return {
                "active": list(manifests),
                "skipped": [],
                "other_dirs": {},
            }

        filters = []
        SUITES_WITHOUT_TAG = {
            "crashtest",
            "crashtest-qr",
            "jsreftest",
            "reftest",
            "reftest-qr",
        }

        # Exclude suites that don't support --tag to prevent manifests from
        # being optimized out, which would result in no jobs being triggered.
        # No need to check suites like gtest, as all suites in compiled.yml
        # have test-manifest-loader set to null, meaning this function is never
        # called.
        # Note there's a similar list in desktop_unittest.py in
        # DesktopUnittest's _query_abs_base_cmd method. The lists should be
        # kept in sync.
        assert suite not in ["gtest", "cppunittest", "jittest"]

        if suite not in SUITES_WITHOUT_TAG and mozinfo_tags:
            filters.extend([tags([x]) for x in mozinfo_tags])

        m = TestManifest()
        m.tests = tests
        active_tests = m.active_tests(
            disabled=False, exists=False, filters=filters, **mozinfo
        )

        all_manifests = {chunk_by_runtime.get_manifest(t) for t in tests}

        active = {}
        for t in active_tests:
            mp = chunk_by_runtime.get_manifest(t)
            dir_relpath = t["dir_relpath"]
            if not mp.startswith(dir_relpath):
                active.setdefault(mp, set()).add(dir_relpath)
            else:
                active.setdefault(mp, set())

        skipped = all_manifests - set(active.keys())

        return {
            "active": list(active.keys()),
            "skipped": list(skipped),
            "other_dirs": {},
        }


class BugbugLoader(DefaultLoader):
    """Load manifests using metadata from the TestResolver, and then
    filter them based on a query to bugbug."""

    CONFIDENCE_THRESHOLD = CT_LOW

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.timedout = False

    @memoize
    def get_manifests(self, suite, mozinfo):
        manifests = super().get_manifests(suite, mozinfo)

        # Don't prune any manifests if we're on a backstop push or there was a timeout.
        if self.params["backstop"] or self.timedout:
            return manifests

        try:
            data = push_schedules(self.params["project"], self.params["head_rev"])
        except (BugbugTimeoutException, RetryError):
            traceback.print_exc()
            logger.warning("Timed out waiting for bugbug, loading all test manifests.")
            self.timedout = True
            return self.get_manifests(suite, mozinfo)

        bugbug_manifests = {
            m
            for m, c in data.get("groups", {}).items()
            if c >= self.CONFIDENCE_THRESHOLD
        }

        manifests["active"] = list(set(manifests["active"]) & bugbug_manifests)
        manifests["skipped"] = list(set(manifests["skipped"]) & bugbug_manifests)
        return manifests


manifest_loaders = {
    "bugbug": BugbugLoader,
    "default": DefaultLoader,
}

_loader_cache = {}


def get_manifest_loader(name, params):
    # Ensure we never create more than one instance of the same loader type for
    # performance reasons.
    if name in _loader_cache:
        return _loader_cache[name]

    loader = manifest_loaders[name](dict(params))
    _loader_cache[name] = loader
    return loader
