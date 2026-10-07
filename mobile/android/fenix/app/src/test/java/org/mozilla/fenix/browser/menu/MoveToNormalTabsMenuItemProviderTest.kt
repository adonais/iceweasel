/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.menu

import kotlin.test.assertEquals
import kotlin.test.assertNull
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction

class MoveToNormalTabsMenuItemProviderTest {
    @Test
    fun `GIVEN a private tab WHEN building the menu item THEN offer moving it to normal tabs`() {
        val provider = MoveToNormalTabsMenuItemProvider(browserStore(isPrivate = true))

        assertEquals(
            StandardMenuItem(
                title = Text.Resource(R.string.browser_menu_move_to_non_private_tab),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_external_link_24),
                onClickEvent = MenuAction.MoveToNonPrivateTab,
            ),
            provider.itemFlow.value,
        )
    }

    @Test
    fun `GIVEN a normal tab WHEN building the menu item THEN don't show it`() {
        val provider = MoveToNormalTabsMenuItemProvider(browserStore(isPrivate = false))

        assertNull(provider.itemFlow.value)
    }

    @Test
    fun `GIVEN there is no selected tab WHEN building the menu item THEN don't show it`() {
        val provider = MoveToNormalTabsMenuItemProvider(BrowserStore())

        assertNull(provider.itemFlow.value)
    }

    private fun browserStore(isPrivate: Boolean) =
        BrowserStore(
            BrowserState(
                tabs = listOf(createTab(url = "https://mozilla.org", id = TAB_ID, private = isPrivate)),
                selectedTabId = TAB_ID,
            )
        )

    private companion object {
        const val TAB_ID = "tab1"
    }
}
