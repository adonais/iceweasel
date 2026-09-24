/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home

import androidx.navigation.NavController
import androidx.navigation.NavDestination
import androidx.navigation.NavDirections
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.EngineAction
import mozilla.components.browser.state.action.TabListAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.state.content.HistoryState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.history.HistoryItem
import mozilla.components.concept.engine.utils.ABOUT_HOME_URL
import mozilla.components.lib.state.Middleware
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.NavGraphDirections
import org.mozilla.fenix.R

private const val TAB_ID = "tab1"
private const val URL = "https://mozilla.org"

class HomepageNavigationTest {

    private val navController: NavController = mockk(relaxed = true)
    private val captureMiddleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()

    @Test
    fun `WHEN there is no selected tab THEN back is not handled`() {
        val browserStore = createBrowserStore()

        every { navController.currentDestination } returns destination(R.id.homeFragment)

        assertFalse(goBackFromHomepage(browserStore, navController))

        captureMiddleware.assertNotDispatched(EngineAction.GoBackAction::class)
        captureMiddleware.assertNotDispatched(TabListAction.RemoveTabAction::class)
        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `WHEN the selected tab has no back history THEN back is not handled`() {
        val browserStore = createBrowserStore(createTab(canGoBack = false))

        every { navController.currentDestination } returns destination(R.id.homeFragment)

        assertFalse(goBackFromHomepage(browserStore, navController))

        captureMiddleware.assertNotDispatched(EngineAction.GoBackAction::class)
        captureMiddleware.assertNotDispatched(TabListAction.RemoveTabAction::class)
        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `WHEN the previous history entry is a page and the current page is a homepage THEN go back and navigate to the browser`() {
        val browserStore =
            createBrowserStore(
                createTab(
                    canGoBack = true,
                    history =
                        HistoryState(
                            items =
                                listOf(
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                    HistoryItem(title = "Mozilla", uri = URL),
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                ),
                            currentIndex = 2,
                        ),
                )
            )
        every { navController.currentDestination } returns destination(R.id.homeFragment)

        assertTrue(goBackFromHomepage(browserStore, navController))

        captureMiddleware.assertLastAction(EngineAction.GoBackAction::class) { assertEquals(TAB_ID, it.tabId) }
        verify { navController.navigate(NavGraphDirections.actionGlobalBrowser()) }
    }

    @Test
    fun `WHEN the previous history entry is a page and the current page is a page THEN go back without navigating`() {
        val browserStore =
            createBrowserStore(
                createTab(
                    url = URL,
                    canGoBack = true,
                    history =
                        HistoryState(
                            items =
                                listOf(
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                    HistoryItem(title = "Mozilla", uri = URL),
                                    HistoryItem(title = "Mozilla", uri = URL),
                                ),
                            currentIndex = 2,
                        ),
                )
            )
        every { navController.currentDestination } returns destination(R.id.browserFragment)

        assertTrue(goBackFromHomepage(browserStore, navController))

        captureMiddleware.assertLastAction(EngineAction.GoBackAction::class) { assertEquals(TAB_ID, it.tabId) }
        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `WHEN the previous history entry is the homepage and the current page is the homepage THEN go back without leaving the homepage`() {
        val browserStore =
            createBrowserStore(
                createTab(
                    canGoBack = true,
                    history =
                        HistoryState(
                            items =
                                listOf(
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                ),
                            currentIndex = 1,
                        ),
                )
            )
        every { navController.currentDestination } returns destination(R.id.homeFragment)

        assertTrue(goBackFromHomepage(browserStore, navController))

        captureMiddleware.assertLastAction(EngineAction.GoBackAction::class) { assertEquals(TAB_ID, it.tabId) }
        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `WHEN the previous history entry is the homepage and the current page is a page THEN go back without navigating`() {
        val browserStore =
            createBrowserStore(
                createTab(
                    url = URL,
                    canGoBack = true,
                    history =
                        HistoryState(
                            items =
                                listOf(
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                    HistoryItem(title = "Mozilla", uri = URL),
                                ),
                            currentIndex = 1,
                        ),
                )
            )
        every { navController.currentDestination } returns destination(R.id.browserFragment)

        assertTrue(goBackFromHomepage(browserStore, navController))

        captureMiddleware.assertLastAction(EngineAction.GoBackAction::class) { assertEquals(TAB_ID, it.tabId) }
        verify(exactly = 0) { navController.navigate(any<NavGraphDirections>()) }
    }

    @Test
    fun `WHEN the history state is not known THEN go back and navigate to the browser`() {
        val browserStore = createBrowserStore(createTab(canGoBack = true))
        every { navController.currentDestination } returns destination(R.id.homeFragment)

        assertTrue(goBackFromHomepage(browserStore, navController))

        captureMiddleware.assertLastAction(EngineAction.GoBackAction::class) { assertEquals(TAB_ID, it.tabId) }
        verify { navController.navigate(NavGraphDirections.actionGlobalBrowser()) }
    }

    @Test
    fun `GIVEN there is no selected tab WHEN goForwardFromHomepage is called THEN forward is not handled`() {
        val browserStore = createBrowserStore()

        every { navController.currentDestination } returns destination(R.id.homeFragment)

        assertFalse(goForwardFromHomepage(browserStore, navController))

        captureMiddleware.assertNotDispatched(EngineAction.GoForwardAction::class)
        captureMiddleware.assertNotDispatched(TabListAction.RemoveTabAction::class)
        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN the selected tab has no forward history WHEN goForwardFromHomepage is called THEN forward is not handled`() {
        val browserStore = createBrowserStore(createTab(canGoForward = false))

        every { navController.currentDestination } returns destination(R.id.homeFragment)

        assertFalse(goForwardFromHomepage(browserStore, navController))

        captureMiddleware.assertNotDispatched(EngineAction.GoForwardAction::class)
        captureMiddleware.assertNotDispatched(TabListAction.RemoveTabAction::class)
        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN the next history entry is a page and the current page is a homepage WHEN goForwardFromHomepage is called THEN go forward and navigate to the browser`() {
        val browserStore =
            createBrowserStore(
                createTab(
                    canGoForward = true,
                    history =
                        HistoryState(
                            items =
                                listOf(
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                    HistoryItem(title = "Mozilla", uri = URL),
                                ),
                            currentIndex = 1,
                        ),
                )
            )
        every { navController.currentDestination } returns destination(R.id.homeFragment)

        assertTrue(goForwardFromHomepage(browserStore, navController))

        captureMiddleware.assertLastAction(EngineAction.GoForwardAction::class) { assertEquals(TAB_ID, it.tabId) }
        verify { navController.navigate(NavGraphDirections.actionGlobalBrowser()) }
    }

    @Test
    fun `GIVEN the next history entry is a page and the current page is a page WHEN goForwardFromHomepage is called THEN go forward without navigating`() {
        val browserStore =
            createBrowserStore(
                createTab(
                    url = URL,
                    canGoForward = true,
                    history =
                        HistoryState(
                            items =
                                listOf(
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                    HistoryItem(title = "Mozilla", uri = URL),
                                    HistoryItem(title = "Mozilla", uri = URL),
                                ),
                            currentIndex = 1,
                        ),
                )
            )
        every { navController.currentDestination } returns destination(R.id.browserFragment)

        assertTrue(goForwardFromHomepage(browserStore, navController))

        captureMiddleware.assertLastAction(EngineAction.GoForwardAction::class) { assertEquals(TAB_ID, it.tabId) }
        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN the next history entry is the homepage and the current page is the homepage WHEN goForwardFromHomepage is called THEN go forward without leaving the homepage`() {
        val browserStore =
            createBrowserStore(
                createTab(
                    canGoForward = true,
                    history =
                        HistoryState(
                            items =
                                listOf(
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                ),
                            currentIndex = 0,
                        ),
                )
            )
        every { navController.currentDestination } returns destination(R.id.homeFragment)

        assertTrue(goForwardFromHomepage(browserStore, navController))

        captureMiddleware.assertLastAction(EngineAction.GoForwardAction::class) { assertEquals(TAB_ID, it.tabId) }
        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN the next history entry is the homepage and the current page is a page WHEN goForwardFromHomepage is called THEN go forward without navigating`() {
        val browserStore =
            createBrowserStore(
                createTab(
                    url = URL,
                    canGoForward = true,
                    history =
                        HistoryState(
                            items =
                                listOf(
                                    HistoryItem(title = "Mozilla", uri = URL),
                                    HistoryItem(title = "Homepage", uri = ABOUT_HOME_URL),
                                ),
                            currentIndex = 0,
                        ),
                )
            )
        every { navController.currentDestination } returns destination(R.id.browserFragment)

        assertTrue(goForwardFromHomepage(browserStore, navController))

        captureMiddleware.assertLastAction(EngineAction.GoForwardAction::class) { assertEquals(TAB_ID, it.tabId) }
        verify(exactly = 0) { navController.navigate(any<NavGraphDirections>()) }
    }

    @Test
    fun `GIVEN the history state is not known WHEN goForwardFromHomepage is called THEN go forward and navigate to the browser`() {
        val browserStore = createBrowserStore(createTab(canGoForward = true))
        every { navController.currentDestination } returns destination(R.id.homeFragment)

        assertTrue(goForwardFromHomepage(browserStore, navController))

        captureMiddleware.assertLastAction(EngineAction.GoForwardAction::class) { assertEquals(TAB_ID, it.tabId) }
        verify { navController.navigate(NavGraphDirections.actionGlobalBrowser()) }
    }

    private fun destination(destinationId: Int): NavDestination = mockk { every { id } returns destinationId }

    private fun createBrowserStore(selectedTab: TabSessionState? = null) =
        BrowserStore(
            initialState =
                BrowserState(
                    tabs = listOfNotNull(selectedTab),
                    selectedTabId = selectedTab?.id,
                ),
            // Engine actions are only meant to be consumed by an engine middleware, they must not reach the reducer.
            middleware = listOf(captureMiddleware, ignoreEngineActions),
        )

    private fun createTab(
        id: String = TAB_ID,
        url: String = ABOUT_HOME_URL,
        canGoBack: Boolean = false,
        canGoForward: Boolean = false,
        history: HistoryState = HistoryState(),
    ) =
        mozilla.components.browser.state.state.createTab(url = url, id = id).let {
            it.copy(content = it.content.copy(canGoBack = canGoBack, canGoForward = canGoForward, history = history))
        }

    private val ignoreEngineActions: Middleware<BrowserState, BrowserAction> = { _, next, action ->
        if (action !is EngineAction) {
            next(action)
        }
    }
}
