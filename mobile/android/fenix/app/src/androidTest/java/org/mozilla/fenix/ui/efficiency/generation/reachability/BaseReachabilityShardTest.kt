/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.generation.reachability

import android.os.SystemClock
import android.util.Log
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.navigation.LaunchConfig

/** Shared logic for all generated/manual navigation shard entrypoint classes. */
abstract class BaseReachabilityShardTest(private val case: ReachabilityCase) : BaseTest() {

    override fun launchConfig(): LaunchConfig = case.launch

    protected fun runNavigationCase() {
        Log.i(
            "NavigationReachabilityTest",
            "TestRail=${case.testRailId} Page=${case.label} State=${case.state}",
        )
        println("TestRail=${case.testRailId} Page=${case.label} State=${case.state}")

        awaitPrecondition()

        val pageObj: BasePage = case.page(on)
        pageObj.navigateToPage()
    }

    /**
     * Blocks until the case's precondition holds, or the timeout elapses. For the default no-op precondition this
     * returns on the first check. We proceed to navigate even on timeout so the existing navigation failure and its
     * screen dump remain the diagnostic, with this log line as the hint that the gate never opened.
     */
    private fun awaitPrecondition() {
        val deadline = SystemClock.elapsedRealtime() + PRECONDITION_TIMEOUT_MS
        while (!case.precondition() && SystemClock.elapsedRealtime() < deadline) {
            SystemClock.sleep(PRECONDITION_POLL_INTERVAL_MS)
        }
        if (!case.precondition()) {
            Log.w(
                "NavigationReachabilityTest",
                "Precondition for ${case.label} did not hold within ${PRECONDITION_TIMEOUT_MS}ms; navigating anyway.",
            )
        }
    }

    private companion object {
        const val PRECONDITION_TIMEOUT_MS = 10_000L
        const val PRECONDITION_POLL_INTERVAL_MS = 100L
    }
}
