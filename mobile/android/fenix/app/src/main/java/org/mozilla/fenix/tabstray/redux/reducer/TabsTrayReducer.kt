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
            is TabsTrayAction.EnterSelectMode ->
                state.copy(mode = TabsTrayState.Mode.Select(emptySet()))
            is TabsTrayAction.ExitSelectMode ->
                state.copy(mode = TabsTrayState.Mode.Normal)
            is TabsTrayAction.AddSelectTab ->
                state.copy(mode = TabsTrayState.Mode.Select(state.mode.selectedTabs + action.tab))
            is TabsTrayAction.RemoveSelectTab -> {
                val selected = state.mode.selectedTabs.filter { it.id != action.tab.id }.toSet()
                state.copy(
                    mode = if (selected.isEmpty()) {
                        TabsTrayState.Mode.Normal
                    } else {
                        TabsTrayState.Mode.Select(selected)
                    },
                )
            }
            is TabsTrayAction.PageSelected ->
                state.copy(selectedPage = action.page)
            is TabsTrayAction.SyncNow ->
                state.copy(syncing = true)
            is TabsTrayAction.SyncCompleted ->
                state.copy(syncing = false)
            is TabsTrayAction.UpdateInactiveExpanded ->
                state.copy(inactiveTabsExpanded = action.expanded)
            is TabsTrayAction.UpdateInactiveTabs ->
                state.copy(inactiveTabs = action.tabs)
            is TabsTrayAction.UpdateNormalTabs ->
                state.copy(normalTabs = action.tabs)
            is TabsTrayAction.UpdatePrivateTabs ->
                state.copy(privateTabs = action.tabs)
            is TabsTrayAction.UpdateSyncedTabs -> handleSyncedTabUpdate(state, action)
            is TabsTrayAction.UpdateSelectedTabId ->
                state.copy(selectedTabId = action.tabId)
            is TabsTrayAction.TabAutoCloseDialogShown -> state
            is TabsTrayAction.ShareAllNormalTabs -> state
            is TabsTrayAction.ShareAllPrivateTabs -> state
            is TabsTrayAction.CloseAllNormalTabs -> state
            is TabsTrayAction.CloseAllPrivateTabs -> state
            is TabsTrayAction.BookmarkSelectedTabs -> state
            is TabsTrayAction.ThreeDotMenuShown -> state

            is TabSearchAction -> TabSearchActionReducer.reduce(
                state = state,
                action = action,
            )
            is TabsTrayAction.TabSearchClicked -> {
                state.copy(backStack = state.backStack + TabManagerNavDestination.TabSearch)
            }

            is TabsTrayAction.NavigateBackInvoked -> {
                when {
                    state.mode is TabsTrayState.Mode.Select -> state.copy(mode = TabsTrayState.Mode.Normal)

                    state.backStack.lastOrNull() == TabManagerNavDestination.TabSearch -> state.copy(
                        tabSearchState = TabSearchState(
                            query = "",
                            searchResults = emptyList(),
                        ),
                        backStack = state.popBackStack(),
                    )

                    else -> state.copy(backStack = state.popBackStack())
                }
            }
            is TabsTrayAction.SyncedTabsHeaderToggled -> handleSyncedTabHeaderToggle(state, action)
            is TabsTrayAction.TabDataUpdateReceived -> state.copy(
                selectedTabId = action.tabStorageUpdate.selectedTabId,
                normalTabs = action.tabStorageUpdate.normalTabs,
                inactiveTabs = action.tabStorageUpdate.inactiveTabs,
                privateTabs = action.tabStorageUpdate.privateTabs,
                tabGroups = action.tabStorageUpdate.tabGroups,
            )
            is TabGroupAction -> TabGroupActionReducer.reduce(state, action)
        }
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
    return if (syncStateExists(state, action) && syncedDevicesUnchanged(state, action)) {
        state.copy(
            syncedTabs = action.tabs,
            expandedSyncedTabs = action.tabs.mapIndexed { index, item ->
                if (state.syncedTabs[index] == item && index < state.expandedSyncedTabs.size) {
                    state.expandedSyncedTabs[index]
                } else {
                    DEFAULT_SYNCED_TABS_EXPANDED_STATE
                }
            },
        )
    } else if (action.tabs.isNotEmpty()) {
        state.copy(
            syncedTabs = action.tabs,
            expandedSyncedTabs =
                action.tabs.map { DEFAULT_SYNCED_TABS_EXPANDED_STATE },
        )
    } else {
        state.copy(syncedTabs = action.tabs, expandedSyncedTabs = emptyList())
    }
}

// Does previous state exist for the SyncedTabs we might want to preserve?
private fun syncStateExists(state: TabsTrayState, action: TabsTrayAction.UpdateSyncedTabs): Boolean {
    return state.syncedTabs.isNotEmpty() && action.tabs.isNotEmpty()
}

// Has the list of devices synced in SyncedTabs list changed?
private fun syncedDevicesUnchanged(state: TabsTrayState, action: TabsTrayAction.UpdateSyncedTabs): Boolean {
    return state.syncedTabs.size == action.tabs.size
}

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
        expandedSyncedTabs = state.expandedSyncedTabs.mapIndexed { index, isExpanded ->
            if (index == action.index) {
                !isExpanded
            } else {
                isExpanded
            }
        },
    )
}

/**
 *  Drops the last entry of [TabsTrayState.backStack].
 */
private fun TabsTrayState.popBackStack() =
    backStack.dropLast(1)
