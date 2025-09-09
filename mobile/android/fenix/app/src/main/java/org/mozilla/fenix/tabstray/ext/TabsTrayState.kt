/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ext

import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.text.Text
import org.mozilla.fenix.R
import org.mozilla.fenix.tabstray.Page
import org.mozilla.fenix.tabstray.TabsTrayState
import org.mozilla.fenix.tabstray.TabsTrayState.Mode
import org.mozilla.fenix.tabstray.TabsTrayTestTag

/**
 * A helper to check if we're in [Mode.Select] mode.
 */
fun Mode.isSelect() = this is Mode.Select

/**
 * Returns the list of menu items corresponding to the selected mode
 *
 * @param shouldShowInactiveButton Whether or not to show the inactive tabs menu item.
 * @param selectedPage The currently selected page.
 * @param normalTabCount The number of normal tabs.
 * @param privateTabCount The number of private tabs.
 * @param onBookmarkSelectedTabsClick Invoked when the user clicks the menu item to bookmark the selected tabs.
 * @param onCloseSelectedTabsClick Invoked when the user clicks the menu item to close the selected tabs.
 * @param onMakeSelectedTabsInactive Invoked when the user clicks the menu item to force the selected
 * tabs as inactive.
 * @param onTabSettingsClick Invoked when the user clicks the menu item to navigate to tab settings.
 * @param onRecentlyClosedClick Invoked when the user clicks the menu item to navigate to their recently closed tabs.
 * @param onEnterMultiselectModeClick Invoked when the user the menu item to enter multiselect mode.
 * @param onShareAllTabsClick Invoked when the user clicks the menu item to share all of their tabs.
 * @param onDeleteAllTabsClick Invoked when user clicks the menu item to delete all of their tabs.
 * @param onAccountSettingsClick Invoked when user clicks the menu item to navigate to account settings.
 */
@Suppress("LongParameterList")
fun Mode.getMenuItems(
    shouldShowInactiveButton: Boolean,
    selectedPage: Page,
    normalTabCount: Int,
    privateTabCount: Int,
    onBookmarkSelectedTabsClick: () -> Unit,
    onCloseSelectedTabsClick: () -> Unit,
    onMakeSelectedTabsInactive: () -> Unit,
    onTabSettingsClick: () -> Unit,
    onRecentlyClosedClick: () -> Unit,
    onEnterMultiselectModeClick: () -> Unit,
    onShareAllTabsClick: () -> Unit,
    onDeleteAllTabsClick: () -> Unit,
    onAccountSettingsClick: () -> Unit,
): List<MenuItem> {
    return if (this.isSelect()) {
        generateMultiSelectBannerMenuItems(
            shouldShowInactiveButton = shouldShowInactiveButton,
            onBookmarkSelectedTabsClick = onBookmarkSelectedTabsClick,
            onCloseSelectedTabsClick = onCloseSelectedTabsClick,
            onMakeSelectedTabsInactive = onMakeSelectedTabsInactive,
        )
    } else {
        generateTabPageBannerMenuItems(
            selectedPage = selectedPage,
            normalTabCount = normalTabCount,
            privateTabCount = privateTabCount,
            onTabSettingsClick = onTabSettingsClick,
            onRecentlyClosedClick = onRecentlyClosedClick,
            onEnterMultiselectModeClick = onEnterMultiselectModeClick,
            onShareAllTabsClick = onShareAllTabsClick,
            onDeleteAllTabsClick = onDeleteAllTabsClick,
            onAccountSettingsClick = onAccountSettingsClick,
        )
    }
}

/**
 *  Builds the menu items list when in [Mode.Select].
 *
 * @param shouldShowInactiveButton Whether or not to show the inactive tabs menu item.
 * @param onBookmarkSelectedTabsClick Invoked when the user clicks the menu item to bookmark the selected tabs.
 * @param onCloseSelectedTabsClick Invoked when the user clicks the menu item to close the selected tabs.
 * @param onMakeSelectedTabsInactive Invoked when the user clicks the menu item to force the selected
 * tabs as inactive.
 */
internal fun generateMultiSelectBannerMenuItems(
    shouldShowInactiveButton: Boolean,
    onBookmarkSelectedTabsClick: () -> Unit,
    onCloseSelectedTabsClick: () -> Unit,
    onMakeSelectedTabsInactive: () -> Unit,
): List<MenuItem> {
    val menuItems = mutableListOf(
        MenuItem.TextItem(
            text = Text.Resource(R.string.tab_tray_multiselect_menu_item_bookmark),
            onClick = onBookmarkSelectedTabsClick,
        ),
        MenuItem.TextItem(
            text = Text.Resource(R.string.tab_tray_multiselect_menu_item_close),
            onClick = onCloseSelectedTabsClick,
        ),
    )
    if (shouldShowInactiveButton) {
        menuItems.add(
            MenuItem.TextItem(
                text = Text.Resource(R.string.inactive_tabs_menu_item),
                onClick = onMakeSelectedTabsInactive,
            ),
        )
    }
    return menuItems
}

