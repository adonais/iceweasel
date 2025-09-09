/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray

import mozilla.components.browser.state.state.createTab
import mozilla.components.support.test.ext.joinBlocking
import mozilla.components.support.test.libstate.ext.waitUntilIdle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TabsTrayStoreTest {

    @Test
    fun `WHEN entering select mode THEN selected tabs are empty`() {
        val store = TabsTrayStore()

        store.dispatch(TabsTrayAction.EnterSelectMode)

        store.waitUntilIdle()

        assertTrue(store.state.mode.selectedTabs.isEmpty())
        assertTrue(store.state.mode is TabsTrayState.Mode.Select)

        store.dispatch(TabsTrayAction.AddSelectTab(createTab(url = "url")))

        store.dispatch(TabsTrayAction.ExitSelectMode)
        store.dispatch(TabsTrayAction.EnterSelectMode)

        store.waitUntilIdle()

        assertTrue(store.state.mode.selectedTabs.isEmpty())
        assertTrue(store.state.mode is TabsTrayState.Mode.Select)
    }

    @Test
    fun `WHEN exiting select mode THEN the mode in the state updates`() {
        val store = TabsTrayStore()

        store.dispatch(TabsTrayAction.EnterSelectMode)

        store.waitUntilIdle()

        assertTrue(store.state.mode is TabsTrayState.Mode.Select)

        store.dispatch(TabsTrayAction.ExitSelectMode)

        store.waitUntilIdle()

        assertTrue(store.state.mode is TabsTrayState.Mode.Normal)
    }

    @Test
    fun `WHEN adding a tab to selection THEN it is added to the selectedTabs`() {
        val store = TabsTrayStore()

        store.dispatch(TabsTrayAction.AddSelectTab(createTab(url = "url", id = "tab1")))

        store.waitUntilIdle()

        assertEquals("tab1", store.state.mode.selectedTabs.take(1).first().id)
    }

    @Test
    fun `WHEN removing a tab THEN it is removed from the selectedTabs`() {
        val store = TabsTrayStore()
        val tabForRemoval = createTab(url = "url", id = "tab1")

        store.dispatch(TabsTrayAction.AddSelectTab(tabForRemoval))
        store.dispatch(TabsTrayAction.AddSelectTab(createTab(url = "url", id = "tab2")))

        store.waitUntilIdle()

        assertEquals(2, store.state.mode.selectedTabs.size)

        store.dispatch(TabsTrayAction.RemoveSelectTab(tabForRemoval))

        store.waitUntilIdle()

        assertEquals(1, store.state.mode.selectedTabs.size)
        assertEquals("tab2", store.state.mode.selectedTabs.take(1).first().id)
    }

    @Test
    fun `WHEN store is initialized THEN the default page selected in normal tabs`() {
        val store = TabsTrayStore()

        assertEquals(Page.NormalTabs, store.state.selectedPage)
    }

    @Test
    fun `WHEN page changes THEN the selectedPage is updated`() {
        val store = TabsTrayStore()

        assertEquals(Page.NormalTabs, store.state.selectedPage)

        store.dispatch(TabsTrayAction.PageSelected(Page.SyncedTabs))

        store.waitUntilIdle()

        assertEquals(Page.SyncedTabs, store.state.selectedPage)
    }

    @Test
    fun `GIVEN the tab manager enhancements are enabled WHEN position is converted to page THEN page is correct`() {
        assert(Page.positionToPage(position = 0, enhancementsEnabled = true) == Page.PrivateTabs)
        assert(Page.positionToPage(position = 1, enhancementsEnabled = true) == Page.NormalTabs)
        assert(Page.positionToPage(position = 2, enhancementsEnabled = true) == Page.SyncedTabs)
        assert(Page.positionToPage(position = 3, enhancementsEnabled = true) == Page.SyncedTabs)
        assert(Page.positionToPage(position = -1, enhancementsEnabled = true) == Page.SyncedTabs)
    }

    @Test
    fun `GIVEN the tab manager enhancements are disabled WHEN position is converted to page THEN page is correct`() {
        assert(Page.positionToPage(position = 0, enhancementsEnabled = false) == Page.NormalTabs)
        assert(Page.positionToPage(position = 1, enhancementsEnabled = false) == Page.PrivateTabs)
        assert(Page.positionToPage(position = 2, enhancementsEnabled = false) == Page.SyncedTabs)
        assert(Page.positionToPage(position = 3, enhancementsEnabled = false) == Page.SyncedTabs)
        assert(Page.positionToPage(position = -1, enhancementsEnabled = false) == Page.SyncedTabs)
    }

    @Test
    fun `GIVEN the tab manager enhancements are enabled WHEN Page is converted to an index THEN the index is correct`() {
        assert(Page.pageToPosition(page = Page.PrivateTabs, enhancementsEnabled = true) == 0)
        assert(Page.pageToPosition(page = Page.NormalTabs, enhancementsEnabled = true) == 1)
        assert(Page.pageToPosition(page = Page.SyncedTabs, enhancementsEnabled = true) == 2)
    }

    @Test
    fun `GIVEN the tab manager enhancements are disabled WHEN Page is converted to an index THEN the index is correct`() {
        assert(Page.pageToPosition(page = Page.NormalTabs, enhancementsEnabled = false) == 0)
        assert(Page.pageToPosition(page = Page.PrivateTabs, enhancementsEnabled = false) == 1)
        assert(Page.pageToPosition(page = Page.SyncedTabs, enhancementsEnabled = false) == 2)
    }

    @Test
    fun `WHEN sync now action is triggered THEN update the sync now boolean`() {
        val store = TabsTrayStore()

        assertFalse(store.state.syncing)

        store.dispatch(TabsTrayAction.SyncNow)

        store.waitUntilIdle()

        assertTrue(store.state.syncing)
    }

    @Test
    fun `WHEN sync is complete THEN the syncing boolean is updated`() {
        val store = TabsTrayStore(initialState = TabsTrayState(syncing = true))

        assertTrue(store.state.syncing)

        store.dispatch(TabsTrayAction.SyncCompleted)

        store.waitUntilIdle()

        assertFalse(store.state.syncing)
    }

    @Test
    fun `WHEN the selected tab has changed THEN the selected tab Id should be updated`() {
        val expected = "New tab ID"
        val store = TabsTrayStore(initialState = TabsTrayState(selectedTabId = null))

        store.dispatch(TabsTrayAction.UpdateSelectedTabId(tabId = expected))

        store.waitUntilIdle()

        assertEquals(expected, store.state.selectedTabId)
    }

    @Test
    fun `WHEN UpdateInactiveExpanded is dispatched THEN update inactiveTabsExpanded`() {
        val tabsTrayStore = TabsTrayStore(initialState = TabsTrayState(inactiveTabsExpanded = false))

        assertFalse(tabsTrayStore.state.inactiveTabsExpanded)

        tabsTrayStore.dispatch(TabsTrayAction.UpdateInactiveExpanded(true)).joinBlocking()

        assertTrue(tabsTrayStore.state.inactiveTabsExpanded)
    }
}
