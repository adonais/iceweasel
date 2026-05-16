/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.state

import org.mozilla.fenix.tabstray.data.createTab
import org.mozilla.fenix.tabstray.data.createTabGroup
import org.mozilla.fenix.tabstray.navigation.TabManagerNavDestination
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState.Mode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TabsTrayStateTest {

    @Test
    fun `GIVEN tabs are selected WHEN fetching the selected tab IDs from State THEN the IDs of the selected tabs are returned`() {
        val tabs = List(size = 10) { createTab(url = "") }
        val state = TabsTrayState(mode = Mode.Select(selectedTabs = tabs.toSet()))

        assertEquals(tabs.map { it.id }, state.mode.selectedTabIds)
    }

    @Test
    fun `GIVEN tab groups are selected WHEN fetching the selected tab group IDs from State THEN the IDs of the selected groups are returned`() {
        val tabGroups = List(size = 10) { createTabGroup() }
        val state = TabsTrayState(mode = Mode.Select(selectedTabGroups = tabGroups.toSet()))

        assertEquals(tabGroups.map { it.id }, state.mode.selectedTabGroupIds)
    }

    @Test
    fun `GIVEN there are selected tab items WHEN checking whether a selected tab is selected THEN return true`() {
        val tab = createTab(url = "")
        val tabs = List(size = 10) { createTab(url = "") } + tab
        val state = TabsTrayState(mode = Mode.Select(selectedTabs = tabs.toSet()))

        assertTrue(state.mode.contains(item = tab))
    }

    @Test
    fun `GIVEN there are selected tab items WHEN checking whether an unselected tab is selected THEN return false`() {
        val tab = createTab(url = "")
        val tabs = List(size = 10) { createTab(url = "") }
        val state = TabsTrayState(mode = Mode.Select(selectedTabs = tabs.toSet()))

        assertFalse(state.mode.contains(item = tab))
    }

    @Test
    fun `GIVEN there are selected tab items WHEN checking whether a selected group is selected THEN return true`() {
        val tabGroup = createTabGroup()
        val tabs = List(size = 10) { createTab(url = "") }
        val state = TabsTrayState(
            mode = Mode.Select(
                selectedTabs = tabs.toSet(),
                selectedTabGroups = setOf(tabGroup),
            ),
        )

        assertTrue(state.mode.contains(item = tabGroup))
    }

    @Test
    fun `GIVEN there are selected tab items WHEN checking whether an unselected group is selected THEN return false`() {
        val tabGroup = createTabGroup()
        val tabs = List(size = 10) { createTab(url = "") }
        val tabGroups = List(size = 10) { createTabGroup() }
        val state = TabsTrayState(
            mode = Mode.Select(
                selectedTabs = tabs.toSet(),
                selectedTabGroups = tabGroups.toSet(),
            ),
        )

        assertFalse(state.mode.contains(item = tabGroup))
    }

    @Test
    fun `GIVEN tab search is enabled and the user is on the Synced tabs page WHEN in the Tab Manager THEN the search icon is not shown`() {
        val state = TabsTrayState(selectedPage = Page.SyncedTabs, config = TabsTrayState.TabsTrayConfig(tabSearchEnabled = true))
        assertFalse(state.searchIconVisible)
    }

    @Test
    fun `GIVEN tab search is enabled and the user is on the Normal tabs page WHEN in the Tab Manager THEN the search icon is shown`() {
        val state = TabsTrayState(selectedPage = Page.NormalTabs, config = TabsTrayState.TabsTrayConfig(tabSearchEnabled = true))
        assertTrue(state.searchIconVisible)
    }

    @Test
    fun `GIVEN tab search is enabled and the user is on the Private tabs page WHEN in the Tab Manager THEN the search icon is shown`() {
        val state = TabsTrayState(selectedPage = Page.PrivateTabs, config = TabsTrayState.TabsTrayConfig(tabSearchEnabled = true))
        assertTrue(state.searchIconVisible)
    }

    @Test
    fun `GIVEN the user is on the Normal tabs page without tabs WHEN in the Tab Manager THEN the search icon is disabled`() {
        val state = TabsTrayState(selectedPage = Page.NormalTabs, normalTabsState = TabsTrayState.NormalTabsState(items = emptyList()))
        assertFalse(state.searchIconEnabled)
    }

    @Test
    fun `GIVEN the user is on the Normal tabs page with tabs WHEN in the Tab Manager THEN the search icon is enabled`() {
        val state = TabsTrayState(selectedPage = Page.NormalTabs, normalTabsState = TabsTrayState.NormalTabsState(items = listOf(createTab(url = ""))))
        assertTrue(state.searchIconEnabled)
    }

    @Test
    fun `GIVEN the user is on the Private tabs page without private tabs WHEN in the Tab Manager THEN the search icon is disabled`() {
        val state = TabsTrayState(selectedPage = Page.PrivateTabs, privateBrowsing = TabsTrayState.PrivateBrowsingState(tabs = emptyList()))
        assertFalse(state.searchIconEnabled)
    }

    @Test
    fun `GIVEN the user is on the Private tabs page with private tabs WHEN in the Tab Manager THEN the search icon is enabled`() {
        val state = TabsTrayState(selectedPage = Page.PrivateTabs, privateBrowsing = TabsTrayState.PrivateBrowsingState(tabs = listOf(createTab(url = ""))))
        assertTrue(state.searchIconEnabled)
    }

    @Test
    fun `GIVEN there are multiple destinations on the back stack WHEN popping the backstack THEN the top destination is popped`() {
        val initialBackStack = listOf(
            TabManagerNavDestination.Root,
            TabManagerNavDestination.TabSearch,
            TabManagerNavDestination.AddToTabGroup,
        )
        val actualBackStack = TabsTrayState(backStack = initialBackStack).popBackStack()
        val expectedBackStack = initialBackStack.dropLast(1)

        assertEquals(expectedBackStack, actualBackStack)
    }

    @Test
    fun `GIVEN there is one destination on the back stack WHEN popping the backstack THEN the top destination is not popped`() {
        val initialBackStack = listOf(TabManagerNavDestination.Root)
        val actualBackStack = TabsTrayState(backStack = initialBackStack).popBackStack()
        val expectedBackStack = initialBackStack

        assertEquals(expectedBackStack, actualBackStack)
    }
}
