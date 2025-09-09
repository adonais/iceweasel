/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.browser.state.state.createTab
import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.text.Text
import mozilla.components.support.test.libstate.ext.waitUntilIdle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.tabstray.ext.generateMenuItems
import org.mozilla.fenix.tabstray.ext.generateMultiSelectBannerMenuItems
import org.mozilla.fenix.tabstray.ext.getMenuItems
import org.mozilla.fenix.tabstray.ext.isSelect

@RunWith(AndroidJUnit4::class)
class TabsTrayStateTest {

    private lateinit var store: TabsTrayStore

    @Before
    fun setup() {
        store = TabsTrayStore()
    }

    @Test
    fun `WHEN entering select mode THEN isSelected extension method returns true`() {
        store.dispatch(TabsTrayAction.EnterSelectMode)
        store.waitUntilIdle()

        assertTrue(store.state.mode.isSelect())
    }

    @Test
    fun `WHEN entering normal mode THEN isSelected extension method returns false`() {
        store.dispatch(TabsTrayAction.ExitSelectMode)
        store.waitUntilIdle()

        assertFalse(store.state.mode.isSelect())
    }

    @Test
    fun `GIVEN select mode is selected and show the inactive button is true WHEN entering any page THEN return 3 items`() {
        val menuItems = initMenuItems(
            mode = TabsTrayState.Mode.Select(emptySet()),
            shouldShowInactiveButton = true,
        )
        assertEquals(menuItems.size, 3)
        assertEquals(
            listOf(
                Text.Resource(R.string.tab_tray_multiselect_menu_item_bookmark),
                Text.Resource(R.string.tab_tray_multiselect_menu_item_close),
                Text.Resource(R.string.inactive_tabs_menu_item),
            ),
            menuItems.map { (it as MenuItem.TextItem).text },
        )
    }

