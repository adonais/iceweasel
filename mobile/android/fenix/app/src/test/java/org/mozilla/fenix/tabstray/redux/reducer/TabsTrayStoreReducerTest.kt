/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.reducer

import mozilla.components.browser.state.state.createTab
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.navigation.TabManagerNavDestination
import org.mozilla.fenix.tabstray.redux.action.TabsTrayAction
import org.mozilla.fenix.tabstray.redux.state.TabSearchState
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState
import org.mozilla.fenix.tabstray.syncedtabs.SyncedTabsListItem
import org.mozilla.fenix.tabstray.syncedtabs.generateFakeTab
import org.mozilla.fenix.tabstray.syncedtabs.getFakeSyncedTabList
import kotlin.collections.listOf

class TabsTrayStoreReducerTest {

    @Test
    fun `WHEN UpdateInactiveTabs THEN inactive tabs are added`() {
        val inactiveTabs = listOf(TabsTrayItem.Tab(tab = createTab("https://mozilla.org")))
        val initialState = TabsTrayState()
        val expectedState =
            initialState.copy(inactiveTabs = TabsTrayState.InactiveTabsState(tabs = inactiveTabs))

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateInactiveTabs(inactiveTabs),
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `GIVEN a new value for inactiveTabsExpanded WHEN UpdateInactiveExpanded is called THEN update the current value`() {
        val initialState = TabsTrayState(
            inactiveTabs = TabsTrayState.InactiveTabsState(isExpanded = true),
        )

        var updatedState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateInactiveExpanded(false),
        )
        assertFalse(updatedState.inactiveTabs.isExpanded)

        updatedState =
            TabsTrayReducer.reduce(updatedState, TabsTrayAction.UpdateInactiveExpanded(true))
        assertTrue(updatedState.inactiveTabs.isExpanded)
    }

    @Test
    fun `WHEN UpdateNormalTabs THEN normal tabs are added`() {
        val normalTabs = listOf(TabsTrayItem.Tab(tab = createTab("https://mozilla.org")))
        val initialState = TabsTrayState()
        val expectedState = initialState.copy(normalTabs = normalTabs)

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateNormalTabs(normalTabs),
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `WHEN UpdatePrivateTabs THEN private tabs are added`() {
        val privateTabs = listOf(TabsTrayItem.Tab(tab = createTab("https://mozilla.org", private = true)))
        val initialState = TabsTrayState()
        val expectedState = initialState.copy(
            privateBrowsing = TabsTrayState.PrivateBrowsingState(
                tabs = privateTabs,
            ),
        )

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdatePrivateTabs(privateTabs),
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `WHEN UpdateSyncedTabs THEN synced tabs are added`() {
        val syncedTabs = getFakeSyncedTabList()
        val initialState = TabsTrayState()
        val expectedState = initialState.copy(
            sync = TabsTrayState.SyncState(
                syncedTabs = syncedTabs,
                expandedSyncedTabs = syncedTabs.map { true },
            ),
        )

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateSyncedTabs(syncedTabs),
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `GIVEN no synced tabs WHEN UpdateSyncedTabs is called with tabs THEN the expanded state is initialized to true`() {
        val initialState = TabsTrayState()
        val syncedTabs = getFakeSyncedTabList()

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateSyncedTabs(syncedTabs),
        )

        assertTrue(resultState.sync.expandedSyncedTabs.all { DEFAULT_SYNCED_TABS_EXPANDED_STATE })
    }

    @Test
    fun `WHEN UpdateSyncedTabs is called with an empty list THEN the expanded state is set to an empty list`() {
        val initialState = TabsTrayState()

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateSyncedTabs(emptyList()),
        )

        assertTrue(resultState.sync.expandedSyncedTabs.isEmpty())
    }

    @Test
    fun `GIVEN synced tabs WHEN UpdateSyncedTabs is called with the same tabs THEN the expanded state is retained`() {
        val expectedExpansionList = listOf(true, true, false, false)
        val syncedTabs = getFakeSyncedTabList()
        val initialState = TabsTrayState(
            sync = TabsTrayState.SyncState(
                syncedTabs = syncedTabs,
                expandedSyncedTabs = expectedExpansionList,
            ),
        )

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateSyncedTabs(syncedTabs),
        )

        assertEquals(expectedExpansionList, resultState.sync.expandedSyncedTabs)
    }

