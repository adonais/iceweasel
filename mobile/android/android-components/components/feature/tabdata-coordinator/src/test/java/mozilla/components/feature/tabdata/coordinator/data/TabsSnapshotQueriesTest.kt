/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabdata.coordinator.data

import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.Test

class TabsSnapshotQueriesTest {

    @Test
    fun `WHEN finding a normal tab by ID THEN the tab is returned`() {
        val tab = createTab(id = "1")
        val snapshot = TabsSnapshot(normalTabs = listOf(createTab(id = "0"), tab))

        assertEquals(expected = tab, actual = snapshot.findTab(id = "1"))
    }

    @Test
    fun `WHEN finding a private tab by ID THEN the tab is returned`() {
        val privateTab = createTab(id = "2", private = true)
        val snapshot = TabsSnapshot(normalTabs = listOf(createTab(id = "1")), privateTabs = listOf(privateTab))

        assertEquals(expected = privateTab, actual = snapshot.findTab(id = "2"))
    }

    @Test
    fun `WHEN finding a tab that does not exist THEN null is returned`() {
        val snapshot =
            TabsSnapshot(
                normalTabs = listOf(createTab(id = "1")),
                privateTabs = listOf(createTab(id = "2", private = true)),
            )

        assertNull(snapshot.findTab(id = "3"))
    }

    @Test
    fun `WHEN finding a tab group by ID THEN the group is returned`() {
        val group = createTabGroup(id = "group2")
        val snapshot = TabsSnapshot(tabGroups = listOf(createTabGroup(id = "group1"), group))

        assertEquals(expected = group, actual = snapshot.findTabGroup(id = "group2"))
    }

    @Test
    fun `WHEN finding a tab group that does not exist THEN null is returned`() {
        val snapshot = TabsSnapshot(tabGroups = listOf(createTabGroup(id = "group1")))

        assertNull(snapshot.findTabGroup(id = "group2"))
    }

    @Test
    fun `WHEN fetching the tabs in a group THEN only the group's tabs are returned in tab list order`() {
        val tab1 = createTab(id = "1", tabGroupId = "group1")
        val tab2 = createTab(id = "2", tabGroupId = "group2")
        val tab3 = createTab(id = "3")
        val tab4 = createTab(id = "4", tabGroupId = "group1")
        val snapshot =
            TabsSnapshot(
                normalTabs = listOf(tab1, tab2, tab3, tab4),
                tabGroups = listOf(createTabGroup(id = "group1", tabIds = listOf("4", "1"))),
            )

        assertEquals(expected = listOf(tab1, tab4), actual = snapshot.tabsInTabGroup(tabGroupId = "group1"))
    }

    @Test
    fun `GIVEN a group references closed tabs WHEN fetching the tabs in the group THEN only open tabs are returned`() {
        val tab = createTab(id = "1", tabGroupId = "group1")
        val snapshot =
            TabsSnapshot(
                normalTabs = listOf(tab),
                tabGroups = listOf(createTabGroup(id = "group1", tabIds = listOf("1", "closed"))),
            )

        assertEquals(expected = listOf(tab), actual = snapshot.tabsInTabGroup(tabGroupId = "group1"))
    }

    @Test
    fun `WHEN fetching the tabs in a group THEN private tabs are excluded`() {
        val snapshot =
            TabsSnapshot(
                normalTabs = listOf(createTab(id = "1")),
                privateTabs = listOf(createTab(id = "2", private = true, tabGroupId = "group1")),
            )

        assertTrue(snapshot.tabsInTabGroup(tabGroupId = "group1").isEmpty())
    }

    @Test
    fun `WHEN fetching the tabs in a group that does not exist THEN an empty list is returned`() {
        val snapshot = TabsSnapshot(normalTabs = listOf(createTab(id = "1", tabGroupId = "group1")))

        assertTrue(snapshot.tabsInTabGroup(tabGroupId = "group2").isEmpty())
    }

    @Test
    fun `WHEN fetching the tab IDs in a group THEN the IDs are returned in tab list order`() {
        val snapshot =
            TabsSnapshot(
                normalTabs =
                    listOf(
                        createTab(id = "1", tabGroupId = "group1"),
                        createTab(id = "2"),
                        createTab(id = "3", tabGroupId = "group1"),
                    )
            )

        assertEquals(expected = listOf("1", "3"), actual = snapshot.tabIdsInTabGroup(tabGroupId = "group1"))
    }

    @Test
    fun `WHEN fetching the tab IDs in an empty group THEN an empty list is returned`() {
        val snapshot =
            TabsSnapshot(
                normalTabs = listOf(createTab(id = "1")),
                tabGroups = listOf(createTabGroup(id = "group1")),
            )

        assertTrue(snapshot.tabIdsInTabGroup(tabGroupId = "group1").isEmpty())
    }

    @Test
    fun `WHEN fetching the first tab ID in a group THEN the first grouped tab in tab list order is returned`() {
        val snapshot =
            TabsSnapshot(
                normalTabs =
                    listOf(
                        createTab(id = "1"),
                        createTab(id = "2", tabGroupId = "group1"),
                        createTab(id = "3", tabGroupId = "group1"),
                    )
            )

        assertEquals(expected = "2", actual = snapshot.firstTabIdInTabGroup(tabGroupId = "group1"))
    }

    @Test
    fun `WHEN fetching the first tab ID in an empty group THEN null is returned`() {
        val snapshot =
            TabsSnapshot(
                normalTabs = listOf(createTab(id = "1")),
                tabGroups = listOf(createTabGroup(id = "group1")),
            )

        assertNull(snapshot.firstTabIdInTabGroup(tabGroupId = "group1"))
    }

    @Test
    fun `WHEN fetching the last tab ID in a group THEN the last grouped tab in tab list order is returned`() {
        val snapshot =
            TabsSnapshot(
                normalTabs =
                    listOf(
                        createTab(id = "1", tabGroupId = "group1"),
                        createTab(id = "2", tabGroupId = "group1"),
                        createTab(id = "3"),
                    )
            )

        assertEquals(expected = "2", actual = snapshot.lastTabIdInTabGroup(tabGroupId = "group1"))
    }

    @Test
    fun `WHEN fetching the last tab ID in an empty group THEN null is returned`() {
        val snapshot =
            TabsSnapshot(
                normalTabs = listOf(createTab(id = "1")),
                tabGroups = listOf(createTabGroup(id = "group1")),
            )

        assertNull(snapshot.lastTabIdInTabGroup(tabGroupId = "group1"))
    }

    @Test
    fun `GIVEN a group with a single tab WHEN fetching the first and last tab IDs THEN both are that tab`() {
        val snapshot = TabsSnapshot(normalTabs = listOf(createTab(id = "1", tabGroupId = "group1")))

        assertEquals(expected = "1", actual = snapshot.firstTabIdInTabGroup(tabGroupId = "group1"))
        assertEquals(expected = "1", actual = snapshot.lastTabIdInTabGroup(tabGroupId = "group1"))
    }

    private fun createTab(id: String, private: Boolean = false, tabGroupId: String? = null) =
        Tab(id = id, url = "https://$id.com", title = id, private = private, inactive = false, tabGroupId = tabGroupId)

    private fun createTabGroup(id: String, tabIds: List<String> = emptyList()) =
        TabGroup(id = id, title = id, theme = "", closed = false, lastModified = 0L, tabIds = tabIds)
}
