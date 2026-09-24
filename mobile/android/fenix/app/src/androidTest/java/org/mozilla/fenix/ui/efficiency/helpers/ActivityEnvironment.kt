/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.helpers

import android.app.Activity
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import org.mozilla.fenix.ui.efficiency.logging.TestLogging

object ActivityEnvironment {
    fun applyOrientation(
        phase: String,
        testId: String,
        requirement: RequiredOrientation,
        activity: () -> Activity,
    ) {
        val before = activity().resources.configuration.orientation
        if (requirement != RequiredOrientation.PRESERVE) {
            val requested =
                when (requirement) {
                    RequiredOrientation.PORTRAIT -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                    RequiredOrientation.LANDSCAPE -> ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                    RequiredOrientation.PRESERVE -> error("unreachable")
                }
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                activity().requestedOrientation = requested
            }
            waitForOrientation(testId, requirement, activity)
        }
        TestLogging.installed()
            .record(
                "activityEnvironment",
                mapOf(
                    "phase" to phase,
                    "testId" to testId,
                    "requiredOrientation" to requirement.name,
                    "beforeOrientation" to before,
                    "afterOrientation" to activity().resources.configuration.orientation,
                ),
            )
    }

    private fun waitForOrientation(
        testId: String,
        requirement: RequiredOrientation,
        activity: () -> Activity,
    ) {
        val expected =
            when (requirement) {
                RequiredOrientation.PORTRAIT -> Configuration.ORIENTATION_PORTRAIT
                RequiredOrientation.LANDSCAPE -> Configuration.ORIENTATION_LANDSCAPE
                RequiredOrientation.PRESERVE -> return
            }
        val deadline = SystemClock.elapsedRealtime() + ORIENTATION_TIMEOUT_MS
        while (activity().resources.configuration.orientation != expected && SystemClock.elapsedRealtime() < deadline) {
            SystemClock.sleep(POLL_INTERVAL_MS)
        }
        check(activity().resources.configuration.orientation == expected) {
            "Activity orientation did not reach ${requirement.name} for $testId"
        }
    }

    private const val ORIENTATION_TIMEOUT_MS = 5_000L
    private const val POLL_INTERVAL_MS = 50L
}
