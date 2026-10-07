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
import mozilla.components.compose.menu.data.MenuItemBadge
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction

class DesktopSiteMenuItemProviderTest {
    @Test
    fun `GIVEN there is no selected tab WHEN building the desktop site menu item THEN return null`() = runTest {
        val provider = provider(BrowserStore())

        assertNull(provider.itemFlow.value)
    }

    @Test
    fun `GIVEN the mobile version is shown WHEN building the desktop site menu item THEN offer switching to desktop mode`() =
        runTest {
            val provider = provider(browserStore(desktopMode = false))

            assertEquals(expectedItem(isDesktopMode = false), provider.itemFlow.value)
        }

    @Test
    fun `GIVEN the desktop version is shown WHEN building the desktop site menu item THEN offer switching to mobile mode`() =
        runTest {
            val provider = provider(browserStore(desktopMode = true))

            assertEquals(expectedItem(isDesktopMode = true), provider.itemFlow.value)
        }

    @Test
    fun `GIVEN the current page is a PDF WHEN building the desktop site menu item THEN show it as disabled and without a badge`() =
        runTest {
            val provider = provider(browserStore(isPdf = true))

            assertEquals(
                StandardMenuItem(
                    title = Text.Resource(R.string.browser_menu_desktop_site),
                    icon = MenuItemIconRes(iconsR.drawable.mozac_ic_device_desktop_24),
                    onClickEvent = MenuAction.RequestDesktopSite,
                    badge = null,
                    state = MenuItemState.DISABLED,
                ),
                provider.itemFlow.value,
            )
        }

    // The item is kept up to date on a scope that runTest cancels at the end of each test.
    private fun TestScope.provider(browserStore: BrowserStore) =
        DesktopSiteMenuItemProvider(browserStore = browserStore, scope = backgroundScope)

    private fun browserStore(
        desktopMode: Boolean = false,
        isPdf: Boolean = false,
    ) =
        BrowserStore(
            BrowserState(
                tabs =
                    listOf(
                        TabSessionState(
                            id = TAB_ID,
                            content =
                                ContentState(
                                    url = "https://mozilla.org",
                                    desktopMode = desktopMode,
                                    isPdf = isPdf,
                                ),
                        )
                    ),
                selectedTabId = TAB_ID,
            )
        )

    private fun expectedItem(isDesktopMode: Boolean) =
        StandardMenuItem(
            title = Text.Resource(R.string.browser_menu_desktop_site),
            icon = MenuItemIconRes(iconsR.drawable.mozac_ic_device_desktop_24),
            onClickEvent =
                when (isDesktopMode) {
                    true -> MenuAction.RequestMobileSite
                    else -> MenuAction.RequestDesktopSite
                },
            badge =
                MenuItemBadge(
                    text =
                        Text.Resource(
                            when (isDesktopMode) {
                                true -> R.string.browser_feature_desktop_site_on
                                else -> R.string.browser_feature_desktop_site_off
                            }
                        ),
                    state = if (isDesktopMode) MenuItemState.ACTIVE else MenuItemState.DEFAULT,
                ),
            state = if (isDesktopMode) MenuItemState.ACTIVE else MenuItemState.DEFAULT,
        )

    private companion object {
        const val TAB_ID = "tab1"
    }
}
