/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.devtools

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest

@RunWith(AndroidJUnit4::class)
class NavigationGraphLoggingTest : BaseTest() {
    @Test
    fun logImportantNavigationPairs() {
        on.navigationGraph.logAllPaths("AppEntry", "BookmarksPage")
        on.navigationGraph.logAllPaths("AppEntry", "HistoryPage")
        on.navigationGraph.logAllPaths("SettingsPage", "ToolbarComponent")
        on.navigationGraph.logAllPaths("SettingsTabsPage", "ShareOverlayPage")
    }

    @Test
    fun logNavigationTestPlanner() {
        ReachabilityPlanLogger.logReachabilityPlan(on)
    }

    @Test
    fun logNavigationPlanSummary() {
        on.navigationGraph.logGraph()
        on.navigationGraph.logPathSummary()
    }

    @Test
    fun exportNavigationGraphDotFile() {
        on

        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val outputDir = context.getExternalFilesDir(null)!!
        val file = File(outputDir, "navigation-graph.dot")

        on.navigationGraph.exportDotToFile(file)

        Log.i("NavigationGraphExportTest", "DOT file written to ${file.absolutePath}")
    }
}
