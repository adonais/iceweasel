/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites

import io.mockk.coEvery
import io.mockk.mockk
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.feature.top.sites.PinnedSiteStorage
import mozilla.components.feature.top.sites.TopSite
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction

@OptIn(ExperimentalCoroutinesApi::class)
class ShortcutMenuItemProviderTest {
    @Test
    fun `GIVEN the current page is not a shortcut WHEN providing the item THEN offer adding it to shortcuts`() =
        runTest {
            val provider = provider(pinnedSiteStorage = storageWith(shortcut = null))

            assertEquals(addShortcutItem, provider.itemFlow.value)
        }

    @Test
    fun `GIVEN the current page is a shortcut WHEN providing the item THEN offer removing it from shortcuts`() =
        runTest {
            val provider = provider(pinnedSiteStorage = storageWith(shortcut = shortcut))

            // Adding the page is offered before reading from disk, removing it once it is known to be a shortcut.
            assertEquals(addShortcutItem, provider.itemFlow.value)

            runCurrent()

            assertEquals(removeShortcutItem, provider.itemFlow.value)
        }

    @Test
    fun `GIVEN another page is a shortcut WHEN providing the item THEN keep offering adding the current one`() =
        runTest {
            val otherShortcut = shortcut.copy(url = "https://example.org")
            val provider = provider(pinnedSiteStorage = storageWith(shortcut = otherShortcut))

            runCurrent()

            assertEquals(addShortcutItem, provider.itemFlow.value)
        }

    @Test
    fun `GIVEN shortcuts are disabled WHEN providing the item THEN don't show it`() = runTest {
        val provider = provider(pinnedSiteStorage = storageWith(shortcut = shortcut), areShortcutsEnabled = false)

        runCurrent()

        assertNull(provider.itemFlow.value)
    }

    @Test
    fun `GIVEN there is no page shown WHEN providing the item THEN don't show it`() = runTest {
        val provider = provider(browserStore = BrowserStore(), pinnedSiteStorage = storageWith(shortcut = shortcut))

        runCurrent()

        assertNull(provider.itemFlow.value)
    }

    private fun TestScope.provider(
        browserStore: BrowserStore = browserStoreWithSelectedTab(),
        pinnedSiteStorage: PinnedSiteStorage,
        areShortcutsEnabled: Boolean = true,
    ) =
        ShortcutMenuItemProvider(
            browserStore = browserStore,
            pinnedSiteStorage = pinnedSiteStorage,
            areShortcutsEnabled = areShortcutsEnabled,
            // The shortcuts are read on this scope, which runTest runs and then cancels.
            scope = this,
        )

    private fun storageWith(shortcut: TopSite?): PinnedSiteStorage = mockk {
        coEvery { getPinnedSites() } returns listOfNotNull(shortcut)
    }

    private fun browserStoreWithSelectedTab() =
        BrowserStore(
            BrowserState(
                tabs = listOf(createTab(url = TEST_URL, title = TEST_TITLE, id = TAB_ID)),
                selectedTabId = TAB_ID,
            )
        )

    private companion object {
        const val TEST_URL = "https://mozilla.org"
        const val TEST_TITLE = "Mozilla"
        const val TAB_ID = "tab1"

        val shortcut = TopSite.Pinned(id = 1, title = TEST_TITLE, url = TEST_URL, createdAt = 0)

        val addShortcutItem =
            StandardMenuItem(
                title = Text.Resource(R.string.browser_menu_add_to_shortcuts),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_pin_24),
                onClickEvent = MenuAction.AddShortcut,
            )

        val removeShortcutItem =
            StandardMenuItem(
                title = Text.Resource(R.string.browser_menu_remove_from_shortcuts),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_pin_fill_24),
                onClickEvent = MenuAction.RemoveShortcut,
                state = MenuItemState.ACTIVE,
            )
    }
}
