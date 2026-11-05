# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import sys
from types import SimpleNamespace

import mozunit
from mozlog.structuredlog import StructuredLogger

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import runreftest  # noqa: E402

MANIFEST_A = "file:///tests/a/reftest.list"
MANIFEST_B = "file:///tests/b/reftest.list"


def test_browser_launch_is_attributed_to_its_manifest():
    """Crashes before a manifest's first test are logged with that manifest's
    group and name, not with what the previous manifest left behind."""
    # That case is hard to trigger with a real browser, so only runSerialTests
    # runs for real: no Firefox is started, the test list and the browser run
    # of each manifest are mocked, and the state the harness would otherwise
    # set up from the command line is set by hand.
    reftest = runreftest.RefTest("reftest")
    reftest.log = StructuredLogger("test_run_by_manifest")
    reftest.outputHandler = SimpleNamespace(results={})
    reftest.getGtkTheme = lambda: ""
    reftest.gtkTheme = ""
    reftest.getActiveTests = lambda manifests, options: [
        {
            "manifest": MANIFEST_A,
            "manifestID": "a/reftest.list",
            "identifier": "a.html",
        },
        {
            "manifest": MANIFEST_B,
            "manifestID": "b/reftest.list",
            "identifier": "b.html",
        },
    ]

    launches = []

    def run_app(options, tests, **kwargs):
        launches.append((reftest.lastTestSeen, reftest.currentManifestID))
        # Leave behind what a test of this manifest would, like a test that
        # was running when the browser crashed.
        reftest.lastTestSeen = tests[-1]["identifier"]
        return 1

    reftest.runApp = run_app
    options = SimpleNamespace(
        debugger=None,
        timeout=300,
        symbolsPath=None,
        suite="reftest",
    )

    reftest.runSerialTests([], options)

    assert launches == [
        (MANIFEST_A, "a/reftest.list"),
        (MANIFEST_B, "b/reftest.list"),
    ]


if __name__ == "__main__":
    mozunit.main()
