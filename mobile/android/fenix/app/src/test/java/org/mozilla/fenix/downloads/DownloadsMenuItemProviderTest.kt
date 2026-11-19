/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.downloads

import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItemTitle
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.NavGraphDirections
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.components.appstate.SupportedMenuNotifications
import org.mozilla.fenix.components.menu.MenuTarget
import org.mozilla.fenix.components.menu.fake.FakeMenuHost
import org.mozilla.fenix.components.menu.fake.reachableEvents
import org.mozilla.fenix.components.menu.store.MenuAction

@OptIn(ExperimentalCoroutinesApi::class)
class DownloadsMenuItemProviderTest {
    @Test
    fun `GIVEN there are no downloads notifications WHEN building the downloads menu item THEN return a non-highlighted item`() =
        runTest {
            val appStore = AppStore(AppState(supportedMenuNotifications = emptySet()))
            val provider =
                DownloadsMenuItemProvider(appStore, target = MenuTarget.BrowserTab, scope = this.backgroundScope)

            assertEquals(expectedItem(isHighlighted = false), provider.itemsFlow.value.single())
        }

    @Test
    fun `GIVEN target is CustomizeMenu WHEN building the downloads menu item THEN return item without click event`() =
        runTest {
            val appStore = AppStore(AppState(supportedMenuNotifications = emptySet()))
            val provider =
                DownloadsMenuItemProvider(appStore, target = MenuTarget.CustomizeMenu, scope = this.backgroundScope)

            assertEquals(
                StandardMenuItem(
                    title = MenuItemTitle(Text.Resource(R.string.library_downloads)),
                    icon = MenuItemIconRes(iconsR.drawable.mozac_ic_download_24, isHighlighted = false),
                    onClickEvent = null,
                ),
                provider.itemsFlow.value.single(),
            )
        }

    @Test
    fun `GIVEN there are downloads notifications WHEN building the downloads menu item THEN return a highlighted item`() =
        runTest {
            val appStore = AppStore(AppState(supportedMenuNotifications = setOf(SupportedMenuNotifications.Downloads)))
            val provider =
                DownloadsMenuItemProvider(appStore, target = MenuTarget.BrowserTab, scope = this.backgroundScope)

            assertEquals(expectedItem(isHighlighted = true), provider.itemsFlow.value.single())
        }

    @Test
    fun `WHEN the downloads notifications status changes THEN update the downloads menu item`() = runTest {
        val appStore = AppStore(AppState(supportedMenuNotifications = emptySet()))
        val provider = DownloadsMenuItemProvider(appStore, target = MenuTarget.BrowserTab, scope = this.backgroundScope)

        val collectJob = launch { provider.itemsFlow.collect {} }

        assertEquals(expectedItem(isHighlighted = false), provider.itemsFlow.value.single())

        appStore.dispatch(AppAction.MenuNotification.AddMenuNotification(SupportedMenuNotifications.Downloads))
        advanceUntilIdle()

        assertEquals(expectedItem(isHighlighted = true), provider.itemsFlow.value.single())

        collectJob.cancel()
    }

    private fun expectedItem(isHighlighted: Boolean) =
        StandardMenuItem(
            title = MenuItemTitle(Text.Resource(R.string.library_downloads)),
            icon =
                MenuItemIconRes(
                    iconsR.drawable.mozac_ic_download_24,
                    isHighlighted = isHighlighted,
                ),
            onClickEvent = MenuAction.Navigate.Downloads,
        )

    @Test
    fun `WHEN clicking the item THEN show the downloads in place of the menu`() = runTest {
        val menu = FakeMenuHost()

        DownloadsMenuItemProvider(AppStore(AppState()), target = MenuTarget.BrowserTab, scope = backgroundScope)
            .onEvent(MenuAction.Navigate.Downloads, menu)

        assertEquals(NavGraphDirections.actionGlobalDownloadsFragment(), menu.directions)
    }

    @Test
    fun `WHEN building the item THEN handle all events it can dispatch and no others`() = runTest {
        val provider =
            DownloadsMenuItemProvider(AppStore(AppState()), target = MenuTarget.BrowserTab, scope = backgroundScope)

        val events = provider.itemsFlow.value.single().reachableEvents()

        assertTrue(events.all { provider.handles(it) }, "Not all of $events are handled")
        assertFalse(provider.handles(MenuAction.Navigate.History))
    }
}
