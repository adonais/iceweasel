/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.data

import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import mozilla.components.feature.tabdata.coordinator.data.Tab
import mozilla.components.feature.tabdata.coordinator.data.TabGroup
import mozilla.components.feature.tabdata.coordinator.data.TabsSnapshot
import org.junit.Test

class TabsSnapshotMapperTest {

    @Test
    fun `WHEN there is no tab data THEN the update is empty`() {
        val update = TabsSnapshot().toTabStorageUpdate()

        assertNull(update.selectedTabId)
        assertEquals(expected = emptyList(), actual = update.normalItems)
        assertEquals(expected = 0, actual = update.normalTabCount)
        assertEquals(expected = emptyList(), actual = update.inactiveTabs)
        assertEquals(expected = emptyList(), actual = update.privateTabs)
        assertEquals(expected = emptyList(), actual = update.tabGroups)
    }

    @Test
    fun `WHEN a tab is mapped THEN all of its displayable data is carried over`() {
        val tab = createTab(id = "1", lastAccess = 100L, isMediaActive = true)
        val update = createSnapshot(normalTabs = listOf(tab), selectedTab = tab).toTabStorageUpdate()

        assertEquals(
            expected =
                TabsTrayItem.Tab(
                    id = "1",
                    url = tab.url,
                    title = tab.title,
                    inactive = false,
                    private = false,
                    icon = null,
                    isMediaActive = true,
                    lastAccess = 100L,
                    isFocused = true,
                ),
            actual = update.normalItems.single(),
        )
    }

    @Test
    fun `WHEN a grouped tab is playing media THEN its group has active media`() {
        val group = createTabGroup(id = "group-1")
        val update =
            createSnapshot(
                    normalTabs =
                        listOf(
                            createTab(id = "1", tabGroupId = group.id),
                            createTab(id = "2", tabGroupId = group.id, isMediaActive = true),
                        ),
                    tabGroups = listOf(group),
                )
                .toTabStorageUpdate()

        assertTrue { update.tabGroups.single().isMediaActive }
    }

    @Test
    fun `WHEN tabs are mapped THEN the normal and private tabs are separated`() {
        val normalTab = createTab(id = "1")
        val privateTab = createTab(id = "2", private = true)
        val update =
            createSnapshot(normalTabs = listOf(normalTab), privateTabs = listOf(privateTab)).toTabStorageUpdate()

        assertEquals(expected = listOf("1"), actual = update.normalItems.map { it.id })
        assertEquals(expected = listOf("2"), actual = update.privateTabs.map { it.id })
        assertEquals(expected = 1, actual = update.normalTabCount)
    }

    @Test
    fun `WHEN a tab is selected THEN it is focused and its page index is reported`() {
        val selectedNormalTab = createTab(id = "2")
        val selectedPrivateTab = createTab(id = "5", private = true)
        val normalUpdate =
            createSnapshot(
                    normalTabs = listOf(createTab(id = "1"), selectedNormalTab, createTab(id = "3")),
                    selectedTab = selectedNormalTab,
                )
                .toTabStorageUpdate()
        val privateUpdate =
            createSnapshot(
                    privateTabs = listOf(createTab(id = "4", private = true), selectedPrivateTab),
                    selectedTab = selectedPrivateTab,
                )
                .toTabStorageUpdate()

        assertEquals(expected = "2", actual = normalUpdate.selectedTabId)
        assertEquals(expected = 1, actual = normalUpdate.selectedNormalItemIndex)
        assertTrue { normalUpdate.normalItems[1].isFocused }
        assertEquals(expected = 1, actual = privateUpdate.selectedPrivateItemIndex)
        assertTrue { privateUpdate.privateTabs[1].isFocused }
    }

    @Test
    fun `WHEN no tab is selected THEN the page indices default to the first item`() {
        val update =
            createSnapshot(
                    normalTabs = listOf(createTab(id = "1")),
                    privateTabs = listOf(createTab(id = "2", private = true)),
                )
                .toTabStorageUpdate()

        assertEquals(expected = 0, actual = update.selectedNormalItemIndex)
        assertEquals(expected = 0, actual = update.selectedPrivateItemIndex)
    }

    @Test
    fun `GIVEN inactive tabs are enabled WHEN a tab is inactive THEN it is not a normal item`() {
        val update =
            createSnapshot(
                    normalTabs = listOf(createTab(id = "1"), createTab(id = "2", inactive = true)),
                    inactiveTabsEnabled = true,
                )
                .toTabStorageUpdate()

        assertEquals(expected = listOf("1"), actual = update.normalItems.map { it.id })
        assertEquals(expected = listOf("2"), actual = update.inactiveTabs.map { it.id })
        assertEquals(expected = 1, actual = update.normalTabCount)
    }

