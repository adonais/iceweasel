/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.state

import mozilla.components.lib.state.State
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.navigation.TabManagerNavDestination
import org.mozilla.fenix.tabstray.syncedtabs.SyncedTabsListItem

/**
 * Value type that represents the state of the Tabs Tray.
 *
 * @property selectedPage The current page in the tray can be on.
 * @property mode Whether the browser tab list is in multi-select mode or not with the set of
 * currently selected tabs.
 * @property inactiveTabs The list of [TabsTrayItem.Tab]s are considered inactive.
 * @property inactiveTabsExpanded A flag to know if the Inactive Tabs section of the Tabs Tray
 * should be expanded when the tray is opened.
 * @property normalTabs The list of [TabsTrayItem]s that do not fall under [inactiveTabs].
 * @property privateTabs The list of [TabsTrayItem]s that are private.
 * @property tabGroups The list of [TabsTrayItem.TabGroup]s to display.
 * @property syncedTabs The list of synced tabs.
 * @property syncing Whether the Synced Tabs feature should fetch the latest tabs from paired devices.
 * @property selectedTabId The ID of the currently selected (active) tab.
 * @property tabSearchState The state of the tab search feature.
 * @property tabSearchEnabled  Whether the tab search feature is enabled.
 * @property tabGroupsEnabled Whether the tab group feature is enabled.
 * @property backStack The navigation history of the Tab Manager feature.
 * @property expandedSyncedTabs The list of expansion states for the syncedTabs.
 * @property tabGroupFormState The state of the tab group edit form.
 */
data class TabsTrayState(
    val selectedPage: Page = Page.NormalTabs,
    val mode: Mode = Mode.Normal,
    val inactiveTabs: List<TabsTrayItem.Tab> = emptyList(),
    val inactiveTabsExpanded: Boolean = false,
    val normalTabs: List<TabsTrayItem> = emptyList(),
    val privateTabs: List<TabsTrayItem> = emptyList(),
    val tabGroups: List<TabsTrayItem.TabGroup> = emptyList(),
    val syncedTabs: List<SyncedTabsListItem> = emptyList(),
    val syncing: Boolean = false,
    val selectedTabId: String? = null,
    val tabSearchState: TabSearchState = TabSearchState(),
    val tabSearchEnabled: Boolean = false,
    val tabGroupsEnabled: Boolean = false,
    val backStack: List<TabManagerNavDestination> = listOf(TabManagerNavDestination.Root),
    val expandedSyncedTabs: List<Boolean> = emptyList(),
    val tabGroupFormState: TabGroupFormState? = null,
) : State {

    /**
     * The current mode that the tabs list is in.
     */
    sealed class Mode {

        /**
         * A set of selected tabs which we would want to perform an action on.
         */
        open val selectedTabs = emptySet<TabsTrayItem>()

        /**
         * The default mode the tabs list is in.
         */
        object Normal : Mode()

        /**
         * The multi-select mode that the tabs list is in containing the set of currently
         * selected tabs.
         */
        data class Select(override val selectedTabs: Set<TabsTrayItem>) : Mode()
    }

    /**
     * Whether the Tab Search button is visible.
     */
    val searchIconVisible: Boolean
        get() = tabSearchEnabled && selectedPage != Page.SyncedTabs

    /**
     * Whether the Tab Search button is enabled.
     */
    val searchIconEnabled: Boolean
        get() = when {
            selectedPage == Page.NormalTabs && normalTabs.isNotEmpty() -> true
            selectedPage == Page.PrivateTabs && privateTabs.isNotEmpty() -> true
            else -> false
        }
}