/**
 *  Builds the menu items list when in [Mode.Normal].
 *
 * @param selectedPage The currently selected page.
 * @param normalTabCount The number of normal tabs.
 * @param privateTabCount The number of private tabs.
 * @param onTabSettingsClick Invoked when the user clicks the menu item to navigate to tab settings.
 * @param onRecentlyClosedClick Invoked when the user clicks the menu item to navigate to their recently closed tabs.
 * @param onEnterMultiselectModeClick Invoked when the user the menu item to enter multiselect mode.
 * @param onShareAllTabsClick Invoked when the user clicks the menu item to share all of their tabs.
 * @param onDeleteAllTabsClick Invoked when user clicks the menu item to delete all of their tabs.
 * @param onAccountSettingsClick Invoked when user clicks the menu item to navigate to account settings.
 */
@Suppress("LongParameterList")
private fun generateTabPageBannerMenuItems(
    selectedPage: Page,
    normalTabCount: Int,
    privateTabCount: Int,
    onTabSettingsClick: () -> Unit,
    onRecentlyClosedClick: () -> Unit,
    onEnterMultiselectModeClick: () -> Unit,
    onShareAllTabsClick: () -> Unit,
    onDeleteAllTabsClick: () -> Unit,
    onAccountSettingsClick: () -> Unit,
): List<MenuItem> {
    val tabSettingsItem = MenuItem.TextItem(
        text = Text.Resource(R.string.tab_tray_menu_tab_settings),
        testTag = TabsTrayTestTag.TAB_SETTINGS,
        onClick = onTabSettingsClick,
    )
    val recentlyClosedTabsItem = MenuItem.TextItem(
        text = Text.Resource(R.string.tab_tray_menu_recently_closed),
        testTag = TabsTrayTestTag.RECENTLY_CLOSED_TABS,
        onClick = onRecentlyClosedClick,
    )
    val enterSelectModeItem = MenuItem.TextItem(
        text = Text.Resource(R.string.tabs_tray_select_tabs),
        testTag = TabsTrayTestTag.SELECT_TABS,
        onClick = onEnterMultiselectModeClick,
    )
    val shareAllTabsItem = MenuItem.TextItem(
        text = Text.Resource(R.string.tab_tray_menu_item_share),
        testTag = TabsTrayTestTag.SHARE_ALL_TABS,
        onClick = onShareAllTabsClick,
    )
    val deleteAllTabsItem = MenuItem.TextItem(
        text = Text.Resource(R.string.tab_tray_menu_item_close),
        testTag = TabsTrayTestTag.CLOSE_ALL_TABS,
        onClick = onDeleteAllTabsClick,
    )
    val accountSettingsItem = MenuItem.TextItem(
        text = Text.Resource(R.string.tab_tray_menu_account_settings),
        testTag = TabsTrayTestTag.ACCOUNT_SETTINGS,
        onClick = onAccountSettingsClick,
    )
    return when {
        selectedPage == Page.NormalTabs && normalTabCount == 0 ||
            selectedPage == Page.PrivateTabs && privateTabCount == 0 -> listOf(
            tabSettingsItem,
            recentlyClosedTabsItem,
        )

        selectedPage == Page.NormalTabs -> listOf(
            enterSelectModeItem,
            shareAllTabsItem,
            tabSettingsItem,
            recentlyClosedTabsItem,
            deleteAllTabsItem,
        )

        selectedPage == Page.PrivateTabs -> listOf(
            tabSettingsItem,
            recentlyClosedTabsItem,
            deleteAllTabsItem,
        )

        selectedPage == Page.SyncedTabs -> listOf(
            accountSettingsItem,
            recentlyClosedTabsItem,
        )

        else -> emptyList()
    }
}

/**
 * Builds the menu items list when in [Mode.Normal].
 *
 * @param onTabSettingsClick Invoked when the user clicks the menu item to navigate to tab settings.
 * @param onRecentlyClosedClick Invoked when the user clicks the menu item to navigate to their recently closed tabs.
 * @param onEnterMultiselectModeClick Invoked when the user the menu item to enter multiselect mode.
 * @param onShareAllTabsClick Invoked when the user clicks the menu item to share all of their tabs.
 * @param onDeleteAllTabsClick Invoked when user clicks the menu item to delete all of their tabs.
 * @param onAccountSettingsClick Invoked when user clicks the menu item to navigate to account settings.
 */
internal fun TabsTrayState.generateMenuItems(
    onTabSettingsClick: () -> Unit,
    onRecentlyClosedClick: () -> Unit,
    onEnterMultiselectModeClick: () -> Unit,
    onShareAllTabsClick: () -> Unit,
    onDeleteAllTabsClick: () -> Unit,
    onAccountSettingsClick: () -> Unit,
) = generateTabPageBannerMenuItems(
    selectedPage = selectedPage,
    normalTabCount = normalTabs.size,
    privateTabCount = privateTabs.size,
    onTabSettingsClick = onTabSettingsClick,
    onRecentlyClosedClick = onRecentlyClosedClick,
    onEnterMultiselectModeClick = onEnterMultiselectModeClick,
    onShareAllTabsClick = onShareAllTabsClick,
    onDeleteAllTabsClick = onDeleteAllTabsClick,
    onAccountSettingsClick = onAccountSettingsClick,
)
