/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser

import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.ContentState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction

class RefreshMenuItemProviderTest {
    @Test
    fun `GIVEN there is no selected tab WHEN building the refresh menu item THEN return null`() = runTest {
        val provider = provider(BrowserStore())

        assertNull(provider.itemFlow.value)
    }

    @Test
    fun `GIVEN the current page is loading WHEN building the refresh menu item THEN return stop menu item`() = runTest {
        val provider = provider(browserStore(loading = true))

        assertEquals(
            StandardMenuItem(
                title = Text.Resource(R.string.browser_menu_stop),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_cross_24),
                onClickEvent = MenuAction.Navigate.Stop,
            ),
            provider.itemFlow.value,
        )
    }

    @Test
    fun `GIVEN the current page is not loading WHEN building the refresh menu item THEN return refresh menu item`() =
        runTest {
            val provider = provider(browserStore(loading = false))

            assertEquals(
                StandardMenuItem(
                    title = Text.Resource(R.string.browser_menu_refresh),
                    icon = MenuItemIconRes(iconsR.drawable.mozac_ic_arrow_clockwise_24),
                    onClickEvent = MenuAction.Navigate.Reload(bypassCache = false),
                    onLongClickEvent = MenuAction.Navigate.Reload(bypassCache = true),
                ),
                provider.itemFlow.value,
            )
        }

    private fun TestScope.provider(browserStore: BrowserStore) =
        RefreshMenuItemProvider(browserStore = browserStore, scope = backgroundScope)

    private fun browserStore(loading: Boolean) =
        BrowserStore(
            BrowserState(
                tabs =
                    listOf(
                        TabSessionState(
                            id = TAB_ID,
                            content =
                                ContentState(
                                    url = "https://mozilla.org",
                                    loading = loading,
                                ),
                        )
                    ),
                selectedTabId = TAB_ID,
            )
        )

    private companion object {
        const val TAB_ID = "tab1"
    }
}
