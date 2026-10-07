/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabdata.coordinator

import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mozilla.components.feature.tabdata.coordinator.data.Tab
import mozilla.components.feature.tabdata.coordinator.data.TabGroup
import mozilla.components.feature.tabdata.coordinator.data.TabsSnapshot
import mozilla.components.feature.tabdata.coordinator.fakes.FakeTabRepository
import mozilla.components.feature.tabdata.coordinator.repository.TabRepository
import mozilla.components.feature.tabgroups.storage.data.TabGroup as StoredTabGroup
import mozilla.components.feature.tabgroups.storage.data.TabGroupData
import mozilla.components.feature.tabgroups.storage.fakes.FakeTabGroupRepository
import mozilla.components.feature.tabgroups.storage.repository.TabGroupRepository
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultTabDataCoordinatorTest {

    @Test
    fun `WHEN the coordinator has not been initialized THEN the tabs state is null`() = runTest {
        val coordinator = createCoordinator(tabRepository = createTabRepository(tabs = listOf(createTab(id = "1"))))

        runCurrent()

        assertNull(coordinator.tabsSnapshot.value)
    }

    @Test
    fun `WHEN the coordinator is initialized THEN the tabs state is emitted`() = runTest {
        val tab = createTab(id = "1")
        val coordinator =
            createCoordinator(tabRepository = createTabRepository(selectedTabId = "1", tabs = listOf(tab)))

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected = TabsSnapshot(selectedTab = tab, normalTabs = listOf(tab), browsableNormalTabs = listOf(tab)),
            actual = coordinator.tabsSnapshot.value,
        )
    }

    @Test
    fun `WHEN a tab is private THEN it is sorted into the private tabs`() = runTest {
        val normalTab = createTab(id = "1")
        val privateTab = createTab(id = "2", private = true)
        val coordinator = createCoordinator(tabRepository = createTabRepository(tabs = listOf(normalTab, privateTab)))

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected =
                TabsSnapshot(
                    normalTabs = listOf(normalTab),
                    browsableNormalTabs = listOf(normalTab),
                    privateTabs = listOf(privateTab),
                ),
            actual = coordinator.tabsSnapshot.value,
        )
    }

    @Test
    fun `GIVEN a private tab is selected THEN it is the selected tab`() = runTest {
        val normalTab = createTab(id = "1")
        val privateTab = createTab(id = "2", private = true)
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(selectedTabId = privateTab.id, tabs = listOf(normalTab, privateTab))
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected =
                TabsSnapshot(
                    selectedTab = privateTab,
                    normalTabs = listOf(normalTab),
                    browsableNormalTabs = listOf(normalTab),
                    privateTabs = listOf(privateTab),
                ),
            actual = coordinator.tabsSnapshot.value,
        )
    }

    @Test
    fun `GIVEN inactive tabs are enabled WHEN a tab is inactive THEN it is sorted into the inactive tabs`() = runTest {
        val normalTab = createTab(id = "1")
        val inactiveTab = createTab(id = "2", inactive = true)
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(normalTab, inactiveTab)),
                isInactiveTabsEnabled = { true },
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected =
                TabsSnapshot(
                    normalTabs = listOf(normalTab, inactiveTab),
                    browsableNormalTabs = listOf(normalTab),
                    inactiveTabs = listOf(inactiveTab),
                    inactiveTabsEnabled = true,
                ),
            actual = coordinator.tabsSnapshot.value,
        )
    }

    @Test
    fun `GIVEN inactive tabs are disabled WHEN a tab is inactive THEN it is a browsable normal tab`() = runTest {
        val normalTab = createTab(id = "1")
        val inactiveTab = createTab(id = "2", inactive = true)
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(normalTab, inactiveTab)),
                isInactiveTabsEnabled = { false },
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected =
                TabsSnapshot(
                    normalTabs = listOf(normalTab, inactiveTab),
                    browsableNormalTabs = listOf(normalTab, inactiveTab),
                    inactiveTabs = emptyList(),
                    inactiveTabsEnabled = false,
                ),
            actual = coordinator.tabsSnapshot.value,
        )
    }

    @Test
    fun `WHEN a tab is assigned to a group THEN the tab group ID is resolved onto the tab`() = runTest {
        val groupedTab = createTab(id = "1")
        val ungroupedTab = createTab(id = "2")
        val group = createStoredTabGroup(id = "group-1", tabIds = listOf(groupedTab.id))
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(groupedTab, ungroupedTab)),
                tabGroupRepository =
                    createTabGroupRepository(
                        tabGroups = listOf(group),
                        tabGroupAssignments = mapOf(groupedTab.id to group.id),
                    ),
            )

        coordinator.initialize()
        runCurrent()

        val expectedGroupedTab = groupedTab.copy(tabGroupId = group.id)
        assertEquals(
            expected =
                TabsSnapshot(
                    normalTabs = listOf(expectedGroupedTab, ungroupedTab),
                    browsableNormalTabs = listOf(expectedGroupedTab, ungroupedTab),
                    tabGroups = listOf(createTabGroup(id = group.id, tabIds = group.tabIds)),
                    openTabGroups = listOf(createTabGroup(id = group.id, tabIds = group.tabIds)),
                ),
            actual = coordinator.tabsSnapshot.value,
        )
    }

    @Test
    fun `GIVEN a grouped tab is selected THEN the selected tab has its tab group ID`() = runTest {
        val groupedTab = createTab(id = "1")
        val group = createStoredTabGroup(id = "group-1", tabIds = listOf(groupedTab.id))
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(selectedTabId = groupedTab.id, tabs = listOf(groupedTab)),
                tabGroupRepository =
                    createTabGroupRepository(
                        tabGroups = listOf(group),
                        tabGroupAssignments = mapOf(groupedTab.id to group.id),
                    ),
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected = groupedTab.copy(tabGroupId = group.id),
            actual = coordinator.tabsSnapshot.value?.selectedTab,
        )
    }

    @Test
    fun `GIVEN a tab group references a tab that no longer exists THEN the tab group excludes that tab ID`() = runTest {
        val existingTab = createTab(id = "1")
        val staleTabId = "stale-tab"
        val group = createStoredTabGroup(id = "group-1", tabIds = listOf(existingTab.id, staleTabId))
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(existingTab)),
                tabGroupRepository =
                    createTabGroupRepository(
                        tabGroups = listOf(group),
                        tabGroupAssignments = mapOf(existingTab.id to group.id),
                    ),
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected = listOf(existingTab.id),
            actual = coordinator.tabsSnapshot.value?.tabGroups?.single()?.tabIds,
        )
    }

    @Test
    fun `GIVEN a tab group's tab IDs all no longer exist THEN the tab group has an empty tabIds list`() = runTest {
        val group = createStoredTabGroup(id = "group-1", tabIds = listOf("stale-1", "stale-2"))
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(createTab(id = "1"))),
                tabGroupRepository = createTabGroupRepository(tabGroups = listOf(group)),
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected = emptyList<String>(),
            actual = coordinator.tabsSnapshot.value?.tabGroups?.single()?.tabIds,
        )
    }

    @Test
    fun `GIVEN a tab group is closed WHEN a tab belongs to it THEN it is not a browsable normal tab`() = runTest {
        val groupedTab = createTab(id = "1")
        val ungroupedTab = createTab(id = "2")
        val group = createStoredTabGroup(id = "group-1", closed = true, tabIds = listOf(groupedTab.id))
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(groupedTab, ungroupedTab)),
                tabGroupRepository =
                    createTabGroupRepository(
                        tabGroups = listOf(group),
                        tabGroupAssignments = mapOf(groupedTab.id to group.id),
                    ),
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected =
                TabsSnapshot(
                    normalTabs = listOf(groupedTab.copy(tabGroupId = group.id), ungroupedTab),
                    browsableNormalTabs = listOf(ungroupedTab),
                    tabGroups = listOf(createTabGroup(id = group.id, closed = true, tabIds = group.tabIds)),
                ),
            actual = coordinator.tabsSnapshot.value,
        )
    }

    @Test
    fun `GIVEN tab groups are disabled WHEN a tab is grouped THEN the group data is ignored`() = runTest {
        val groupedTab = createTab(id = "1")
        val group = createStoredTabGroup(id = "group-1", closed = true, tabIds = listOf(groupedTab.id))
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(groupedTab)),
                tabGroupRepository =
                    createTabGroupRepository(
                        tabGroups = listOf(group),
                        tabGroupAssignments = mapOf(groupedTab.id to group.id),
                    ),
                isTabGroupsEnabled = { false },
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected =
                TabsSnapshot(
                    normalTabs = listOf(groupedTab),
                    browsableNormalTabs = listOf(groupedTab),
                    tabGroupsEnabled = false,
                    tabGroups = emptyList(),
                ),
            actual = coordinator.tabsSnapshot.value,
        )
    }

    @Test
    fun `GIVEN tab groups are disabled THEN the tabs in closed groups are browsable`() = runTest {
        val groupedTab = createTab(id = "1")
        val group = createStoredTabGroup(id = "group-1", closed = true, tabIds = listOf(groupedTab.id))
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(groupedTab)),
                tabGroupRepository =
                    createTabGroupRepository(
                        tabGroups = listOf(group),
                        tabGroupAssignments = mapOf(groupedTab.id to group.id),
                    ),
                isTabGroupsEnabled = { false },
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected = listOf(groupedTab),
            actual = coordinator.tabsSnapshot.value?.browsableNormalTabs,
        )
    }

    @Test
    fun `GIVEN tab groups are enabled THEN the tabs in closed groups are not browsable`() = runTest {
        val groupedTab = createTab(id = "1")
        val group = createStoredTabGroup(id = "group-1", closed = true, tabIds = listOf(groupedTab.id))
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(groupedTab)),
                tabGroupRepository =
                    createTabGroupRepository(
                        tabGroups = listOf(group),
                        tabGroupAssignments = mapOf(groupedTab.id to group.id),
                    ),
                isTabGroupsEnabled = { true },
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected = emptyList<Tab>(),
            actual = coordinator.tabsSnapshot.value?.browsableNormalTabs,
        )
    }

    @Test
    fun `GIVEN an inactive tab is in an open tab group THEN its ID still appears in the tab group`() = runTest {
        val inactiveTab = createTab(id = "1", inactive = true)
        val group = createStoredTabGroup(id = "group-1", tabIds = listOf(inactiveTab.id))
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(inactiveTab)),
                tabGroupRepository =
                    createTabGroupRepository(
                        tabGroups = listOf(group),
                        tabGroupAssignments = mapOf(inactiveTab.id to group.id),
                    ),
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected = listOf(inactiveTab.id),
            actual = coordinator.tabsSnapshot.value?.tabGroups?.single()?.tabIds,
        )
    }

    @Test
    fun `GIVEN an inactive tab is in a closed tab group THEN its ID still appears in the tab group`() = runTest {
        val inactiveTab = createTab(id = "1", inactive = true)
        val group = createStoredTabGroup(id = "group-1", closed = true, tabIds = listOf(inactiveTab.id))
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(inactiveTab)),
                tabGroupRepository =
                    createTabGroupRepository(
                        tabGroups = listOf(group),
                        tabGroupAssignments = mapOf(inactiveTab.id to group.id),
                    ),
            )

        coordinator.initialize()
        runCurrent()

        assertEquals(
            expected = listOf(inactiveTab.id),
            actual = coordinator.tabsSnapshot.value?.tabGroups?.single()?.tabIds,
        )
    }

    @Test
    fun `GIVEN an inactive tab is in an open or closed tab group THEN it still appears in the inactive tabs`() =
        runTest {
            val openGroupTab = createTab(id = "1", inactive = true)
            val closedGroupTab = createTab(id = "2", inactive = true)
            val openGroup = createStoredTabGroup(id = "open-group", tabIds = listOf(openGroupTab.id))
            val closedGroup =
                createStoredTabGroup(id = "closed-group", closed = true, tabIds = listOf(closedGroupTab.id))
            val coordinator =
                createCoordinator(
                    tabRepository = createTabRepository(tabs = listOf(openGroupTab, closedGroupTab)),
                    tabGroupRepository =
                        createTabGroupRepository(
                            tabGroups = listOf(openGroup, closedGroup),
                            tabGroupAssignments =
                                mapOf(openGroupTab.id to openGroup.id, closedGroupTab.id to closedGroup.id),
                        ),
                )

            coordinator.initialize()
            runCurrent()

            val expectedOpenGroupTab = openGroupTab.copy(tabGroupId = openGroup.id)
            val expectedClosedGroupTab = closedGroupTab.copy(tabGroupId = closedGroup.id)
            assertEquals(
                expected = listOf(expectedOpenGroupTab, expectedClosedGroupTab),
                actual = coordinator.tabsSnapshot.value?.inactiveTabs,
            )
        }

    @Test
    fun `WHEN the tab repository emits new data THEN the tabs state is updated`() = runTest {
        val tab = createTab(id = "1")
        val addedTab = createTab(id = "2")
        val tabRepository = createTabRepository(selectedTabId = tab.id, tabs = listOf(tab))
        val coordinator = createCoordinator(tabRepository = tabRepository)

        coordinator.initialize()
        runCurrent()

        tabRepository.update { data -> data.copy(tabs = data.tabs + addedTab) }
        runCurrent()

        assertEquals(
            expected =
                TabsSnapshot(
                    selectedTab = tab,
                    normalTabs = listOf(tab, addedTab),
                    browsableNormalTabs = listOf(tab, addedTab),
                ),
            actual = coordinator.tabsSnapshot.value,
        )
    }

    @Test
    fun `WHEN the tab group repository emits new data THEN the tabs state is updated`() = runTest {
        val tab = createTab(id = "1")
        val group = createStoredTabGroup(id = "group-1", tabIds = listOf(tab.id))
        val tabGroupRepository = createTabGroupRepository()
        val coordinator =
            createCoordinator(
                tabRepository = createTabRepository(tabs = listOf(tab)),
                tabGroupRepository = tabGroupRepository,
            )

        coordinator.initialize()
        runCurrent()

        tabGroupRepository.createTabGroupWithTabs(tabGroup = group)
        runCurrent()

        val expectedTab = tab.copy(tabGroupId = group.id)
        assertEquals(
            expected =
                TabsSnapshot(
                    normalTabs = listOf(expectedTab),
                    browsableNormalTabs = listOf(expectedTab),
                    tabGroups = listOf(createTabGroup(id = group.id, tabIds = group.tabIds)),
                    openTabGroups = listOf(createTabGroup(id = group.id, tabIds = group.tabIds)),
                ),
            actual = coordinator.tabsSnapshot.value,
        )
    }

    private fun TestScope.createCoordinator(
        tabRepository: TabRepository = createTabRepository(),
        tabGroupRepository: TabGroupRepository = createTabGroupRepository(),
        isInactiveTabsEnabled: () -> Boolean = { true },
        isTabGroupsEnabled: () -> Boolean = { true },
    ): DefaultTabDataCoordinator =
        DefaultTabDataCoordinator(
            tabRepository = tabRepository,
            tabGroupRepository = tabGroupRepository,
            isInactiveTabsEnabled = isInactiveTabsEnabled,
            isTabGroupsEnabled = isTabGroupsEnabled,
            scope = backgroundScope,
            dispatcher = StandardTestDispatcher(testScheduler),
        )

    private fun createTabRepository(
        selectedTabId: String? = null,
        tabs: List<Tab> = emptyList(),
    ): FakeTabRepository =
        FakeTabRepository(initialData = TabRepository.Data(selectedTabId = selectedTabId, tabs = tabs))

    private fun createTabGroupRepository(
        tabGroups: List<StoredTabGroup> = emptyList(),
        tabGroupAssignments: Map<String, String> = emptyMap(),
    ): FakeTabGroupRepository =
        FakeTabGroupRepository(
            initialTabGroupData = TabGroupData(tabGroups = tabGroups, tabGroupAssignments = tabGroupAssignments)
        )

    private fun createTab(
        id: String,
        private: Boolean = false,
        inactive: Boolean = false,
    ): Tab =
        Tab(
            id = id,
            url = "https://www.mozilla.org/$id",
            title = "Tab $id",
            private = private,
            inactive = inactive,
        )

    private fun createStoredTabGroup(
        id: String,
        closed: Boolean = false,
        tabIds: List<String> = emptyList(),
    ): StoredTabGroup =
        StoredTabGroup(
            id = id,
            title = "Group $id",
            theme = "theme",
            closed = closed,
            lastModified = 0L,
            tabIds = tabIds,
        )

    private fun createTabGroup(
        id: String,
        closed: Boolean = false,
        tabIds: List<String> = emptyList(),
    ): TabGroup =
        TabGroup(
            id = id,
            title = "Group $id",
            theme = "theme",
            closed = closed,
            lastModified = 0L,
            tabIds = tabIds,
        )
}
