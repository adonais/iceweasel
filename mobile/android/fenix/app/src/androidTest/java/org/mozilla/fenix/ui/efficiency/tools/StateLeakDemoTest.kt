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
 * Two tests that deliberately try to leak state into each other, proving the harness removes it at the boundary.
 *
 * Every genuine leak found so far has been a one-off nobody could reproduce on demand, which makes the reporting for it
 * the only part of the system that is never exercised. This produces one to order.
 *
 * The attempted leak is real rather than simulated. Under `am instrument` --- which is how the fleet dispatches ---
 * there is no AndroidX Test Orchestrator and no `clearPackageData`, so the methods share a process and app data. The
 * first method creates both persisted and process-memory state; the second fails if the harness does not remove both.
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
        // Its ledger should read: start clean, end dirty, afterCleanup clean.
        assertTrue(runBlocking { history.getVisited().size } >= LEAKED_URLS.size)
    }

    @Test
    fun step2StartsIsolated() {
        assertTrue(runBlocking { history.getVisited() }.isEmpty())
        assertTrue(browserStore.state.downloads.isEmpty())
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
