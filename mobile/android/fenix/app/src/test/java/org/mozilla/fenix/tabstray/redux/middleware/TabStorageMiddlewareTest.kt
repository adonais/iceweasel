/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.middleware

import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.mockk
import junit.framework.TestCase.assertEquals
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.TabListAction
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.tabs.TabsUseCases
import mozilla.components.feature.tabs.TabsUseCases.RemoveTabsUseCase
import mozilla.components.support.utils.DateTimeProvider
import mozilla.components.support.utils.FakeDateTimeProvider
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.tabgroups.fakes.FakeTabGroupRepository
import org.mozilla.fenix.tabgroups.storage.database.StoredTabGroup
import org.mozilla.fenix.tabgroups.storage.repository.TabGroupRepository
import org.mozilla.fenix.tabstray.data.TabData
import org.mozilla.fenix.tabstray.data.TabGroupTheme
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.data.createTabGroup
import org.mozilla.fenix.tabstray.redux.action.TabGroupAction
import org.mozilla.fenix.tabstray.redux.state.TabGroupFormState
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState.Mode
import org.mozilla.fenix.tabstray.redux.store.TabsTrayStore
import org.mozilla.fenix.tabstray.data.createTab as createTabsTrayItemTab

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class TabStorageMiddlewareTest {

    private val fakeDateTimeProvider = FakeDateTimeProvider(currentTime = 10L)

    @Test
    fun `WHEN the selected tab ID is updated THEN transform the data and dispatch an update`() = runTest {
        val expectedTabId = "1"
        val initialState = TabData(
            selectedTabId = null,
            tabs = listOf(createTab(id = expectedTabId, url = "")),
        )
        val expectedState = TabsTrayState(
            selectedTabId = expectedTabId,
            normalTabsState = TabsTrayState.NormalTabsState(
                items = listOf(TabsTrayItem.Tab(tab = createTab(id = expectedTabId, url = ""), isFocused = true)),
                tabCount = initialState.tabs.size,
            ),
        )
        val tabFlow = MutableStateFlow(initialState)
        val store = createStore(
            tabDataFlow = tabFlow,
            scope = backgroundScope,
        )

        tabFlow.emit(initialState.copy(selectedTabId = expectedTabId))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN a user moves the focused tab THEN the new index is dispatched`() = runTest {
        val expectedTabId = "1"
        val tabs = listOf(createTab(id = expectedTabId, url = ""), createTab(url = ""), createTab(url = ""), createTab(url = ""))
        val rearrangedTabs = tabs.drop(1) + tabs[0]
        val expectedTabsList = rearrangedTabs.map { TabsTrayItem.Tab(tab = it, isFocused = it.id == expectedTabId) }
        val initialState = TabData(
            selectedTabId = expectedTabId,
            tabs = tabs,
        )
        val expectedState = TabsTrayState(
            selectedTabId = expectedTabId,
            normalTabsState = TabsTrayState.NormalTabsState(
                selectedItemIndex = tabs.size - 1,
                items = expectedTabsList,
                tabCount = tabs.size,
            ),
        )
        val tabFlow = MutableStateFlow(initialState)
        val store = createStore(
            tabDataFlow = tabFlow,
            scope = backgroundScope,
        )

        tabFlow.emit(initialState.copy(tabs = rearrangedTabs))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN the selected tab ID is updated to a normal tab THEN dispatch an update to the selected normal tab index`() = runTest {
        val initialTabId = "1"
        val expectedTabId = "2"
        val tabs = listOf(createTab(id = initialTabId, url = ""), createTab(id = expectedTabId, url = ""))
        val expectedTabs = tabs.map {
            TabsTrayItem.Tab(
                tab = it,
                isFocused = it.id == expectedTabId,
            )
        }
        val initialState = TabData(
            selectedTabId = initialTabId,
            tabs = tabs,
        )
        val expectedState = TabsTrayState(
            selectedTabId = expectedTabId,
            normalTabsState = TabsTrayState.NormalTabsState(
                selectedItemIndex = 1,
                items = expectedTabs,
                tabCount = expectedTabs.size,
            ),
        )
        val tabFlow = MutableStateFlow(initialState)
        val store = createStore(
            tabDataFlow = tabFlow,
            scope = backgroundScope,
        )

        tabFlow.emit(initialState.copy(selectedTabId = expectedTabId))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `GIVEN the tab group feature is enabled WHEN the selected tab ID is updated to a normal tab within a tab group THEN update the selected normal tab index and the group's focus state`() = runTest {
        val initialTabId = "1"
        val expectedTabId = "2"
        val initiallySelectedTab = createTab(id = initialTabId, url = "")
        val groupedTab = createTab(id = expectedTabId, url = "")
        val tabs = listOf(initiallySelectedTab, groupedTab)
        val storedGroup = StoredTabGroup(
            title = "test group",
            theme = "Red",
            lastModified = 0L,
        )
        val expectedGroup = createTabGroup(
            id = storedGroup.id,
            title = storedGroup.title,
            theme = TabGroupTheme.valueOf(storedGroup.theme),
            tabs = mutableListOf(TabsTrayItem.Tab(tab = groupedTab, isFocused = true)),
            isFocused = true,
        )
        val expectedTabList = listOf(
            TabsTrayItem.Tab(initiallySelectedTab),
            expectedGroup,
        )
        val initialState = TabData(
            selectedTabId = initialTabId,
            tabs = tabs,
        )
        val expectedState = TabsTrayState(
            selectedTabId = expectedTabId,
            normalTabsState = TabsTrayState.NormalTabsState(
                selectedItemIndex = 1,
                items = expectedTabList,
                tabCount = expectedGroup.tabs.size + 1,
            ),
            tabGroupState = TabsTrayState.TabGroupState(
                groups = listOf(expectedGroup),
            ),
        )
        val tabFlow = MutableStateFlow(initialState)
        val store = createStore(
            tabDataFlow = tabFlow,
            tabGroupsEnabled = true,
            tabGroupRepository = createRepository(
                tabGroupFlow = MutableStateFlow(listOf(storedGroup)),
                tabGroupAssignmentFlow = MutableStateFlow(mapOf(groupedTab.id to storedGroup.id)),
            ),
            scope = backgroundScope,
        )

        tabFlow.emit(initialState.copy(selectedTabId = expectedTabId))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `GIVEN the tab group feature is disabled WHEN the selected tab ID is updated to a normal tab within a tab group THEN update the selected normal tab index and the group's focus state`() = runTest {
        val initialTabId = "1"
        val expectedTabId = "2"
        val initiallySelectedTab = createTab(id = initialTabId, url = "")
        val groupedTab = createTab(id = expectedTabId, url = "")
        val tabs = listOf(initiallySelectedTab, groupedTab)
        val storedGroup = StoredTabGroup(
            title = "test group",
            theme = "Red",
            lastModified = 0L,
        )
        val expectedTabList = listOf(
            TabsTrayItem.Tab(tab = initiallySelectedTab),
            TabsTrayItem.Tab(tab = groupedTab, isFocused = true),
        )
        val initialState = TabData(
            selectedTabId = initialTabId,
            tabs = tabs,
        )
        val expectedState = TabsTrayState(
            selectedTabId = expectedTabId,
            normalTabsState = TabsTrayState.NormalTabsState(
                selectedItemIndex = 1,
                items = expectedTabList,
                tabCount = expectedTabList.size,
            ),
        )
        val tabFlow = MutableStateFlow(initialState)
        val store = createStore(
            tabDataFlow = tabFlow,
            tabGroupsEnabled = false,
            tabGroupRepository = createRepository(
                tabGroupFlow = MutableStateFlow(listOf(storedGroup)),
                tabGroupAssignmentFlow = MutableStateFlow(mapOf(groupedTab.id to storedGroup.id)),
            ),
            scope = backgroundScope,
        )

        tabFlow.emit(initialState.copy(selectedTabId = expectedTabId))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN the selected tab ID is updated to a private tab THEN dispatch an update to the selected private tab index`() = runTest {
        val initialTabId = "1"
        val expectedTabId = "2"
        val tabs = listOf(
            createTab(id = initialTabId, url = "", private = true),
            createTab(id = expectedTabId, url = "", private = true),
        )
        val expectedTabs = tabs.map {
            TabsTrayItem.Tab(
                tab = it,
                isFocused = it.id == expectedTabId,
            )
        }
        val initialState = TabData(
            selectedTabId = initialTabId,
            tabs = tabs,
        )
        val expectedState = TabsTrayState(
            selectedTabId = expectedTabId,
            privateBrowsing = TabsTrayState.PrivateBrowsingState(
                tabs = expectedTabs,
                selectedItemIndex = 1,
            ),
        )
        val tabFlow = MutableStateFlow(initialState)
        val store = createStore(
            tabDataFlow = tabFlow,
            scope = backgroundScope,
        )

        tabFlow.emit(initialState.copy(selectedTabId = expectedTabId))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN normal tabs has updated THEN transform the data and dispatch an update`() = runTest {
        val expectedTab = createTab("test1")
        val initialState = TabData()
        val expectedState = TabsTrayState(
            selectedTabId = expectedTab.id,
            normalTabsState = TabsTrayState.NormalTabsState(
                items = listOf(TabsTrayItem.Tab(tab = expectedTab, isFocused = true)),
                tabCount = 1,
            ),
        )
        val tabFlow = MutableStateFlow(initialState)
        val store = createStore(
            tabDataFlow = tabFlow,
            scope = backgroundScope,
        )

        tabFlow.emit(initialState.copy(selectedTabId = expectedTab.id, tabs = initialState.tabs + expectedTab))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN inactive tabs has updated THEN transform the data and dispatch an update`() = runTest {
        val expectedTab = createTab("test1", lastAccess = 0L, createdAt = 0L)
        val initialState = TabData()
        val expectedState = TabsTrayState(
            normalTabsState = TabsTrayState.NormalTabsState(
                tabCount = 1,
            ),
            inactiveTabs = TabsTrayState.InactiveTabsState(
                tabs = listOf(
                    TabsTrayItem.Tab(
                        expectedTab,
                    ),
                ),
            ),
        )
        val tabFlow = MutableStateFlow(initialState)
        val store = createStore(
            inactiveTabsEnabled = true,
            tabDataFlow = tabFlow,
            scope = backgroundScope,
        )

        tabFlow.emit(initialState.copy(tabs = initialState.tabs + expectedTab))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN private tabs has updated THEN transform the data and dispatch an update`() = runTest {
        val expectedTab = createTab("test1", private = true)
        val initialState = TabData()
        val expectedState = TabsTrayState(
            selectedTabId = expectedTab.id,
            privateBrowsing = TabsTrayState.PrivateBrowsingState(
                tabs = listOf(TabsTrayItem.Tab(tab = expectedTab, isFocused = true)),
            ),
        )
        val tabFlow = MutableStateFlow(initialState)
        val store = createStore(
            tabDataFlow = tabFlow,
            scope = backgroundScope,
        )

        tabFlow.emit(initialState.copy(selectedTabId = expectedTab.id, tabs = initialState.tabs + expectedTab))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN tab groups have updated THEN transform the data and dispatch an update`() = runTest {
        val expectedTab = createTab("test1")
        val expectedDisplayTab = TabsTrayItem.Tab(expectedTab)
        val initialState = TabData(
            tabs = listOf(expectedTab),
        )
        val tabGroup = StoredTabGroup(
            title = "title",
            theme = "Red",
            lastModified = 0L,
        )
        val expectedTabGroup = TabsTrayItem.TabGroup(
            id = tabGroup.id,
            title = tabGroup.title,
            theme = TabGroupTheme.valueOf(tabGroup.theme),
            tabs = mutableListOf(expectedDisplayTab),
        )
        val expectedState = TabsTrayState(
            normalTabsState = TabsTrayState.NormalTabsState(
                items = listOf(expectedTabGroup),
                tabCount = 1,
            ),
            tabGroupState = TabsTrayState.TabGroupState(
                groups = listOf(expectedTabGroup),
            ),
            config = TabsTrayState.TabsTrayConfig(tabGroupsEnabled = false),
        )
        val tabFlow = MutableStateFlow(initialState)
        val tabGroupFlow = MutableStateFlow(emptyList<StoredTabGroup>())
        val tabGroupAssignmentFlow = MutableStateFlow(emptyMap<String, String>())
        val store = createStore(
            tabGroupsEnabled = true,
            tabDataFlow = tabFlow,
            tabGroupRepository = createRepository(
                tabGroupFlow = tabGroupFlow,
                tabGroupAssignmentFlow = tabGroupAssignmentFlow,
            ),
            scope = backgroundScope,
        )

        tabGroupFlow.emit(listOf(tabGroup))
        tabGroupAssignmentFlow.emit(mapOf(expectedTab.id to tabGroup.id))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `GIVEN the theme from the database is valid WHEN transforming tab group data THEN return the mapped tab group theme`() {
        val expectedTabGroupTheme = TabGroupTheme.Blue
        val middleware = TabStorageMiddleware(
            inactiveTabsEnabled = false,
            tabGroupsEnabled = true,
            tabDataFlow = flowOf(),
            tabGroupRepository = createRepository(),
            removeTabsUseCase = mockk(relaxed = true),
        )
        val actualTheme = with(middleware) {
            expectedTabGroupTheme.name.toTabGroupTheme()
        }

        assertEquals(expectedTabGroupTheme, actualTheme)
    }

    @Test
    fun `GIVEN the theme from the database is invalid WHEN transforming tab group data THEN return the default tab group theme`() {
        val expectedTabGroupTheme = TabGroupTheme.default
        val middleware = TabStorageMiddleware(
            inactiveTabsEnabled = false,
            tabGroupsEnabled = true,
            tabDataFlow = flowOf(),
            tabGroupRepository = createRepository(),
            removeTabsUseCase = mockk(relaxed = true),
        )
        val actualTheme = with(middleware) {
            "Rainbow123".toTabGroupTheme()
        }

        assertEquals(expectedTabGroupTheme, actualTheme)
    }

    @Test
    fun `WHEN save is clicked in multiselect mode for a new group THEN create the group with selected tabs`() = runTest {
        val testFlow = MutableStateFlow(emptyList<StoredTabGroup>())
        val repository = createRepository(testFlow)
        val selectedTabs = setOf(
            createTabsTrayItemTab("https://mozilla.org"),
            createTabsTrayItemTab("https://example.com"),
        )
        val expectedTitle = "Group 1"
        val expectedTheme = TabGroupTheme.Red
        val store = createStore(
            initialState = TabsTrayState(
                mode = Mode.Select(selectedTabs = selectedTabs),
                tabGroupState = TabsTrayState.TabGroupState(
                    formState = TabGroupFormState(
                        name = expectedTitle,
                        tabGroupId = null,
                        theme = expectedTheme,
                    ),
                ),
            ),
            tabGroupRepository = repository,
            dateTimeProvider = fakeDateTimeProvider,
            scope = backgroundScope,
        )

        assertTrue(repository.fetchTabGroups().isEmpty())
        assertTrue(repository.fetchTabGroupAssignments().isEmpty())

        store.dispatch(TabGroupAction.SaveClicked)

        runCurrent()
        advanceUntilIdle()

        assertEquals(1, repository.fetchTabGroups().size)
        val storedGroup = repository.fetchTabGroups().first()
        assertEquals(
            StoredTabGroup(
                id = storedGroup.id,
                title = expectedTitle,
                theme = expectedTheme.name,
                lastModified = fakeDateTimeProvider.currentTimeMillis(),
            ),
            storedGroup,
        )
        assertEquals(
            selectedTabs.associate { it.id to storedGroup.id },
            repository.fetchTabGroupAssignments(),
        )
    }

    @Test
    fun `WHEN save is clicked with no existing tab group id or selected tabs THEN add new tab group`() = runTest {
        val testFlow = MutableStateFlow(emptyList<StoredTabGroup>())
        val repository = createRepository(testFlow)
        val expectedTitle = "Group 1"
        val expectedTheme = TabGroupTheme.Red
        val store = createStore(
            initialState = TabsTrayState(
                tabGroupState = TabsTrayState.TabGroupState(
                    formState = TabGroupFormState(
                        name = expectedTitle,
                        tabGroupId = null,
                        theme = expectedTheme,
                    ),
                ),
            ),
            tabGroupRepository = repository,
            dateTimeProvider = fakeDateTimeProvider,
            scope = backgroundScope,
        )

        assertTrue(repository.fetchTabGroups().isEmpty())
        assertTrue(repository.fetchTabGroupAssignments().isEmpty())

        store.dispatch(TabGroupAction.SaveClicked)

        runCurrent()
        advanceUntilIdle()

        assertEquals(1, repository.fetchTabGroups().size)
        val storedGroup = repository.fetchTabGroups().first()
        assertEquals(
            StoredTabGroup(
                id = storedGroup.id,
                title = expectedTitle,
                theme = expectedTheme.name,
                lastModified = fakeDateTimeProvider.currentTimeMillis(),
            ),
            storedGroup,
        )
        assertTrue(repository.fetchTabGroupAssignments().isEmpty())
    }

    @Test
    fun `WHEN save is clicked with existing tab group id THEN update existing tab group`() = runTest {
        val existingId = "1"
        val expectedTitle = "New name"
        val expectedTheme = TabGroupTheme.Blue
        val existingGroup = StoredTabGroup(
            id = existingId,
            title = "Old name",
            theme = TabGroupTheme.Red.name,
            lastModified = 0L,
        )
        val testFlow = MutableStateFlow(listOf(existingGroup))
        val repository = createRepository(testFlow)
        val store = createStore(
            initialState = TabsTrayState(
                tabGroupState = TabsTrayState.TabGroupState(
                    formState = TabGroupFormState(
                        tabGroupId = existingId,
                        name = expectedTitle,
                        theme = expectedTheme,
                    ),
                ),
            ),
            tabGroupRepository = repository,
            dateTimeProvider = fakeDateTimeProvider,
            scope = backgroundScope,
        )

        assertEquals(listOf(existingGroup), repository.fetchTabGroups())

        store.dispatch(TabGroupAction.SaveClicked)

        runCurrent()
        advanceUntilIdle()

        assertEquals(
            listOf(
                StoredTabGroup(
                    id = existingId,
                    title = expectedTitle,
                    theme = expectedTheme.name,
                    lastModified = fakeDateTimeProvider.currentTimeMillis(),
                ),
            ),
            repository.fetchTabGroups(),
        )
        assertTrue(repository.fetchTabGroupAssignments().isEmpty())
    }

    @Test
    fun `WHEN save is clicked with no form state THEN no tab group writes occur`() = runTest {
        val repository = createRepository()
        val store = createStore(
            initialState = TabsTrayState(),
            tabGroupRepository = repository,
            scope = backgroundScope,
        )

        store.dispatch(TabGroupAction.SaveClicked)

        runCurrent()
        advanceUntilIdle()

        assertTrue(repository.fetchTabGroups().isEmpty())
        assertTrue(repository.fetchTabGroupAssignments().isEmpty())
    }

    @Test
    fun `WHEN tab group delete is confirmed THEN remove the tab group and its tabs`() = runTest {
        val browserStore = BrowserStore()
        val removeTabsUseCase = TabsUseCases(store = browserStore).removeTabs

        val firstTab = createTab("https://mozilla.org")
        browserStore.dispatch(TabListAction.AddTabAction(firstTab))

        val secondTab = createTab("https://example.com")
        browserStore.dispatch(TabListAction.AddTabAction(secondTab))

        val title = "Group 1"
        val theme = TabGroupTheme.Red
        val storedGroup = StoredTabGroup(
            title = title,
            theme = theme.name,
            lastModified = 0L,
        )

        val repository = FakeTabGroupRepository(
            tabGroupFlow = MutableStateFlow(listOf(storedGroup)),
        )
        val store = createStore(
            tabGroupRepository = repository,
            removeTabsUseCase = removeTabsUseCase,
            scope = backgroundScope,
        )

        val group = TabsTrayItem.TabGroup(
            id = storedGroup.id,
            title = title,
            theme = theme,
            tabs = mutableListOf(
                TabsTrayItem.Tab(firstTab),
                TabsTrayItem.Tab(secondTab),
            ),
        )

        assertEquals(listOf(storedGroup), repository.fetchTabGroups())
        assertEquals(2, browserStore.state.tabs.size)

        store.dispatch(TabGroupAction.DeleteConfirmed(group))

        runCurrent()
        advanceUntilIdle()

        assertTrue(repository.fetchTabGroups().isEmpty())
        assertTrue(browserStore.state.tabs.isEmpty())
    }

    @Test
    fun `GIVEN multiple tab groups exist WHEN delete is confirmed THEN remove the correct tab group`() = runTest {
        val tabGroup1 = StoredTabGroup(
            title = "Tab Group 1",
            theme = TabGroupTheme.Red.name,
            lastModified = 0L,
        )
        val tabGroup2 = StoredTabGroup(
            title = "Tab Group 2",
            theme = TabGroupTheme.Blue.name,
            lastModified = 1L,
        )
        val repository = FakeTabGroupRepository(
            tabGroupFlow = MutableStateFlow(listOf(tabGroup1, tabGroup2)),
        )
        val store = createStore(
            tabGroupRepository = repository,
            scope = backgroundScope,
        )

        assertEquals(listOf(tabGroup1, tabGroup2), repository.fetchTabGroups())

        store.dispatch(
            TabGroupAction.DeleteConfirmed(
                group = TabsTrayItem.TabGroup(
                    id = tabGroup1.id,
                    title = tabGroup1.title,
                    theme = TabGroupTheme.Red,
                    tabs = mutableListOf(),
                ),
            ),
        )

        runCurrent()
        advanceUntilIdle()

        assertEquals(listOf(tabGroup2), repository.fetchTabGroups())
    }

    @Test
    fun `Given the tab groups feature is disabled WHEN initializing THEN the tab group data is not emitted`() = runTest {
        val expectedTab = createTab("test1")
        val initialState = TabData(
            tabs = listOf(expectedTab),
        )
        val expectedTabGroup = StoredTabGroup(
            title = "title",
            theme = "Red",
            lastModified = 0L,
        )
        val expectedState = TabsTrayState(
            normalTabsState = TabsTrayState.NormalTabsState(
                items = listOf(TabsTrayItem.Tab(expectedTab)),
                tabCount = initialState.tabs.size,
            ),
        )
        val tabFlow = MutableStateFlow(initialState)
        val tabGroupFlow = MutableStateFlow(listOf(expectedTabGroup))
        val tabGroupAssignmentFlow = MutableStateFlow(mapOf(expectedTab.id to expectedTabGroup.id))
        val store = createStore(
            tabGroupsEnabled = false,
            tabDataFlow = tabFlow,
            tabGroupRepository = createRepository(
                tabGroupFlow = tabGroupFlow,
                tabGroupAssignmentFlow = tabGroupAssignmentFlow,
            ),
            scope = backgroundScope,
        )

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `GIVEN the user has selected tabs WHEN adding tabs to an existing group THEN the selected tabs are added to the specified group`() = runTest {
        val tabs = MutableList(size = 10) { createTab(url = "") }
        val selectedTabs = MutableList(size = 10) { TabsTrayItem.Tab(tabs[it]) }
        val tabData = TabData(tabs = tabs)
        val existingGroup = StoredTabGroup(
            title = "Name",
            theme = TabGroupTheme.Red.name,
            lastModified = 0L,
        )
        val store = createStore(
            initialState = TabsTrayState(
                mode = Mode.Select(selectedTabs = selectedTabs.toSet()),
            ),
            tabGroupsEnabled = true,
            tabDataFlow = flowOf(tabData),
            tabGroupRepository = createRepository(tabGroupFlow = MutableStateFlow(listOf(existingGroup))),
            scope = backgroundScope,
        )
        val expectedTabGroupList = listOf(
            createTabGroup(
                id = existingGroup.id,
                title = existingGroup.title,
                theme = TabGroupTheme.Red,
                tabs = selectedTabs,
            ),
        )
        val expectedState = TabsTrayState(
            mode = Mode.Normal,
            normalTabsState = TabsTrayState.NormalTabsState(
                items = expectedTabGroupList,
                tabCount = selectedTabs.size,
            ),
            tabGroupState = TabsTrayState.TabGroupState(
                groups = expectedTabGroupList,
            ),
        )

        store.dispatch(TabGroupAction.TabsAddedToGroup(groupId = existingGroup.id))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `GIVEN the user has selected 10 ungrouped tabs and 3 tab groups WHEN adding tabs to an existing group THEN the selected tabs are added to the specified group and the selected groups are deleted`() = runTest {
        val existingId = "12345"
        val tabs = MutableList(size = 40) { createTab(url = "") }
        val selectedTabs = MutableList(size = 40) { TabsTrayItem.Tab(tabs[it]) }
        val tabData = TabData(tabs = tabs)
        val destinationTabGroup = StoredTabGroup(
            id = existingId,
            title = "Name",
            theme = TabGroupTheme.Red.name,
            lastModified = 0L,
        )
        val tabGroups = List(size = 3) {
            StoredTabGroup(
                title = "Group $it",
                theme = TabGroupTheme.Red.name,
                lastModified = 0L,
            )
        }
        val selectedTabGroups = tabGroups.map {
            createTabGroup(
                id = it.id,
                title = it.title,
                theme = TabGroupTheme.valueOf(it.theme),
            )
        }
        // Assign tabs to the 3 multi-selected groups
        selectedTabGroups[0].tabs.addAll(selectedTabs.subList(10, 20))
        selectedTabGroups[1].tabs.addAll(selectedTabs.subList(20, 30))
        selectedTabGroups[2].tabs.addAll(selectedTabs.subList(30, 40))
        val initialTabAssignments = hashMapOf<String, String>()
        selectedTabGroups.forEach { group ->
            group.tabs.forEach { tab ->
                initialTabAssignments[tab.id] = group.id
            }
        }
        val store = createStore(
            initialState = TabsTrayState(
                mode = Mode.Select(
                    selectedTabs = selectedTabs.toSet(),
                    selectedTabGroups = selectedTabGroups.toSet(),
                ),
            ),
            tabGroupsEnabled = true,
            tabDataFlow = flowOf(tabData),
            tabGroupRepository = createRepository(
                tabGroupFlow = MutableStateFlow(tabGroups + destinationTabGroup),
                tabGroupAssignmentFlow = MutableStateFlow(initialTabAssignments),
            ),
            scope = backgroundScope,
        )
        val expectedTabGroupList = listOf(
            createTabGroup(
                id = destinationTabGroup.id,
                title = destinationTabGroup.title,
                theme = TabGroupTheme.Red,
                tabs = selectedTabs,
            ),
        )
        val expectedState = TabsTrayState(
            mode = Mode.Normal,
            normalTabsState = TabsTrayState.NormalTabsState(
                items = expectedTabGroupList,
                tabCount = tabs.size,
            ),
            tabGroupState = TabsTrayState.TabGroupState(
                groups = expectedTabGroupList,
            ),
        )

        store.dispatch(TabGroupAction.TabsAddedToGroup(groupId = existingId))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `GIVEN the user has at least one tab and one tab group WHEN the user adds a tab to an existing tab group THEN the tab is added to the specified group`() = runTest {
        val tab = createTab(url = "")
        val tabData = TabData(tabs = listOf(tab))
        val existingGroup = StoredTabGroup(
            title = "Name",
            theme = TabGroupTheme.Red.name,
            lastModified = 0L,
        )
        val store = createStore(
            tabGroupsEnabled = true,
            tabDataFlow = flowOf(tabData),
            tabGroupRepository = createRepository(tabGroupFlow = MutableStateFlow(listOf(existingGroup))),
            scope = backgroundScope,
        )
        val expectedTabGroupList = listOf(
            createTabGroup(
                id = existingGroup.id,
                title = existingGroup.title,
                theme = TabGroupTheme.Red,
                tabs = mutableListOf(TabsTrayItem.Tab(tab)),
            ),
        )
        val expectedState = TabsTrayState(
            normalTabsState = TabsTrayState.NormalTabsState(
                items = expectedTabGroupList,
                tabCount = 1,
            ),
            tabGroupState = TabsTrayState.TabGroupState(
                groups = expectedTabGroupList,
            ),
        )

        store.dispatch(TabGroupAction.TabAddedToGroup(tabId = tab.id, groupId = existingGroup.id))

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `GIVEN the next focused tab is outside of a group WHEN the the use closes a grouped focused tab THEN the selected item points to the ungrouped tab`() = runTest {
        val initialTabId = "1"
        val expectedTabId = "2"
        val groupedTab = createTab(id = initialTabId, url = "")
        val nextSelectedTab = createTab(id = expectedTabId, url = "")
        val tabs = listOf(nextSelectedTab, groupedTab)
        val storedGroup = StoredTabGroup(
            title = "test group",
            theme = "Red",
            lastModified = 0L,
        )
        val expectedGroup = createTabGroup(
            id = storedGroup.id,
            title = storedGroup.title,
            theme = TabGroupTheme.valueOf(storedGroup.theme),
            tabs = mutableListOf(),
            isFocused = false,
        )
        val expectedTabList = listOf(
            TabsTrayItem.Tab(tab = nextSelectedTab, isFocused = true),
        )
        val initialState = TabData(
            selectedTabId = initialTabId,
            tabs = tabs,
        )
        val expectedState = TabsTrayState(
            selectedTabId = expectedTabId,
            normalTabsState = TabsTrayState.NormalTabsState(
                selectedItemIndex = 0,
                items = expectedTabList,
                tabCount = tabs.size - 1,
            ),
            tabGroupState = TabsTrayState.TabGroupState(
                groups = listOf(expectedGroup),
            ),
        )
        val tabGroupRepository = createRepository(
            tabGroupFlow = MutableStateFlow(listOf(storedGroup)),
            tabGroupAssignmentFlow = MutableStateFlow(mapOf(groupedTab.id to storedGroup.id)),
        )
        val tabFlow = MutableStateFlow(initialState)
        val store = createStore(
            tabDataFlow = tabFlow,
            tabGroupsEnabled = true,
            tabGroupRepository = tabGroupRepository,
            scope = backgroundScope,
        )

        tabFlow.emit(TabData(tabs = listOf(nextSelectedTab), selectedTabId = expectedTabId))
        tabGroupRepository.deleteTabGroupAssignmentById(tabId = groupedTab.id)

        runCurrent()
        advanceUntilIdle()

        assertEquals(expectedState, store.state)
    }

    private fun createStore(
        initialState: TabsTrayState = TabsTrayState(),
        inactiveTabsEnabled: Boolean = false,
        tabGroupsEnabled: Boolean = false,
        tabDataFlow: Flow<TabData> = flowOf(),
        tabGroupRepository: TabGroupRepository = createRepository(),
        removeTabsUseCase: RemoveTabsUseCase = TabsUseCases(store = BrowserStore()).removeTabs,
        dateTimeProvider: DateTimeProvider = fakeDateTimeProvider,
        scope: CoroutineScope,
    ) = TabsTrayStore(
        initialState = initialState,
        middlewares = listOf(
            TabStorageMiddleware(
                inactiveTabsEnabled = inactiveTabsEnabled,
                tabGroupsEnabled = tabGroupsEnabled,
                tabDataFlow = tabDataFlow,
                tabGroupRepository = tabGroupRepository,
                removeTabsUseCase = removeTabsUseCase,
                dateTimeProvider = dateTimeProvider,
                scope = scope,
                mainScope = scope,
            ),
        ),
    )

    private fun createRepository(
        tabGroupFlow: MutableStateFlow<List<StoredTabGroup>> = MutableStateFlow(emptyList()),
        tabGroupAssignmentFlow: MutableStateFlow<Map<String, String>> = MutableStateFlow(mapOf()),
    ) = FakeTabGroupRepository(
        tabGroupFlow = tabGroupFlow,
        tabGroupAssignmentFlow = tabGroupAssignmentFlow,
    )
}
