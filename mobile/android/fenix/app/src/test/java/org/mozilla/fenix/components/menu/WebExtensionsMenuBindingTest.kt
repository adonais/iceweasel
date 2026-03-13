/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu

import io.mockk.slot
import io.mockk.spyk
import io.mockk.verify
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.WebExtensionState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.webextension.WebExtensionBrowserAction
import mozilla.components.concept.engine.webextension.WebExtensionPageAction
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.components.menu.store.MenuAction
import org.mozilla.fenix.components.menu.store.MenuState
import org.mozilla.fenix.components.menu.store.MenuStore

class WebExtensionsMenuBindingTest {
    private val testDispatcher = StandardTestDispatcher()

    lateinit var browserStore: BrowserStore
    private lateinit var menuStore: MenuStore

    @Test
    fun `WHEN browser web extension state get updated in the browserStore THEN invoke action update browser web extension menu items`() =
        runTest {
            val defaultBrowserAction =
                createWebExtensionBrowserAction("default_browser_action_title")

            val overriddenBrowserAction =
                createWebExtensionBrowserAction("overridden_browser_action_title")

            val extensions: Map<String, WebExtensionState> = mapOf(
                "id" to WebExtensionState(
                    id = "id",
                    url = "url",
                    name = "name",
                    enabled = true,
                    browserAction = defaultBrowserAction,
                ),
            )
            val overriddenExtensions: Map<String, WebExtensionState> = mapOf(
                "id" to WebExtensionState(
                    id = "id",
                    url = "url",
                    name = "name",
                    enabled = true,
                    browserAction = overriddenBrowserAction,
                ),
            )

            menuStore = spyk(MenuStore(MenuState()))
            browserStore = BrowserStore(
                BrowserState(
                    tabs = listOf(
                        createTab(
                            url = "https://www.example.org",
                            id = "tab1",
                            extensions = overriddenExtensions,
                        ),
                    ),
                    selectedTabId = "tab1",
                    extensions = extensions,
                ),
            )

            val binding = WebExtensionsMenuBinding(
                browserStore = browserStore,
                customTabId = null,
                menuStore = menuStore,
                iconSize = 24,
                onDismiss = {},
                mainDispatcher = testDispatcher,
            )
            binding.start()
            testDispatcher.scheduler.advanceUntilIdle()

            val browserItemsUpdateCaptor = slot<MenuAction.UpdateWebExtensionBrowserMenuItems>()

            verify { menuStore.dispatch(capture(browserItemsUpdateCaptor)) }
            assertEquals(
                browserItemsUpdateCaptor.captured.webExtensionBrowserMenuItem[0].label,
                "overridden_browser_action_title",
            )
            assertTrue(browserItemsUpdateCaptor.captured.webExtensionBrowserMenuItem[0].enabled == true)
            assertEquals(browserItemsUpdateCaptor.captured.webExtensionBrowserMenuItem[0].badgeText, "")
            assertEquals(browserItemsUpdateCaptor.captured.webExtensionBrowserMenuItem[0].badgeTextColor, 0)
            assertEquals(browserItemsUpdateCaptor.captured.webExtensionBrowserMenuItem[0].badgeBackgroundColor, 0)
        }

    @Test
    fun `WHEN page web extension state get updated in the browserStore THEN invoke action update page web extension menu items`() =
        runTest {
            val defaultPageAction = createWebExtensionPageAction("default_page_action_title")

            val overriddenPageAction = createWebExtensionPageAction("overridden_page_action_title")

            val extensions: Map<String, WebExtensionState> = mapOf(
                "id" to WebExtensionState(
                    id = "id",
                    url = "url",
                    name = "name",
                    enabled = true,
                    pageAction = defaultPageAction,
                ),
            )
            val overriddenExtensions: Map<String, WebExtensionState> = mapOf(
                "id" to WebExtensionState(
                    id = "id",
                    url = "url",
                    name = "name",
                    enabled = true,
                    pageAction = overriddenPageAction,
                ),
            )

            menuStore = spyk(MenuStore(MenuState()))
            browserStore = BrowserStore(
                BrowserState(
                    tabs = listOf(
                        createTab(
                            url = "https://www.example.org",
                            id = "tab1",
                            extensions = overriddenExtensions,
                        ),
                    ),
                    selectedTabId = "tab1",
                    extensions = extensions,
                ),
            )

            val binding = WebExtensionsMenuBinding(
                browserStore = browserStore,
                customTabId = null,
                menuStore = menuStore,
                iconSize = 24,
                onDismiss = {},
                mainDispatcher = testDispatcher,
            )
            binding.start()
            testDispatcher.scheduler.advanceUntilIdle()

            val pageItemsUpdateCaptor = slot<MenuAction.UpdateWebExtensionBrowserMenuItems>()

            verify { menuStore.dispatch(capture(pageItemsUpdateCaptor)) }
            assertEquals(
                pageItemsUpdateCaptor.captured.webExtensionBrowserMenuItem[0].label,
                "overridden_page_action_title",
            )
            assertTrue(pageItemsUpdateCaptor.captured.webExtensionBrowserMenuItem[0].enabled == true)
            assertEquals(pageItemsUpdateCaptor.captured.webExtensionBrowserMenuItem[0].badgeText, "")
            assertEquals(pageItemsUpdateCaptor.captured.webExtensionBrowserMenuItem[0].badgeTextColor, 0)
            assertEquals(pageItemsUpdateCaptor.captured.webExtensionBrowserMenuItem[0].badgeBackgroundColor, 0)
        }

    @Test
    fun `WHEN page web extension state disabled get updated in the browserStore THEN not invoke action update page web extension menu items`() =
        runTest {
            val defaultPageAction =
                createWebExtensionPageAction("default_page_action_title", enabled = false)

            val extensions: Map<String, WebExtensionState> = mapOf(
                "id" to WebExtensionState(
                    id = "id",
                    url = "url",
                    name = "name",
                    enabled = true,
                    pageAction = defaultPageAction,
                ),
            )

            menuStore = spyk(MenuStore(MenuState()))
            browserStore = BrowserStore(
                BrowserState(
                    tabs = listOf(
                        createTab(
                            url = "https://www.example.org",
                            id = "tab1",
                            extensions = extensions,
                        ),
                    ),
                    selectedTabId = "tab1",
                    extensions = extensions,
                ),
            )

            val binding = WebExtensionsMenuBinding(
                browserStore = browserStore,
                customTabId = null,
                menuStore = menuStore,
                iconSize = 24,
                onDismiss = {},
                mainDispatcher = testDispatcher,
            )
            binding.start()
            testDispatcher.scheduler.advanceUntilIdle()

            val pageItemsUpdateCaptor = slot<MenuAction.UpdateWebExtensionBrowserMenuItems>()

            verify { menuStore.dispatch(capture(pageItemsUpdateCaptor)) }

            assertTrue(
                pageItemsUpdateCaptor.captured.webExtensionBrowserMenuItem.isEmpty(),
            )
        }

    private fun createWebExtensionPageAction(title: String, enabled: Boolean = true) =
        WebExtensionPageAction(
            title = title,
            enabled = enabled,
            loadIcon = { null },
            badgeText = "",
            badgeTextColor = 0,
            badgeBackgroundColor = 0,
            onClick = {},
        )

    private fun createWebExtensionBrowserAction(title: String) = WebExtensionBrowserAction(
        title,
        enabled = true,
        loadIcon = { null },
        badgeText = "",
        badgeTextColor = 0,
        badgeBackgroundColor = 0,
        onClick = {},
    )
}
