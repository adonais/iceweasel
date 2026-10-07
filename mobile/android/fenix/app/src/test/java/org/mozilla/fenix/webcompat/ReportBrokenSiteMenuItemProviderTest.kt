/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.webcompat

import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction

class ReportBrokenSiteMenuItemProviderTest {
    @Test
    fun `GIVEN a webpage is shown WHEN building the menu item THEN allow reporting it as broken`() = runTest {
        val provider = provider(browserStore(url = "https://mozilla.org"))

        assertEquals(expectedItem(isEnabled = true), provider.itemFlow.value)
    }

    @Test
    fun `GIVEN an about page is shown WHEN building the menu item THEN don't allow reporting it as broken`() = runTest {
        val provider = provider(browserStore(url = "about:config"))

        assertEquals(expectedItem(isEnabled = false), provider.itemFlow.value)
    }

    @Test
    fun `GIVEN a content page is shown WHEN building the menu item THEN don't allow reporting it as broken`() =
        runTest {
            val provider = provider(browserStore(url = "content://media/external/file/1"))

            assertEquals(expectedItem(isEnabled = false), provider.itemFlow.value)
        }

    @Test
    fun `GIVEN there is no selected tab WHEN building the menu item THEN don't show it`() = runTest {
        val provider = provider(BrowserStore())

        assertNull(provider.itemFlow.value)
    }

    // The item is kept up to date on a scope that runTest cancels at the end of each test.
    private fun TestScope.provider(browserStore: BrowserStore) =
        ReportBrokenSiteMenuItemProvider(browserStore = browserStore, scope = backgroundScope)

    private fun browserStore(url: String) =
        BrowserStore(
            BrowserState(
                tabs = listOf(createTab(url = url, id = TAB_ID)),
                selectedTabId = TAB_ID,
            )
        )

    private fun expectedItem(isEnabled: Boolean) =
        StandardMenuItem(
            title = Text.Resource(R.string.browser_menu_webcompat_reporter_2),
            icon = MenuItemIconRes(iconsR.drawable.mozac_ic_lightbulb_24),
            onClickEvent = MenuAction.Navigate.WebCompatReporter,
            state =
                when (isEnabled) {
                    true -> MenuItemState.DEFAULT
                    else -> MenuItemState.DISABLED
                },
        )

    private companion object {
        const val TAB_ID = "tab1"
    }
}
