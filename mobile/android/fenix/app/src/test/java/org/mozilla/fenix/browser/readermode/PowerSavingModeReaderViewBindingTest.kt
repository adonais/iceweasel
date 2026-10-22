/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.readermode

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.action.ReaderAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.ReaderState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.readerview.ReaderViewFeature.ColorScheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.PowerSavingMode
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.PowerSavingModeAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PowerSavingModeReaderViewBindingTest {

    @get:Rule val gleanRule = FenixGleanTestRule(ApplicationProvider.getApplicationContext())

    private val testDispatcher = StandardTestDispatcher()
    private val readerModeController = FakeReaderModeController()

    private class FakeReaderModeController : ReaderModeController {
        var showReaderViewCount = 0
        var hideReaderViewCount = 0
        var lastColorSchemeOverride: ColorScheme? = null

        override fun hideReaderView() {
            hideReaderViewCount++
        }

        override fun showReaderView() {
            showReaderViewCount++
        }

        override fun showControls() = Unit

        override fun setColorSchemeOverride(colorScheme: ColorScheme?) {
            lastColorSchemeOverride = colorScheme
        }
    }

    private fun browserStore(readerable: Boolean = true, active: Boolean = false, url: String = ARTICLE_URL) =
        BrowserStore(
            BrowserState(
                tabs =
                    listOf(
                        createTab(
                            url = url,
                            id = TAB_ID,
                            readerState = ReaderState(readerable = readerable, active = active),
                        )
                    ),
                selectedTabId = TAB_ID,
            )
        )

    private fun binding(browserStore: BrowserStore, appStore: AppStore) =
        PowerSavingModeReaderViewBinding(
            browserStore = browserStore,
            appStore = appStore,
            readerModeController = readerModeController,
            mainDispatcher = testDispatcher,
        )

    private fun activeAppStore() = AppStore(AppState(isPowerSavingModeActive = true))

    @Test
    fun `GIVEN Power Saving Mode is active WHEN a readerable page is selected THEN a dark reader view is forced`() =
        runTest(testDispatcher) {
            binding(browserStore(), activeAppStore()).start()

            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(1, readerModeController.showReaderViewCount)
            assertEquals(ColorScheme.DARK, readerModeController.lastColorSchemeOverride)
        }

    @Test
    fun `GIVEN Power Saving Mode is not active WHEN a readerable page is selected THEN reader view is not forced`() =
        runTest(testDispatcher) {
            binding(browserStore(), AppStore()).start()

            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(0, readerModeController.showReaderViewCount)
            assertNull(readerModeController.lastColorSchemeOverride)
        }

    @Test
    fun `GIVEN Power Saving Mode is active WHEN the page is not readerable THEN reader view is not forced`() =
        runTest(testDispatcher) {
            binding(browserStore(readerable = false), activeAppStore()).start()

            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(0, readerModeController.showReaderViewCount)
        }

    @Test
    fun `GIVEN Power Saving Mode is active WHEN reader view is already active THEN reader view is not forced`() =
        runTest(testDispatcher) {
            binding(browserStore(active = true), activeAppStore()).start()

            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(0, readerModeController.showReaderViewCount)
        }

    @Test
    fun `GIVEN reader view was forced WHEN the user leaves it THEN it is not forced again for the same page`() =
        runTest(testDispatcher) {
            val browserStore = browserStore()
            binding(browserStore, activeAppStore()).start()
            testDispatcher.scheduler.advanceUntilIdle()

            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, true))
            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, false))
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(1, readerModeController.showReaderViewCount)
        }

    @Test
    fun `GIVEN the user left a forced reader view WHEN the tab navigates THEN reader view is forced again`() =
        runTest(testDispatcher) {
            val browserStore = browserStore()
            binding(browserStore, activeAppStore()).start()
            testDispatcher.scheduler.advanceUntilIdle()

            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, true))
            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, false))
            browserStore.dispatch(ContentAction.UpdateUrlAction(TAB_ID, OTHER_ARTICLE_URL))
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(2, readerModeController.showReaderViewCount)
        }

    @Test
    fun `GIVEN the user left a forced reader view WHEN only the fragment changes THEN reader view is not forced again`() =
        runTest(testDispatcher) {
            val browserStore = browserStore()
            binding(browserStore, activeAppStore()).start()
            testDispatcher.scheduler.advanceUntilIdle()

            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, true))
            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, false))
            browserStore.dispatch(ContentAction.UpdateUrlAction(TAB_ID, ARTICLE_URL_WITH_FRAGMENT))
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(1, readerModeController.showReaderViewCount)
        }

    @Test
    fun `GIVEN the user left a forced reader view WHEN the fragment is dropped THEN reader view is not forced again`() =
        runTest(testDispatcher) {
            val browserStore = browserStore(url = ARTICLE_URL_WITH_FRAGMENT)
            binding(browserStore, activeAppStore()).start()
            testDispatcher.scheduler.advanceUntilIdle()

            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, true))
            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, false))
            browserStore.dispatch(ContentAction.UpdateUrlAction(TAB_ID, ARTICLE_URL))
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(1, readerModeController.showReaderViewCount)
        }

    @Test
    fun `GIVEN a readerable page is open WHEN Power Saving Mode turns on THEN a dark reader view is forced`() =
        runTest(testDispatcher) {
            val appStore = AppStore()
            binding(browserStore(), appStore).start()
            testDispatcher.scheduler.advanceUntilIdle()
            assertEquals(0, readerModeController.showReaderViewCount)

            appStore.dispatch(PowerSavingModeAction.Changed(isActive = true))
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(1, readerModeController.showReaderViewCount)
            assertEquals(ColorScheme.DARK, readerModeController.lastColorSchemeOverride)
        }

    @Test
    fun `GIVEN Power Saving Mode is active WHEN it turns off THEN the color scheme override is cleared`() =
        runTest(testDispatcher) {
            val appStore = activeAppStore()
            binding(browserStore(), appStore).start()
            testDispatcher.scheduler.advanceUntilIdle()

            appStore.dispatch(PowerSavingModeAction.Changed(isActive = false))
            testDispatcher.scheduler.advanceUntilIdle()

            assertNull(readerModeController.lastColorSchemeOverride)
            assertEquals(1, readerModeController.showReaderViewCount)
        }

    @Test
    fun `WHEN reader view is forced THEN a reader view forced event is recorded`() =
        runTest(testDispatcher) {
            binding(browserStore(), activeAppStore()).start()

            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(1, PowerSavingMode.readerViewForced.testGetValue()!!.size)
        }

    @Test
    fun `WHEN reader view is forced THEN the tab is tracked as being in a forced reader view`() =
        runTest(testDispatcher) {
            val appStore = activeAppStore()
            binding(browserStore(), appStore).start()

            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(setOf(TAB_ID), appStore.state.powerSavingModeReaderViewTabIds)
        }

    @Test
    fun `GIVEN reader view was forced WHEN the user leaves it THEN the tab is no longer tracked`() =
        runTest(testDispatcher) {
            val browserStore = browserStore()
            val appStore = activeAppStore()
            binding(browserStore, appStore).start()
            testDispatcher.scheduler.advanceUntilIdle()
            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, true))
            testDispatcher.scheduler.advanceUntilIdle()

            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, false))
            testDispatcher.scheduler.advanceUntilIdle()

            assertTrue(appStore.state.powerSavingModeReaderViewTabIds.isEmpty())
        }

    @Test
    fun `GIVEN Power Saving Mode turned off WHEN a forced reader view reloads THEN reader view is left`() =
        runTest(testDispatcher) {
            val browserStore = browserStore()
            val appStore = activeAppStore()
            binding(browserStore, appStore).start()
            testDispatcher.scheduler.advanceUntilIdle()
            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, true))
            appStore.dispatch(PowerSavingModeAction.Changed(isActive = false))
            testDispatcher.scheduler.advanceUntilIdle()

            browserStore.dispatch(ContentAction.UpdateLoadingStateAction(TAB_ID, true))
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(1, readerModeController.hideReaderViewCount)
            assertTrue(appStore.state.powerSavingModeReaderViewTabIds.isEmpty())
        }

    @Test
    fun `GIVEN a new binding with Power Saving Mode off WHEN a forced reader view reloads THEN reader view is left`() =
        runTest(testDispatcher) {
            val browserStore = browserStore(active = true)
            val appStore = AppStore(AppState(powerSavingModeReaderViewTabIds = setOf(TAB_ID)))
            binding(browserStore, appStore).start()
            testDispatcher.scheduler.advanceUntilIdle()

            browserStore.dispatch(ContentAction.UpdateLoadingStateAction(TAB_ID, true))
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(1, readerModeController.hideReaderViewCount)
        }

    @Test
    fun `GIVEN Power Saving Mode is off WHEN a forced reader view has not reloaded THEN reader view is kept`() =
        runTest(testDispatcher) {
            val browserStore = browserStore(active = true)
            val appStore = AppStore(AppState(powerSavingModeReaderViewTabIds = setOf(TAB_ID)))
            binding(browserStore, appStore).start()

            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(0, readerModeController.hideReaderViewCount)
            assertEquals(setOf(TAB_ID), appStore.state.powerSavingModeReaderViewTabIds)
        }

    @Test
    fun `GIVEN Power Saving Mode is active WHEN a forced reader view reloads THEN reader view is kept`() =
        runTest(testDispatcher) {
            val browserStore = browserStore()
            val appStore = activeAppStore()
            binding(browserStore, appStore).start()
            testDispatcher.scheduler.advanceUntilIdle()
            browserStore.dispatch(ReaderAction.UpdateReaderActiveAction(TAB_ID, true))
            testDispatcher.scheduler.advanceUntilIdle()

            browserStore.dispatch(ContentAction.UpdateLoadingStateAction(TAB_ID, true))
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(0, readerModeController.hideReaderViewCount)
            assertFalse(appStore.state.powerSavingModeReaderViewTabIds.isEmpty())
        }

    @Test
    fun `GIVEN Power Saving Mode is off WHEN a reader view the user opened reloads THEN reader view is kept`() =
        runTest(testDispatcher) {
            val browserStore = browserStore(active = true)
            binding(browserStore, AppStore()).start()
            testDispatcher.scheduler.advanceUntilIdle()

            browserStore.dispatch(ContentAction.UpdateLoadingStateAction(TAB_ID, true))
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(0, readerModeController.hideReaderViewCount)
        }

    private companion object {
        const val TAB_ID = "test-tab"
        const val ARTICLE_URL = "https://www.mozilla.org/article"
        const val OTHER_ARTICLE_URL = "https://www.mozilla.org/other-article"
        const val ARTICLE_URL_WITH_FRAGMENT = "https://www.mozilla.org/article#section-2"
    }
}
