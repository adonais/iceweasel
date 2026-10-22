/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.browser.integration

import android.view.View
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.SecurityInfo
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.browser.toolbar.BrowserToolbar
import mozilla.components.browser.toolbar.display.DisplayToolbar.Indicators
import mozilla.components.concept.toolbar.Toolbar
import mozilla.components.feature.tabs.toolbar.TabCounterToolbarButton
import mozilla.components.support.test.argumentCaptor
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.test.whenever
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.Mockito.atLeastOnce
import org.mockito.Mockito.doNothing
import org.mockito.Mockito.spy
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.MockitoAnnotations
import org.mozilla.focus.fragment.BrowserFragment
import org.mozilla.focus.menu.MenuToolbarAction
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BrowserToolbarIntegrationTest {
    private val testDispatcher = StandardTestDispatcher()

    private val selectedTab = createSecureTab()

    private lateinit var toolbar: BrowserToolbar

    @Mock private lateinit var fragment: BrowserFragment

    private lateinit var browserToolbarIntegration: BrowserToolbarIntegration

    @Mock private lateinit var fragmentView: View

    private lateinit var store: BrowserStore

    @Before
    fun setUp() {
        MockitoAnnotations.openMocks(this)
        store =
            BrowserStore(
                initialState =
                    BrowserState(
                        tabs = listOf(selectedTab),
                        selectedTabId = selectedTab.id,
                    )
            )

        toolbar = spy(BrowserToolbar(testContext))

        whenever(fragment.resources).thenReturn(testContext.resources)
        whenever(fragment.context).thenReturn(testContext)
        whenever(fragment.view).thenReturn(fragmentView)
        whenever(fragment.requireContext()).thenReturn(testContext)

        browserToolbarIntegration =
            spy(
                BrowserToolbarIntegration(
                    store = store,
                    toolbar = toolbar,
                    fragment = fragment,
                    currentTabId = selectedTab.id,
                    menuCallbacks = mock(),
                    sessionUseCases = mock(),
                    customTabsUseCases = mock(),
                    onUrlLongClicked = { false },
                    eraseActionListener = {},
                    tabCounterListener = {},
                    coroutineDispatcher = testDispatcher,
                )
            )
    }

    @Test
    fun `WHEN integration starts and stops THEN register and remove the menu after the tab counter`() =
        runTest(testDispatcher) {
            browserToolbarIntegration.start()
            testScheduler.advanceUntilIdle()

            val actions = argumentCaptor<Toolbar.Action>()
            verify(toolbar, atLeastOnce()).addBrowserAction(actions.capture())
            val menu = actions.allValues.filterIsInstance<MenuToolbarAction>().single()
            val tabs = actions.allValues.filterIsInstance<TabCounterToolbarButton>().single()
            assertTrue(tabs.weight() < menu.weight())

            browserToolbarIntegration.stop()

            verify(toolbar).removeBrowserAction(menu)
            verify(toolbar).removeBrowserAction(tabs)
        }

    @Test
    fun `WHEN starting THEN observe security changes`() {
        doNothing().`when`(browserToolbarIntegration).observerSecurityIndicatorChanges()

        browserToolbarIntegration.start()

        verify(browserToolbarIntegration).observerSecurityIndicatorChanges()
    }

    @Test
    fun `WHEN start method is called THEN observe erase tabs CFR changes`() {
        doNothing().`when`(browserToolbarIntegration).observeEraseCfr()

        browserToolbarIntegration.start()

        verify(browserToolbarIntegration).observeEraseCfr()
    }

    @Test
    fun `WHEN start method is called THEN observe tracking protection CFR changes`() {
        doNothing().`when`(browserToolbarIntegration).observeTrackingProtectionCfr()

        browserToolbarIntegration.start()

        verify(browserToolbarIntegration).observeTrackingProtectionCfr()
    }

    @Test
    fun `WHEN stopping THEN stop tracking protection CFR changes`() {
        doNothing().`when`(browserToolbarIntegration).stopObserverTrackingProtectionCfrChanges()

        browserToolbarIntegration.stop()

        verify(browserToolbarIntegration).stopObserverTrackingProtectionCfrChanges()
    }

    @Test
    fun `WHEN stopping THEN stop erase tabs CFR changes`() {
        doNothing().`when`(browserToolbarIntegration).stopObserverEraseTabsCfrChanges()

        browserToolbarIntegration.stop()

        verify(browserToolbarIntegration).stopObserverEraseTabsCfrChanges()
    }

    @Test
    fun `WHEN stopping THEN stop observe security changes`() {
        doNothing().`when`(browserToolbarIntegration).stopObserverSecurityIndicatorChanges()

        browserToolbarIntegration.stop()

        verify(browserToolbarIntegration).stopObserverSecurityIndicatorChanges()
    }

    @Test
    fun `GIVEN an insecure site WHEN observing security changes THEN add the security icon`() =
        runTest(testDispatcher) {
            browserToolbarIntegration.start()
            testScheduler.advanceUntilIdle()

            updateSecurityStatus(secure = false)
            testScheduler.advanceUntilIdle()

            verify(browserToolbarIntegration).addSecurityIndicator()
            assertEquals(listOf(Indicators.SECURITY), toolbar.display.indicators)
        }

    @Test
    fun `GIVEN an about site WHEN observing security changes THEN DO NOT add the security icon`() {
        browserToolbarIntegration.start()

        updateTabUrl("about:")

        verify(browserToolbarIntegration, times(0)).addSecurityIndicator()
        assertEquals(listOf(Indicators.TRACKING_PROTECTION), toolbar.display.indicators)
    }

    @Test
    fun `GIVEN a secure site after a previous insecure site WHEN observing security changes THEN add the tracking protection icon`() =
        runTest(testDispatcher) {
            browserToolbarIntegration.start()
            testScheduler.advanceUntilIdle()

            updateSecurityStatus(secure = false)
            testScheduler.advanceUntilIdle()

            verify(browserToolbarIntegration).addSecurityIndicator()

            updateSecurityStatus(secure = true)
            testScheduler.advanceUntilIdle()

            verify(browserToolbarIntegration).addTrackingProtectionIndicator()
            assertEquals(listOf(Indicators.TRACKING_PROTECTION), toolbar.display.indicators)
        }

    @Test
    fun `WHEN the integration starts THEN start the toolbarController`() {
        browserToolbarIntegration.toolbarController = mock()

        browserToolbarIntegration.start()

        verify(browserToolbarIntegration.toolbarController).start()
    }

    @Test
    fun `WHEN the integration stops THEN stop the toolbarController`() {
        browserToolbarIntegration.toolbarController = mock()

        browserToolbarIntegration.stop()

        verify(browserToolbarIntegration.toolbarController).stop()
    }

    private fun updateSecurityStatus(secure: Boolean) {
        store.dispatch(
            ContentAction.UpdateSecurityInfoAction(
                selectedTab.id,
                SecurityInfo.from(
                    isSecure = secure,
                    host = "mozilla.org",
                    issuer = "Mozilla",
                ),
            )
        )
    }

    private fun updateTabUrl(url: String) {
        store.dispatch(ContentAction.UpdateUrlAction(selectedTab.id, url))
    }

    private fun createSecureTab(): TabSessionState {
        val tab = createTab("https://www.mozilla.org", id = "1")
        return tab.copy(content = tab.content.copy(securityInfo = SecurityInfo.Secure()))
    }
}