    @Test
    fun `GIVEN select mode is selected and show the inactive button is false WHEN entering any page THEN return 2 menu items`() {
        val menuItems = initMenuItems(
            mode = TabsTrayState.Mode.Select(emptySet()),
        )
        assertEquals(menuItems.size, 2)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_multiselect_menu_item_bookmark),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_multiselect_menu_item_close),
        )
    }

    @Test
    fun `GIVEN normal mode is selected and no normal tabs are opened WHEN entering normal page THEN return 2 menu items`() {
        val menuItems = initMenuItems(
            mode = TabsTrayState.Mode.Normal,
        )
        assertEquals(menuItems.size, 2)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_tab_settings),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_recently_closed),
        )
    }

    @Test
    fun `GIVEN normal mode is selected and multiple normal tabs are opened WHEN entering normal page THEN return 5 menu items`() {
        val menuItems = initMenuItems(
            mode = TabsTrayState.Mode.Normal,
            normalTabCount = 3,
        )
        assertEquals(menuItems.size, 5)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tabs_tray_select_tabs),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_item_share),
        )
        assertEquals(
            (menuItems[2] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_tab_settings),
        )
        assertEquals(
            (menuItems[3] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_recently_closed),
        )
        assertEquals(
            (menuItems[4] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_item_close),
        )
    }

    @Test
    fun `GIVEN normal mode is selected and no private tabs are opened WHEN entering private page THEN return 2 menu items`() {
        val menuItems = initMenuItems(
            mode = TabsTrayState.Mode.Normal,
            selectedPage = Page.PrivateTabs,
        )
        assertEquals(menuItems.size, 2)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_tab_settings),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_recently_closed),
        )
    }

    @Test
    fun `GIVEN normal mode is selected and multiple private tabs are opened WHEN entering private page THEN return 3 menu items`() {
        val menuItems = initMenuItems(
            mode = TabsTrayState.Mode.Normal,
            selectedPage = Page.PrivateTabs,
            privateTabCount = 6,
        )
        assertEquals(menuItems.size, 3)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_tab_settings),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_recently_closed),
        )
        assertEquals(
            (menuItems[2] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_item_close),
        )
    }

    @Test
    fun `GIVEN normal mode is selected WHEN entering synced page THEN return 2 menu items`() {
        val menuItems = initMenuItems(
            mode = TabsTrayState.Mode.Normal,
            selectedPage = Page.SyncedTabs,
        )
        assertEquals(menuItems.size, 2)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_account_settings),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_recently_closed),
        )
    }

    @Test
    fun `GIVEN the Tabs Tray is in multiselection mode AND on the normal tabs page AND the inactive menu item needs to be shown AND on the normal tabs page WHEN the user clicks on the three-dot button THEN the bookmark, close, and make inactive menu items are returned`() {
        val menuItems = generateMultiSelectBannerMenuItems(
            shouldShowInactiveButton = true,
            onBookmarkSelectedTabsClick = {},
            onCloseSelectedTabsClick = {},
            onMakeSelectedTabsInactive = {},
        )
        assertEquals(3, menuItems.size)
        assertEquals(
            listOf(
                Text.Resource(R.string.tab_tray_multiselect_menu_item_bookmark),
                Text.Resource(R.string.tab_tray_multiselect_menu_item_close),
                Text.Resource(R.string.inactive_tabs_menu_item),
            ),
            menuItems.map { (it as MenuItem.TextItem).text },
        )
    }

    @Test
    fun `GIVEN the Tabs Tray is in multiselection mode AND on the normal tabs page AND the inactive menu item should not be shown WHEN the user clicks on the three-dot button THEN the bookmark and close menu items are returned`() {
        val menuItems = generateMultiSelectBannerMenuItems(
            shouldShowInactiveButton = false,
            onBookmarkSelectedTabsClick = {},
            onCloseSelectedTabsClick = {},
            onMakeSelectedTabsInactive = {},
        )
        assertEquals(2, menuItems.size)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_multiselect_menu_item_bookmark),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_multiselect_menu_item_close),
        )
    }

    @Test
    fun `GIVEN the Tabs Tray is not in multiselection mode AND on the normal tabs page AND no normal tabs are open WHEN the user clicks on the three-dot button THEN the tab settings and recently closed tabs menu items are returned`() {
        val menuItems = initMenuItemsFromState()
        assertEquals(menuItems.size, 2)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_tab_settings),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_recently_closed),
        )
    }

    @Test
    fun `GIVEN the Tabs Tray is not in multiselection mode AND on the normal tabs page AND at least 1 normal is open WHEN the user clicks on the three-dot button THEN the select tabs, share all tabs, tab settings, recently closed tabs, and close all tabs menu items are returned`() {
        val menuItems = initMenuItemsFromState(
            state = TabsTrayState(
                normalTabs = List(size = 3) {
                    createTab("")
                },
            ),
        )
        assertEquals(menuItems.size, 5)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tabs_tray_select_tabs),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_item_share),
        )
        assertEquals(
            (menuItems[2] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_tab_settings),
        )
        assertEquals(
            (menuItems[3] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_recently_closed),
        )
        assertEquals(
            (menuItems[4] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_item_close),
        )
    }

    @Test
    fun `GIVEN the Tabs Tray is not in multiselection mode AND on the private tabs page AND no tabs are open WHEN the user clicks on the three-dot button THEN the tab settings and recently closed tabs menu items are returned`() {
        val menuItems = initMenuItemsFromState(
            state = TabsTrayState(
                selectedPage = Page.PrivateTabs,
            ),
        )
        assertEquals(menuItems.size, 2)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_tab_settings),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_recently_closed),
        )
    }

    @Test
    fun `GIVEN the Tabs Tray is not in multiselection mode AND on the private tabs page AND at least 1 private tab is open WHEN the user clicks on the three-dot button THEN the tab settings, recently closed tabs, and close all tabs menu items are returned`() {
        val menuItems = initMenuItemsFromState(
            state = TabsTrayState(
                selectedPage = Page.PrivateTabs,
                privateTabs = List(size = 3) {
                    createTab("")
                },
            ),
        )
        assertEquals(menuItems.size, 3)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_tab_settings),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_recently_closed),
        )
        assertEquals(
            (menuItems[2] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_item_close),
        )
    }

    @Test
    fun `GIVEN the Tabs Tray is not in multiselection mode AND on the synced tabs page WHEN the user clicks on the three-dot button THEN the account settings and recently closed tabs menu items are returned`() {
        val menuItems = initMenuItemsFromState(
            state = TabsTrayState(
                selectedPage = Page.SyncedTabs,
            ),
        )
        assertEquals(menuItems.size, 2)
        assertEquals(
            (menuItems[0] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_account_settings),
        )
        assertEquals(
            (menuItems[1] as MenuItem.TextItem).text,
            Text.Resource(R.string.tab_tray_menu_recently_closed),
        )
    }

    private fun initMenuItems(
        mode: TabsTrayState.Mode,
        shouldShowInactiveButton: Boolean = false,
        selectedPage: Page = Page.NormalTabs,
        normalTabCount: Int = 0,
        privateTabCount: Int = 0,
    ): List<MenuItem> =
        mode.getMenuItems(
            shouldShowInactiveButton = shouldShowInactiveButton,
            selectedPage = selectedPage,
            normalTabCount = normalTabCount,
            privateTabCount = privateTabCount,
            onBookmarkSelectedTabsClick = {},
            onCloseSelectedTabsClick = {},
            onMakeSelectedTabsInactive = {},
            onTabSettingsClick = {},
            onRecentlyClosedClick = {},
            onEnterMultiselectModeClick = {},
            onShareAllTabsClick = {},
            onDeleteAllTabsClick = {},
            onAccountSettingsClick = {},
        )

    private fun initMenuItemsFromState(
        state: TabsTrayState = TabsTrayState(),
    ): List<MenuItem> =
        state.generateMenuItems(
            onTabSettingsClick = {},
            onRecentlyClosedClick = {},
            onEnterMultiselectModeClick = {},
            onShareAllTabsClick = {},
            onDeleteAllTabsClick = {},
            onAccountSettingsClick = {},
        )
}
