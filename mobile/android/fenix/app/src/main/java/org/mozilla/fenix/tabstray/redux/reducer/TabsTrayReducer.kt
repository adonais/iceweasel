/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.reducer

import org.mozilla.fenix.tabstray.navigation.TabManagerNavDestination
import org.mozilla.fenix.tabstray.redux.action.TabGroupAction
import org.mozilla.fenix.tabstray.redux.action.TabSearchAction
import org.mozilla.fenix.tabstray.redux.action.TabsTrayAction
import org.mozilla.fenix.tabstray.redux.state.TabSearchState
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState
import org.mozilla.fenix.tabstray.redux.store.TabsTrayStore

/**
 * The default state of the synced tabs expanded state, which is true.
 */
internal const val DEFAULT_SYNCED_TABS_EXPANDED_STATE = true

/**
 * Primary Reducer for [TabsTrayStore].
 */
internal object TabsTrayReducer {
    fun reduce(state: TabsTrayState, action: TabsTrayAction): TabsTrayState {
        return when (action) {
            is TabsTrayAction.InitAction -> state

            // Selection Mode Actions
            is TabsTrayAction.EnterSelectMode,
            is TabsTrayAction.ExitSelectMode,
            is TabsTrayAction.AddSelectTab,
            is TabsTrayAction.RemoveSelectTab,
                 -> handleSelectionModeActions(state, action)

            // Tab Update Actions
            is TabsTrayAction.UpdateNormalTabs,
            is TabsTrayAction.UpdatePrivateTabs,
            is TabsTrayAction.UpdateSelectedTabId,
            is TabsTrayAction.TabDataUpdateReceived,
                 -> handleTabUpdates(state, action)

            // Inactive Tabs Actions
            is TabsTrayAction.UpdateInactiveExpanded,
            is TabsTrayAction.UpdateInactiveTabs,
            is TabsTrayAction.DismissInactiveTabsCFR,
            is TabsTrayAction.DismissInactiveTabsAutoCloseDialog,
                 -> handleInactiveTabsActions(state, action)

            // Sync Actions
            is TabsTrayAction.SyncNow -> state.copy(sync = state.sync.copy(isSyncing = true))
            is TabsTrayAction.SyncCompleted -> state.copy(sync = state.sync.copy(isSyncing = false))
            is TabsTrayAction.UpdateSyncedTabs -> handleSyncedTabUpdate(state, action)
            is TabsTrayAction.SyncedTabsHeaderToggled -> handleSyncedTabHeaderToggle(state, action)

            // Navigation Actions
            is TabsTrayAction.TabSearchClicked -> {
                state.copy(backStack = state.backStack + TabManagerNavDestination.TabSearch)
            }
            is TabsTrayAction.NavigateBackInvoked -> handleNavigateBack(state)
            is TabsTrayAction.PageSelected -> state.copy(selectedPage = action.page)

            // Delegated Actions
            is TabSearchAction -> TabSearchActionReducer.reduce(state, action)
            is TabGroupAction -> TabGroupActionReducer.reduce(state, action)

            // UI State / No-op Actions
            is TabsTrayAction.UpdatePbmLockStatus ->
                state.copy(privateBrowsing = state.privateBrowsing.copy(isLocked = action.isLocked))
            is TabsTrayAction.TabAutoCloseDialogShown,
            is TabsTrayAction.ShareAllNormalTabs,
            is TabsTrayAction.ShareAllPrivateTabs,
            is TabsTrayAction.CloseAllNormalTabs,
            is TabsTrayAction.CloseAllPrivateTabs,
            is TabsTrayAction.BookmarkSelectedTabs,
            is TabsTrayAction.ThreeDotMenuShown,
                 -> state
        }
    }

    private fun handleSelectionModeActions(state: TabsTrayState, action: TabsTrayAction): TabsTrayState {
        return when (action) {
            is TabsTrayAction.EnterSelectMode ->
                state.copy(mode = TabsTrayState.Mode.Select(emptySet()))
            is TabsTrayAction.ExitSelectMode ->
                state.copy(mode = TabsTrayState.Mode.Normal)
            is TabsTrayAction.AddSelectTab ->
                state.copy(mode = TabsTrayState.Mode.Select(state.mode.selectedTabs + action.tab))
            is TabsTrayAction.RemoveSelectTab -> {
                val selected = state.mode.selectedTabs.filter { it.id != action.tab.id }.toSet()
                state.copy(
                    mode = if (selected.isEmpty()) TabsTrayState.Mode.Normal else TabsTrayState.Mode.Select(selected),
                )
            }
            else -> state
        }
    }

