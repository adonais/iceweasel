/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.shortcut

import io.mockk.every
import io.mockk.mockk
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
import mozilla.components.feature.pwa.WebAppUseCases
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction

class AddToHomeScreenMenuItemProviderTest {
    @Test
    fun `GIVEN a simple webpage is shown WHEN providing the item THEN offer adding it to the home screen`() = runTest {
        val provider = provider(webAppUseCases = webAppUseCases(isInstallable = false))

        assertEquals(expectedItem(isInstallable = false), provider.itemFlow.value)
    }

    @Test
    fun `GIVEN the page can be added as a PWA WHEN providing the item THEN offer adding it as a PWA`() = runTest {
        val provider = provider(webAppUseCases = webAppUseCases(isInstallable = true))

        assertEquals(expectedItem(isInstallable = true), provider.itemFlow.value)
    }

    @Test
    fun `GIVEN the launcher does not support shortcuts WHEN providing the item THEN don't show it`() = runTest {
        val provider = provider(webAppUseCases = webAppUseCases(isPinningSupported = false))

        assertNull(provider.itemFlow.value)
    }

    // The item is kept up to date on a scope that runTest cancels at the end of each test.
    private fun TestScope.provider(
        browserStore: BrowserStore = browserStoreWithSelectedTab(),
        webAppUseCases: WebAppUseCases,
    ) =
        AddToHomeScreenMenuItemProvider(
            browserStore = browserStore,
            webAppUseCases = webAppUseCases,
            scope = backgroundScope,
        )

    private fun webAppUseCases(
        isPinningSupported: Boolean = true,
        isInstallable: Boolean = false,
    ): WebAppUseCases = mockk {
        every { isPinningSupported() } returns isPinningSupported
        every { isInstallable() } returns isInstallable
    }

    private fun browserStoreWithSelectedTab() =
        BrowserStore(
            BrowserState(
                tabs = listOf(createTab(url = "https://mozilla.org", id = TAB_ID)),
                selectedTabId = TAB_ID,
            )
        )

    private fun expectedItem(isInstallable: Boolean) =
        StandardMenuItem(
            title =
                Text.Resource(
                    when (isInstallable) {
                        true -> R.string.browser_menu_add_app_to_homescreen
                        else -> R.string.browser_menu_add_to_homescreen
                    }
                ),
            icon = MenuItemIconRes(iconsR.drawable.mozac_ic_add_to_homescreen_24),
            onClickEvent = MenuAction.Navigate.AddToHomeScreen,
        )

    private companion object {
        const val TAB_ID = "tab1"
    }
}
