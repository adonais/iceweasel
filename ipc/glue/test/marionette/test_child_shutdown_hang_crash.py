# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import glob
import json
import os

from marionette_driver import Wait
from marionette_driver.errors import TimeoutException
from marionette_harness import MarionetteTestCase

# Fixed signature the parent records via the CrashSignatureOverrideForTesting
# annotation when it crashes a child that is hanging at shutdown. Must match
# kShutdownHangCrashSignature in ipc/chromium/src/chrome/common/process_watcher.h.
EXPECTED_SIGNATURE = "child process hang at shutdown"


class TestShutdownHangCrash(MarionetteTestCase):
    """End-to-end test for the deliberate crash of a child hanging at shutdown.

    This test exercises the ~ProcessChild hang path in NS_FREE_PERMANENT_DATA
    builds.

    It verifies that the CrashSignatureOverrideForTesting annotation propagates
    to the crashed child's report (so these crashes group under a single
    signature across platforms).

    The crash reports that are generated for the purpose of this test must be
    flagged intentional so that they don't get auto-reported as test failures.
    Therefore we also check for the presence of IntentionalCrashForTesting."""

    def setUp(self):
        super().setUp()

        self._previous_env = os.environ.get("MOZ_TEST_CHILD_EXIT_HANG")

        # Use a large hang value (in seconds) that exceeds the platform-specific timeout values.
        os.environ["MOZ_TEST_CHILD_EXIT_HANG"] = "40"

        # Relaunch out-of-app to inherit MOZ_TEST_CHILD_EXIT_HANG from the harness environment.
        # An in-app restart would reuse the already-running process environment.
        self.marionette.restart(clean=False, in_app=False)

    def tearDown(self):
        # Restore the environment before the base class starts a fresh session,
        # otherwise the clean-up instance would also hang and crash at shutdown.
        if self._previous_env is None:
            os.environ.pop("MOZ_TEST_CHILD_EXIT_HANG", None)
        else:
            os.environ["MOZ_TEST_CHILD_EXIT_HANG"] = self._previous_env

        super().tearDown()

    def test_child_shutdown_hang_reported_uniformly(self):
        # Make sure at least one content process is around to hang at shutdown.
        self.marionette.navigate("about:blank")

        # Quitting hangs the children at shutdown; the parent crashes them.
        self.marionette.quit()

        try:
            minidump_directory = os.path.join(self.marionette.profile_path, "minidumps")
            extra_files = Wait(None, timeout=30).until(
                lambda _: glob.glob(os.path.join(minidump_directory, "*.extra"))
            )
        except TimeoutException:
            extra_files = []

        # Leave the crash reports in place: that the harness does not report
        # these intentional crashes as failures is part of what we exercise.

        self.assertTrue(
            extra_files,
            "Expected at least one crash report from the deliberately hung child process",
        )

        for path in extra_files:
            with open(path, encoding="utf-8") as f:
                annotations = json.load(f)
            self.assertEqual(
                annotations.get("CrashSignatureOverrideForTesting"),
                EXPECTED_SIGNATURE,
                "The parent's CrashSignatureOverrideForTesting annotation must "
                "propagate to every child crash report",
            )
            self.assertEqual(
                annotations.get("IntentionalCrashForTesting"),
                "1",
                "Every crashed child must carry the IntentionalCrashForTesting "
                "annotation so the deliberate crash is not reported as a test "
                "failure",
            )
