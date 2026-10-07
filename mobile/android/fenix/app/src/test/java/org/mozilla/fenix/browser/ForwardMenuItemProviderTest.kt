/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser

import kotlin.test.assertEquals
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.ContentState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction

class ForwardMenuItemProviderTest {
    @Test
    fun `GIVEN there is no selected tab WHEN building the forward menu item THEN return a disabled menu item`() =
        runTest {
            val provider = ForwardMenuItemProvider(BrowserStore(), backgroundScope)

            assertEquals(expectedItem(canGoForward = false), provider.itemFlow.value)
        }

    @Test
    fun `GIVEN the current page cannot navigate forward WHEN building the forward menu item THEN return a disabled menu item`() =
        runTest {
            val provider = ForwardMenuItemProvider(browserStore(canGoForward = false), backgroundScope)

            assertEquals(expectedItem(canGoForward = false), provider.itemFlow.value)
        }

    @Test
    fun `GIVEN the current page can navigate forward WHEN building the forward menu item THEN return an enabled menu item`() =
        runTest {
            val provider = ForwardMenuItemProvider(browserStore(canGoForward = true), backgroundScope)

            assertEquals(expectedItem(canGoForward = true), provider.itemFlow.value)
        }

    private fun browserStore(canGoForward: Boolean) =
        BrowserStore(
            BrowserState(
                tabs =
                    listOf(
                        TabSessionState(
                            id = TAB_ID,
                            content =
                                ContentState(
                                    url = "https://mozilla.org",
                                    canGoForward = canGoForward,
                                ),
                        )
                    ),
                selectedTabId = TAB_ID,
            )
        )

    private fun expectedItem(canGoForward: Boolean) =
        StandardMenuItem(
            title = Text.Resource(R.string.browser_menu_forward),
            icon = MenuItemIconRes(iconsR.drawable.mozac_ic_forward_24),
            onClickEvent = MenuAction.Navigate.Forward(viewHistory = false),
            onLongClickEvent = MenuAction.Navigate.Forward(viewHistory = true),
            state = if (canGoForward) MenuItemState.DEFAULT else MenuItemState.DISABLED,
        )

    private companion object {
        const val TAB_ID = "tab1"
    }
}
