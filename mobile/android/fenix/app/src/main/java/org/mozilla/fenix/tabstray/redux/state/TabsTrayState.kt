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
 * @property normalTabs The list of normal tabs that do not fall under [inactiveTabs].
 * @property selectedTabId The ID of the currently selected (active) tab.
 * @property inactiveTabs The state of inactive tabs, including the list of tabs and UI flags.
 * @property privateBrowsing The state of private browsing, including tabs and locking status.
 * @property tabGroups The list of [TabsTrayItem.TabGroup]s to display.
 * @property sync The state of Synced Tabs, including the list of tabs and sync status.
 * @property config The configuration flags for the Tabs Tray (e.g., grid display, feature flags).
 * @property tabSearchState The state of the tab search feature.
 * @property tabGroupFormState The state of the tab group edit form.
 * @property backStack The navigation history of the Tab Manager feature.
 */
data class TabsTrayState(
    val selectedPage: Page = Page.NormalTabs,
    val mode: Mode = Mode.Normal,
    val normalTabs: List<TabsTrayItem> = emptyList(),
    val selectedTabId: String? = null,
    val inactiveTabs: InactiveTabsState = InactiveTabsState(),
    val privateBrowsing: PrivateBrowsingState = PrivateBrowsingState(),
    val tabGroups: List<TabsTrayItem.TabGroup> = emptyList(),
    val sync: SyncState = SyncState(),
    val config: TabsTrayConfig = TabsTrayConfig(),
    val tabSearchState: TabSearchState = TabSearchState(),
    val tabGroupFormState: TabGroupFormState? = null,
    val backStack: List<TabManagerNavDestination> = listOf(TabManagerNavDestination.Root),
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
     * State specific to inactive tabs.
     *
     * @property tabs The list of tabs currently considered inactive.
     * @property isExpanded Whether the Inactive Tabs section is expanded in the UI.
     * @property showCFR Whether the Inactive Tabs Contextual Feature Recommendation (CFR) is visible.
     * @property showAutoCloseDialog Whether the dialog to enable auto-closing inactive tabs is visible.
     */
    data class InactiveTabsState(
        val tabs: List<TabsTrayItem.Tab> = emptyList(),
        val isExpanded: Boolean = false,
        val showCFR: Boolean = false,
        val showAutoCloseDialog: Boolean = false,
    )

    /**
     * State specific to private browsing mode.
     *
     * @property tabs The list of open private tabs.
     * @property isLocked Whether Private Browsing Mode is currently locked.
     * @property showLockBanner Whether the banner to enable PBM locking should be displayed.
     */
    data class PrivateBrowsingState(
        val tabs: List<TabsTrayItem> = emptyList(),
        val isLocked: Boolean = false,
        val showLockBanner: Boolean = false,
    )

    /**
     * State related to the Sync feature.
     *
     * @property isSignedIn Whether the user is currently signed into a Firefox account.
     * @property isSyncing Whether a sync operation is currently in progress.
     * @property syncedTabs The list of tabs retrieved from other synced devices.
     * @property expandedSyncedTabs A list of booleans representing the expansion state of each device section.
     */
    data class SyncState(
        val isSignedIn: Boolean = false,
        val isSyncing: Boolean = false,
        val syncedTabs: List<SyncedTabsListItem> = emptyList(),
        val expandedSyncedTabs: List<Boolean> = emptyList(),
    )

    /**
     * Configuration and feature flags for the Tabs Tray UI.
     *
     * @property displayTabsInGrid Whether normal and private tabs are displayed in a grid (vs list).
     * @property tabGroupsEnabled Whether the Tab Groups feature is enabled.
     * @property isInDebugMode Whether the app is in a debug state or has secret menu enabled.
     * @property showTabAutoCloseBanner Whether the banner for the tab auto-closer feature is visible.
     * @property tabSearchEnabled Whether the tab search feature is globally enabled.
     */
    data class TabsTrayConfig(
        val displayTabsInGrid: Boolean = false,
        val tabGroupsEnabled: Boolean = false,
        val isInDebugMode: Boolean = false,
        val showTabAutoCloseBanner: Boolean = false,
        val tabSearchEnabled: Boolean = false,
    )

    /**
     * Whether the Tab Search button is visible.
     */
    val searchIconVisible: Boolean
        get() = config.tabSearchEnabled && selectedPage != Page.SyncedTabs

    /**
     * Whether the Tab Search button is enabled.
     */
    val searchIconEnabled: Boolean
        get() = when {
            selectedPage == Page.NormalTabs && normalTabs.isNotEmpty() -> true
            selectedPage == Page.PrivateTabs && privateBrowsing.tabs.isNotEmpty() -> true
            else -> false
        }
}
