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

class BackMenuItemProviderTest {
    @Test
    fun `GIVEN there is no selected tab WHEN building the back menu item THEN return a disabled menu item`() = runTest {
        val provider = BackMenuItemProvider(BrowserStore(), this.backgroundScope)

        assertEquals(expectedItem(canGoBack = false), provider.itemFlow.value)
    }

    @Test
    fun `GIVEN the current page cannot navigate back WHEN building the back menu item THEN return a disabled menu item`() =
        runTest {
            val provider = BackMenuItemProvider(browserStore(canGoBack = false), this.backgroundScope)

            assertEquals(expectedItem(canGoBack = false), provider.itemFlow.value)
        }

    @Test
    fun `GIVEN the current page can navigate back WHEN building the back menu item THEN return an enabled menu item`() =
        runTest {
            val provider = BackMenuItemProvider(browserStore(canGoBack = true), this.backgroundScope)

            assertEquals(expectedItem(canGoBack = true), provider.itemFlow.value)
        }

    private fun browserStore(canGoBack: Boolean) =
        BrowserStore(
            BrowserState(
                tabs =
                    listOf(
                        TabSessionState(
                            id = TAB_ID,
                            content =
                                ContentState(
                                    url = "https://mozilla.org",
                                    canGoBack = canGoBack,
                                ),
                        )
                    ),
                selectedTabId = TAB_ID,
            )
        )

    private fun expectedItem(canGoBack: Boolean) =
        StandardMenuItem(
            title = Text.Resource(R.string.browser_menu_back),
            icon = MenuItemIconRes(iconsR.drawable.mozac_ic_back_24),
            onClickEvent = MenuAction.Navigate.Back(viewHistory = false),
            onLongClickEvent = MenuAction.Navigate.Back(viewHistory = true),
            state = if (canGoBack) MenuItemState.DEFAULT else MenuItemState.DISABLED,
        )

    private companion object {
        const val TAB_ID = "tab1"
    }
}
