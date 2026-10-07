/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.applinks

import android.content.Intent
import io.mockk.every
import io.mockk.mockk
import kotlin.test.assertEquals
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.feature.app.links.AppLinkRedirect
import mozilla.components.feature.app.links.AppLinksUseCases
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.components.appstate.SupportedMenuNotifications
import org.mozilla.fenix.components.menu.store.MenuAction

class OpenInAppMenuItemProviderTest {
    @Test
    fun `GIVEN an app can open the current page WHEN building the menu item THEN offer opening it in that app`() =
        runTest {
            val provider = provider(appLinksUseCases = appLinksUseCases(appName = APP_NAME))

            assertEquals(
                expectedItem(title = Text.Resource(R.string.browser_menu_open_in_fenix, listOf(APP_NAME))),
                provider.itemFlow.value,
            )
        }

    @Test
    fun `GIVEN the app that can open the current page has no name WHEN building the menu item THEN say just that`() =
        runTest {
            val provider = provider(appLinksUseCases = appLinksUseCases(appName = ""))

            assertEquals(
                expectedItem(title = Text.Resource(R.string.browser_menu_open_app_link)),
                provider.itemFlow.value,
            )
        }

    @Test
    fun `GIVEN no app can open the current page WHEN building the menu item THEN show it as not usable`() = runTest {
        val provider = provider(appLinksUseCases = appLinksUseCases(hasExternalApp = false))

        assertEquals(
            expectedItem(
                title = Text.Resource(R.string.browser_menu_open_app_link),
                state = MenuItemState.DISABLED,
            ),
            provider.itemFlow.value,
        )
    }

    @Test
    fun `GIVEN there is no page shown WHEN building the menu item THEN show it as not usable`() = runTest {
        val provider = provider(browserStore = BrowserStore(), appLinksUseCases = appLinksUseCases())

        assertEquals(
            expectedItem(
                title = Text.Resource(R.string.browser_menu_open_app_link),
                state = MenuItemState.DISABLED,
            ),
            provider.itemFlow.value,
        )
    }

    @Test
    fun `GIVEN attention is to be drawn to opening pages in apps WHEN building the menu item THEN highlight it`() =
        runTest {
            val provider = provider(appStore = appStore(isHighlighted = true), appLinksUseCases = appLinksUseCases())

            assertEquals(
                expectedItem(
                    title = Text.Resource(R.string.browser_menu_open_in_fenix, listOf(APP_NAME)),
                    isHighlighted = true,
                ),
                provider.itemFlow.value,
            )
        }

    @Test
    fun `GIVEN no app can open the current page WHEN it is to be highlighted THEN don't highlight it`() = runTest {
        val provider =
            provider(
                appStore = appStore(isHighlighted = true),
                appLinksUseCases = appLinksUseCases(hasExternalApp = false),
            )

        assertEquals(
            expectedItem(
                title = Text.Resource(R.string.browser_menu_open_app_link),
                state = MenuItemState.DISABLED,
            ),
            provider.itemFlow.value,
        )
    }

    // The item is kept up to date on a scope that runTest cancels at the end of each test.
    private fun TestScope.provider(
        browserStore: BrowserStore = browserStoreWithSelectedTab(),
        appStore: AppStore = appStore(isHighlighted = false),
        appLinksUseCases: AppLinksUseCases,
    ) =
        OpenInAppMenuItemProvider(
            browserStore = browserStore,
            appStore = appStore,
            appLinksUseCases = appLinksUseCases,
            scope = backgroundScope,
        )

    private fun browserStoreWithSelectedTab() =
        BrowserStore(
            BrowserState(
                tabs = listOf(createTab(url = TEST_URL, id = TAB_ID)),
                selectedTabId = TAB_ID,
            )
        )

    private fun appStore(isHighlighted: Boolean) =
        AppStore(
            AppState(
                supportedMenuNotifications =
                    when (isHighlighted) {
                        true -> setOf(SupportedMenuNotifications.OpenInApp)
                        else -> emptySet()
                    }
            )
        )

    private fun appLinksUseCases(
        hasExternalApp: Boolean = true,
        appName: String = APP_NAME,
    ): AppLinksUseCases = mockk {
        every { appLinkRedirect } returns
            mockk redirect@{
                every { this@redirect.invoke(any()) } returns
                    AppLinkRedirect(
                        appIntent = mockk<Intent>().takeIf { hasExternalApp },
                        appName = appName,
                        fallbackUrl = null,
                        marketplaceIntent = null,
                    )
            }
    }

    private fun expectedItem(
        title: Text,
        state: MenuItemState = MenuItemState.DEFAULT,
        isHighlighted: Boolean = false,
    ) =
        StandardMenuItem(
            title = title,
            icon = MenuItemIconRes(iconsR.drawable.mozac_ic_more_grid_24, isHighlighted = isHighlighted),
            onClickEvent = MenuAction.OpenInApp,
            state = state,
        )

    private companion object {
        const val TEST_URL = "https://mozilla.org"
        const val TAB_ID = "tab1"
        const val APP_NAME = "Mozilla app"
    }
}