    private fun handleTabUpdates(state: TabsTrayState, action: TabsTrayAction): TabsTrayState {
        return when (action) {
            is TabsTrayAction.UpdateNormalTabs -> state.copy(normalTabs = action.tabs)
            is TabsTrayAction.UpdatePrivateTabs -> state.copy(
                privateBrowsing = state.privateBrowsing.copy(tabs = action.tabs),
            )
            is TabsTrayAction.UpdateSelectedTabId -> state.copy(selectedTabId = action.tabId)
            is TabsTrayAction.TabDataUpdateReceived -> state.copy(
                selectedTabId = action.tabStorageUpdate.selectedTabId,
                normalTabs = action.tabStorageUpdate.normalTabs,
                inactiveTabs = state.inactiveTabs.copy(tabs = action.tabStorageUpdate.inactiveTabs),
                privateBrowsing = state.privateBrowsing.copy(tabs = action.tabStorageUpdate.privateTabs),
                tabGroups = action.tabStorageUpdate.tabGroups,
            )
            else -> state
        }
    }

    private fun handleInactiveTabsActions(state: TabsTrayState, action: TabsTrayAction): TabsTrayState {
        return when (action) {
            is TabsTrayAction.UpdateInactiveExpanded ->
                state.copy(inactiveTabs = state.inactiveTabs.copy(isExpanded = action.expanded))
            is TabsTrayAction.UpdateInactiveTabs ->
                state.copy(inactiveTabs = state.inactiveTabs.copy(tabs = action.tabs))
            is TabsTrayAction.DismissInactiveTabsCFR ->
                state.copy(inactiveTabs = state.inactiveTabs.copy(showCFR = false))
            is TabsTrayAction.DismissInactiveTabsAutoCloseDialog ->
                state.copy(inactiveTabs = state.inactiveTabs.copy(showAutoCloseDialog = false))
            else -> state
        }
    }

    private fun handleNavigateBack(state: TabsTrayState): TabsTrayState {
        return when {
            state.mode is TabsTrayState.Mode.Select -> state.copy(mode = TabsTrayState.Mode.Normal)
            state.backStack.lastOrNull() == TabManagerNavDestination.TabSearch -> state.copy(
                tabSearchState = TabSearchState(query = "", searchResults = emptyList()),
                backStack = state.popBackStack(),
            )
            else -> state.copy(backStack = state.popBackStack())
        }
    }

    /**
     * Updates the synced tabs list.  Also updates the expansion state of the tabs.
     * If items are identical in an existing list, their selection state will be preserved
     * (pressing sync tab on an already synced tab will not reset your expansion selections).
     * If the tab list is updated or no tabs existed previously, selections will be the default value.
     *
     * @param state the existing state object
     * @param action the action containing updated tabs.
     */
    private fun handleSyncedTabUpdate(state: TabsTrayState, action: TabsTrayAction.UpdateSyncedTabs): TabsTrayState {
        val currentSync = state.sync
        val tabs = action.tabs
        return when {
            syncStateExists(state, action) && syncedDevicesUnchanged(state, action) -> {
                state.copy(
                    sync = currentSync.copy(
                        syncedTabs = tabs,
                        expandedSyncedTabs = tabs.mapIndexed { index, item ->
                            if (currentSync.syncedTabs[index] == item && index < currentSync.expandedSyncedTabs.size) {
                                currentSync.expandedSyncedTabs[index]
                            } else {
                                DEFAULT_SYNCED_TABS_EXPANDED_STATE
                            }
                        },
                    ),
                )
            }
            tabs.isNotEmpty() -> {
                state.copy(
                    sync = currentSync.copy(
                        syncedTabs = tabs,
                        expandedSyncedTabs = tabs.map { DEFAULT_SYNCED_TABS_EXPANDED_STATE },
                    ),
                )
            }
            else -> {
                state.copy(
                    sync = currentSync.copy(
                        syncedTabs = tabs,
                        expandedSyncedTabs = emptyList(),
                    ),
                )
            }
        }
    }

    // Does previous state exist for the SyncedTabs we might want to preserve?
    private fun syncStateExists(state: TabsTrayState, action: TabsTrayAction.UpdateSyncedTabs) =
        state.sync.syncedTabs.isNotEmpty() && action.tabs.isNotEmpty()

    // Has the list of devices synced in SyncedTabs list changed?
    private fun syncedDevicesUnchanged(state: TabsTrayState, action: TabsTrayAction.UpdateSyncedTabs) =
        state.sync.syncedTabs.size == action.tabs.size

    /**
     * When a synced tab header's expansion is toggled, that item should be expanded or collapsed.
     * The rest of the list should be unchanged.
     *
     * @param state the existing state object
     * @param action the action containing the index of the toggled header.
     */
    private fun handleSyncedTabHeaderToggle(
        state: TabsTrayState,
        action: TabsTrayAction.SyncedTabsHeaderToggled,
    ): TabsTrayState {
        return state.copy(
            sync = state.sync.copy(
                expandedSyncedTabs = state.sync.expandedSyncedTabs.mapIndexed { index, isExpanded ->
                    if (index == action.index) !isExpanded else isExpanded
                },
            ),
        )
    }

    /**
     *  Drops the last entry of [TabsTrayState.backStack].
     */
    private fun TabsTrayState.popBackStack() = backStack.dropLast(1)
}