    @Test
    fun `GIVEN inactive tabs are disabled WHEN a tab is inactive THEN it is a normal item`() {
        val update =
            createSnapshot(
                    normalTabs = listOf(createTab(id = "1"), createTab(id = "2", inactive = true)),
                    inactiveTabsEnabled = false,
                )
                .toTabStorageUpdate()

        assertEquals(expected = listOf("1", "2"), actual = update.normalItems.map { it.id })
        assertEquals(expected = emptyList(), actual = update.inactiveTabs)
        assertEquals(expected = 2, actual = update.normalTabCount)
    }

    @Test
    fun `GIVEN a tab is grouped WHEN it is inactive THEN it is displayed in its group`() {
        val group = createTabGroup(id = "group-1")
        val update =
            createSnapshot(
                    normalTabs =
                        listOf(
                            createTab(id = "1", tabGroupId = group.id),
                            createTab(id = "2", inactive = true, tabGroupId = group.id),
                        ),
                    tabGroups = listOf(group),
                    inactiveTabsEnabled = true,
                )
                .toTabStorageUpdate()

        assertEquals(expected = emptyList(), actual = update.inactiveTabs)
        assertEquals(expected = listOf("1", "2"), actual = update.tabGroups.single().tabs.map { it.id })
        assertEquals(expected = 2, actual = update.normalTabCount)
    }

    @Test
    fun `WHEN tabs are grouped THEN the group takes the place of its first tab`() {
        val group = createTabGroup(id = "group-1")
        val update =
            createSnapshot(
                    normalTabs =
                        listOf(
                            createTab(id = "1"),
                            createTab(id = "2", tabGroupId = group.id),
                            createTab(id = "3", tabGroupId = group.id),
                            createTab(id = "4"),
                        ),
                    tabGroups = listOf(group),
                )
                .toTabStorageUpdate()

        assertEquals(expected = listOf("1", group.id, "4"), actual = update.normalItems.map { it.id })
        assertEquals(
            expected = listOf("2", "3"),
            actual = (update.normalItems[1] as TabsTrayItem.TabGroup).tabs.map { it.id },
        )
        assertEquals(expected = 4, actual = update.normalTabCount)
    }

    @Test
    fun `GIVEN a grouped tab is selected WHEN it is mapped THEN the group is focused and scrolled to it`() {
        val group = createTabGroup(id = "group-1")
        val selectedTab = createTab(id = "3", tabGroupId = group.id)
        val update =
            createSnapshot(
                    normalTabs = listOf(createTab(id = "1"), createTab(id = "2", tabGroupId = group.id), selectedTab),
                    tabGroups = listOf(group),
                    selectedTab = selectedTab,
                )
                .toTabStorageUpdate()
        val displayGroup = update.tabGroups.single()

        assertEquals(expected = 1, actual = update.selectedNormalItemIndex)
        assertTrue { displayGroup.isFocused }
        assertEquals(expected = 1, actual = displayGroup.initialScrollIndex)
    }

    @Test
    fun `GIVEN a group's focused tab was closed WHEN an ungrouped tab is next for focus THEN the updated focus points to the ungrouped tab`() {
        val group = createTabGroup(id = "group-1")
        val selectedTab = createTab(id = "2")
        val update =
            createSnapshot(
                    normalTabs = listOf(createTab(id = "1"), selectedTab),
                    tabGroups = listOf(group),
                    selectedTab = selectedTab,
                )
                .toTabStorageUpdate()
        val displayGroup = update.tabGroups.single()

        assertEquals(expected = "2", actual = update.selectedTabId)
        assertEquals(expected = 1, actual = update.selectedNormalItemIndex)
        assertEquals(expected = listOf("1", "2"), actual = update.normalItems.map { it.id })
        assertTrue { update.normalItems[1].isFocused }
        assertFalse { displayGroup.isFocused }
        assertEquals(expected = emptyList(), actual = displayGroup.tabs)
        assertEquals(expected = 2, actual = update.normalTabCount)
    }

    @Test
    fun `GIVEN a tab group is closed WHEN it is mapped THEN it is not a normal item`() {
        val group = createTabGroup(id = "group-1", closed = true)
        val update =
            createSnapshot(
                    normalTabs = listOf(createTab(id = "1"), createTab(id = "2", tabGroupId = group.id)),
                    tabGroups = listOf(group),
                )
                .toTabStorageUpdate()

        assertEquals(expected = listOf("1"), actual = update.normalItems.map { it.id })
        assertEquals(expected = listOf("2"), actual = update.tabGroups.single().tabs.map { it.id })
        assertTrue { update.tabGroups.single().closed }
        assertEquals(expected = 1, actual = update.normalTabCount)
    }