    @Test
    fun `GIVEN synced tabs WHEN UpdateSyncedTabs is called with different tabs THEN the expanded state is reset`() {
        val expectedExpansionList = listOf(true, true, false, false)
        val syncedTabs = getFakeSyncedTabList()
        val newSyncedTabs = syncedTabs.reversed()
        val initialState = TabsTrayState(
            sync = TabsTrayState.SyncState(
                syncedTabs = syncedTabs,
                expandedSyncedTabs = expectedExpansionList,
            ),
        )

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateSyncedTabs(newSyncedTabs),
        )

        assertTrue(resultState.sync.expandedSyncedTabs.all { DEFAULT_SYNCED_TABS_EXPANDED_STATE })
    }

    @Test
    fun `GIVEN synced tabs WHEN UpdateSyncedTabs is called with smaller device list THEN the expanded states are reset`() {
        val expectedExpansionList = listOf(true, true, false, false)
        val syncedTabs = getFakeSyncedTabList()
        val newSyncedTabs = listOf(
            SyncedTabsListItem.DeviceSection(
                displayName = "Device 1",
                tabs = listOf(
                    generateFakeTab("Mozilla", "www.mozilla.org"),
                    generateFakeTab("Google", "www.google.com"),
                    generateFakeTab("", "www.google.com"),
                ),
            ),
        )
        val initialState = TabsTrayState(
            sync = TabsTrayState.SyncState(
                syncedTabs = syncedTabs,
                expandedSyncedTabs = expectedExpansionList,
            ),
        )

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateSyncedTabs(newSyncedTabs),
        )

        assertTrue(resultState.sync.expandedSyncedTabs.all { DEFAULT_SYNCED_TABS_EXPANDED_STATE })
    }

    @Test
    fun `GIVEN synced tabs WHEN UpdateSyncedTabs is called with a larger device list THEN the expanded states are reset`() {
        val expectedExpansionList = listOf(true, true, false, false)
        val syncedTabs = listOf(
            SyncedTabsListItem.DeviceSection(
                displayName = "Device 1",
                tabs = listOf(
                    generateFakeTab("Mozilla", "www.mozilla.org"),
                    generateFakeTab("Google", "www.google.com"),
                    generateFakeTab("", "www.google.com"),
                ),
            ),
        )
        val newSyncedTabs = getFakeSyncedTabList()
        val initialState = TabsTrayState(
            sync = TabsTrayState.SyncState(
                syncedTabs = syncedTabs,
                expandedSyncedTabs = expectedExpansionList,
            ),
        )

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateSyncedTabs(newSyncedTabs),
        )

        assertTrue(resultState.sync.expandedSyncedTabs.all { DEFAULT_SYNCED_TABS_EXPANDED_STATE })
    }

    @Test
    fun `GIVEN synced tabs state larger than expanded synced tabs WHEN UpdateSyncedTabs is called THEN it is handled gracefully`() {
        val syncedTabs = getFakeSyncedTabList()
        val newSyncedTabs = getFakeSyncedTabList().reversed()
        val initialState = TabsTrayState(
            sync = TabsTrayState.SyncState(
                syncedTabs = syncedTabs,
                expandedSyncedTabs = emptyList(),
            ),
        )

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateSyncedTabs(newSyncedTabs),
        )

        assertTrue(resultState.sync.expandedSyncedTabs.all { DEFAULT_SYNCED_TABS_EXPANDED_STATE })
    }

    @Test
    fun `GIVEN synced tabs state smaller than expanded synced tabs WHEN UpdateSyncedTabs is called THEN it is handled gracefully`() {
        val syncedTabs = getFakeSyncedTabList()
        val newSyncedTabs = getFakeSyncedTabList().reversed()
        val initialState = TabsTrayState(
            sync = TabsTrayState.SyncState(
                syncedTabs = syncedTabs,
                expandedSyncedTabs = listOf(
                    true,
                    true,
                    false,
                    false,
                    false,
                    false,
                    false,
                    false,
                    false,
                    false,
                ),
            ),
        )

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdateSyncedTabs(newSyncedTabs),
        )

        assertTrue(resultState.sync.expandedSyncedTabs.all { DEFAULT_SYNCED_TABS_EXPANDED_STATE })
    }

    @Test
    fun `WHEN the tab search button is pressed THEN the tab search destination is added to the back stack`() {
        val initialState = TabsTrayState()
        val resultState = TabsTrayReducer.reduce(
            state = initialState,
            action = TabsTrayAction.TabSearchClicked,
        )

        assertTrue(initialState.backStack.none { it == TabManagerNavDestination.TabSearch })
        assertTrue(resultState.backStack.last() == TabManagerNavDestination.TabSearch)
    }

    @Test
    fun `GIVEN the synced tab header is expanded WHEN the synced tabs header is toggled THEN the synced tabs header is collapsed`() {
        val syncedTabs = getFakeSyncedTabList()
        val initialState = TabsTrayState(
            sync = TabsTrayState.SyncState(
                syncedTabs = syncedTabs,
                expandedSyncedTabs = syncedTabs.map { true },
            ),
        )

        val resultState = TabsTrayReducer.reduce(
            state = initialState,
            action = TabsTrayAction.SyncedTabsHeaderToggled(0),
        )

        assertFalse(resultState.sync.expandedSyncedTabs[0])
    }

    @Test
    fun `GIVEN the synced tab header is collapsed WHEN the synced tabs header is toggled THEN the synced tabs header is expanded`() {
        val syncedTabs = getFakeSyncedTabList()
        val initialState = TabsTrayState(
            sync = TabsTrayState.SyncState(
                syncedTabs = syncedTabs,
                expandedSyncedTabs = syncedTabs.map { false },
            ),
        )

        val resultState = TabsTrayReducer.reduce(
            state = initialState,
            action = TabsTrayAction.SyncedTabsHeaderToggled(0),
        )

        assertTrue(resultState.sync.expandedSyncedTabs[0])
    }

    @Test
    fun `WHEN the user leaves search THEN tab search state is reset to defaults`() {
        val initialState = TabsTrayState(
            tabSearchState = TabSearchState(
                query = "mozilla",
                searchResults = listOf(TabsTrayItem.Tab(tab = createTab("https://mozilla.org"))),
            ),
        )

        val inSearchState = TabsTrayReducer.reduce(
            state = initialState,
            action = TabsTrayAction.TabSearchClicked,
        )

        val resultState = TabsTrayReducer.reduce(
            state = inSearchState,
            action = TabsTrayAction.NavigateBackInvoked,
        )

        val expectedState = inSearchState.copy(
            tabSearchState = TabSearchState(),
            backStack = listOf(TabManagerNavDestination.Root),
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `WHEN UpdatePbmLockStatus THEN isPbmLocked is updated`() {
        val initialState = TabsTrayState(
            privateBrowsing = TabsTrayState.PrivateBrowsingState(
                isLocked = false,
            ),
        )

        val lockedState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.UpdatePbmLockStatus(isLocked = true),
        )
        assertTrue(lockedState.privateBrowsing.isLocked)

        val unlockedState = TabsTrayReducer.reduce(
            lockedState,
            TabsTrayAction.UpdatePbmLockStatus(isLocked = false),
        )
        assertFalse(unlockedState.privateBrowsing.isLocked)
    }

    @Test
    fun `WHEN DismissInactiveTabsCFR THEN showInactiveTabsCFR is set to false`() {
        val initialState =
            TabsTrayState(inactiveTabs = TabsTrayState.InactiveTabsState(showCFR = true))

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.DismissInactiveTabsCFR,
        )

        assertFalse(resultState.inactiveTabs.showCFR)
    }

    @Test
    fun `WHEN DismissInactiveTabsAutoCloseDialog THEN showInactiveTabsAutoCloseDialog is set to false`() {
        val initialState =
            TabsTrayState(inactiveTabs = TabsTrayState.InactiveTabsState(showAutoCloseDialog = true))

        val resultState = TabsTrayReducer.reduce(
            initialState,
            TabsTrayAction.DismissInactiveTabsAutoCloseDialog,
        )

        assertFalse(resultState.inactiveTabs.showAutoCloseDialog)
    }
}
