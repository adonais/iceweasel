/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tools

import kotlinx.coroutines.runBlocking
import mozilla.components.browser.state.action.DownloadAction
import mozilla.components.browser.state.state.content.DownloadState
import mozilla.components.browser.storage.sync.PlacesHistoryStorage
import mozilla.components.concept.storage.PageVisit
import mozilla.components.concept.storage.VisitType
import org.junit.Assert.assertTrue
import org.junit.FixMethodOrder
import org.junit.Test
import org.junit.runners.MethodSorters
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest

/**
 * Two tests that deliberately leak state into each other, so the reporting for a dirty start has something real to
 * display.
 *
 * Every genuine leak found so far has been a one-off nobody could reproduce on demand, which makes the reporting for it
 * the only part of the system that is never exercised. This produces one to order.
 *
 * The leak is real rather than simulated. Under `am instrument` --- which is how the fleet dispatches --- there is no
 * AndroidX Test Orchestrator and no `clearPackageData`, so the methods of one class share a process and share the app's
 * data directory. Gradle's `connectedDebugAndroidTest` DOES use the orchestrator, so the same two methods are isolated
 * there and the second one starts clean. That difference is the point: the pair passes either way and only the recorded
 * state differs, which is exactly the discrepancy the state ledger exists to make visible.
 *
 * History is the vehicle because BaseTest's per-test cleanup covers bookmarks, pinned sites, sessions, autofill,
 * logins, tabs and the launcher icon --- and not history.
 *
 * Deliberately in `tools` rather than `tests`: the sweep's suite is `ui.efficiency.tests`, so this stays out of every
 * ordinary run while remaining dispatchable by name.
 *
 * am instrument -w -e class ...tools.StateLeakDemoTest ...
 *
 * Name-ascending order is fixed here because the whole demonstration is that one runs before the other; JUnit's default
 * order is deliberately unspecified.
 */
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class StateLeakDemoTest : BaseTest() {

    private val history
        get() = PlacesHistoryStorage(appContext.applicationContext)

    private val browserStore
        get() = appContext.components.core.store

    @Test
    fun step1LeavesStateBehind() {
        // Two vehicles, on purpose. History is on-disk in the Places database; a download entry is
        // in the BrowserStore, in memory, in the app process. Which of the two survives into the
        // next test says which isolation the runner is actually giving us, and that is worth
        // knowing independently of the reporting this exists to demonstrate.
        runBlocking {
            LEAKED_URLS.forEach { history.recordVisit(it, PageVisit(VisitType.LINK)) }
        }
        LEAKED_URLS.forEachIndexed { i, url ->
            browserStore.dispatch(
                DownloadAction.AddDownloadAction(DownloadState(url = url, fileName = "leaked-$i.txt"))
            )
        }
        // This test CREATES the mess, so its own ledger entry should read: started clean, ended
        // with three history entries and three downloads.
        assertTrue(runBlocking { history.getVisited().size } >= LEAKED_URLS.size)
    }

    @Test
    fun step2StartsWithTheInheritedState() {
        // Nothing is asserted about the inherited state on purpose. A failing test here would say
        // the leak is a bug in this class, and it is not --- it is a property of running without
        // the orchestrator, and the reporting is what is being demonstrated. The interesting
        // output is the START sample, which the harness has already taken by the time this runs.
        //
        // Left clean afterwards so the demo does not become the thing it demonstrates.
        runBlocking { history.deleteEverything() }
        browserStore.state.downloads.keys.toList().forEach {
            browserStore.dispatch(DownloadAction.RemoveDownloadAction(it))
        }
        assertTrue(runBlocking { history.getVisited() }.isEmpty())
    }

    companion object {
        private val LEAKED_URLS =
            listOf(
                "https://leaked-state.example/one",
                "https://leaked-state.example/two",
                "https://leaked-state.example/three",
            )
    }
}