    @Test
    fun `GIVEN a tab group has no tabs WHEN it is mapped THEN it is not a normal item but keeps its metadata`() {
        val emptyGroup = createTabGroup(id = "empty", lastModified = 123L)
        val update =
            createSnapshot(normalTabs = listOf(createTab(id = "1")), tabGroups = listOf(emptyGroup))
                .toTabStorageUpdate()

        assertEquals(expected = listOf("1"), actual = update.normalItems.map { it.id })
        assertEquals(expected = emptyList(), actual = update.tabGroups.single().tabs)
        assertEquals(expected = "Group empty", actual = update.tabGroups.single().title)
        assertEquals(expected = 123L, actual = update.tabGroups.single().lastModified)
        assertEquals(expected = 1, actual = update.normalTabCount)
    }

    @Test
    fun `WHEN tab groups are mapped THEN they are sorted by the most recently modified`() {
        val oldestGroup = createTabGroup(id = "oldest", lastModified = 1L)
        val newestGroup = createTabGroup(id = "newest", lastModified = 3L)
        val middleGroup = createTabGroup(id = "middle", lastModified = 2L)
        val update =
            createSnapshot(
                    normalTabs =
                        listOf(
                            createTab(id = "1", tabGroupId = oldestGroup.id),
                            createTab(id = "2", tabGroupId = newestGroup.id),
                            createTab(id = "3", tabGroupId = middleGroup.id),
                        ),
                    tabGroups = listOf(oldestGroup, newestGroup, middleGroup),
                )
                .toTabStorageUpdate()

        assertEquals(expected = listOf("newest", "middle", "oldest"), actual = update.tabGroups.map { it.id })
        assertEquals(expected = listOf("oldest", "newest", "middle"), actual = update.normalItems.map { it.id })
    }

    @Test
    fun `WHEN a tab group has an unknown theme THEN the default theme is used`() {
        val group = createTabGroup(id = "group-1", theme = "Chartreuse")
        val update =
            createSnapshot(
                    normalTabs = listOf(createTab(id = "1", tabGroupId = group.id)),
                    tabGroups = listOf(group),
                )
                .toTabStorageUpdate()

        assertEquals(expected = TabGroupTheme.default, actual = update.tabGroups.single().theme)
    }

    @Test
    fun `WHEN a tab group has a known theme THEN the theme is parsed`() {
        val group = createTabGroup(id = "group-1", theme = TabGroupTheme.Cyan.toStorageValue())
        val update =
            createSnapshot(
                    normalTabs = listOf(createTab(id = "1", tabGroupId = group.id)),
                    tabGroups = listOf(group),
                )
                .toTabStorageUpdate()

        assertEquals(expected = TabGroupTheme.Cyan, actual = update.tabGroups.single().theme)
    }

    @Test
    fun `GIVEN a tab is assigned to a group which does not exist WHEN it is mapped THEN it is a normal item`() {
        val update =
            createSnapshot(normalTabs = listOf(createTab(id = "1", tabGroupId = "missing"))).toTabStorageUpdate()

        assertEquals(expected = listOf("1"), actual = update.normalItems.map { it.id })
        assertEquals(expected = emptyList(), actual = update.tabGroups)
        assertEquals(expected = 1, actual = update.normalTabCount)
        assertFalse { update.normalItems.single().isHomepageItem }
    }

    private fun createSnapshot(
        selectedTab: Tab? = null,
        normalTabs: List<Tab> = emptyList(),
        privateTabs: List<Tab> = emptyList(),
        tabGroups: List<TabGroup> = emptyList(),
        inactiveTabsEnabled: Boolean = true,
    ): TabsSnapshot =
        TabsSnapshot(
            selectedTab = selectedTab,
            normalTabs = normalTabs,
            privateTabs = privateTabs,
            tabGroups = tabGroups,
            inactiveTabsEnabled = inactiveTabsEnabled,
        )

    private fun createTab(
        id: String,
        private: Boolean = false,
        inactive: Boolean = false,
        isMediaActive: Boolean = false,
        lastAccess: Long = 0L,
        tabGroupId: String? = null,
    ): Tab =
        Tab(
            id = id,
            url = "https://www.mozilla.org/$id",
            title = "Tab $id",
            private = private,
            inactive = inactive,
            isMediaActive = isMediaActive,
            lastAccess = lastAccess,
            tabGroupId = tabGroupId,
        )

    private fun createTabGroup(
        id: String,
        theme: String = TabGroupTheme.Red.toStorageValue(),
        closed: Boolean = false,
        lastModified: Long = 0L,
    ): TabGroup =
        TabGroup(
            id = id,
            title = "Group $id",
            theme = theme,
            closed = closed,
            lastModified = lastModified,
            tabIds = emptyList(),
        )
}
