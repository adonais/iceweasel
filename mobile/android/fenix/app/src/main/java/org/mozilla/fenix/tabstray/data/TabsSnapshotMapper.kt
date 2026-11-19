/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.data

import mozilla.components.feature.tabdata.coordinator.data.Tab
import mozilla.components.feature.tabdata.coordinator.data.TabGroup
import mozilla.components.feature.tabdata.coordinator.data.TabsSnapshot

/** A tab group while the display models are being constructed. */
private class MutableTabGroup(val metaData: TabGroup) {

    val tabs: MutableList<TabsTrayItem.Tab> = mutableListOf()

    var isFocused: Boolean = false

    var initialScrollIndex: Int = 0
}

/**
 * Transforms the [TabsSnapshot] into the display models the Tab Manager renders.
 *
 * Note that the precedence applied here is the Tab Manager's own: a tab which belongs to a tab group is displayed in
 * that group and counted as a normal tab, even when it is inactive.
 */
fun TabsSnapshot.toTabStorageUpdate(): TabStorageUpdate {
    val tabGroups = tabGroups.associate { it.id to MutableTabGroup(metaData = it) }
    val normalItems: MutableList<Any> = mutableListOf()
    val inactiveTabs: MutableList<TabsTrayItem.Tab> = mutableListOf()
    val groupsIncludedInNormalItems = hashSetOf<String>()
    var normalTabCount = 0
    var selectedNormalItemIndex = 0

    normalTabs.forEach { tab ->
        val displayTab = tab.toDisplayTab(selectedTabId = selectedTab?.id)
        val assignedGroup = tabGroups[tab.tabGroupId]

        when {
            assignedGroup != null -> {
                if (!assignedGroup.metaData.closed) {
                    normalTabCount++
                }
                addToTabGroup(
                    tab = displayTab,
                    assignedGroup = assignedGroup,
                    normalItems = normalItems,
                    groupsIncludedInNormalItems = groupsIncludedInNormalItems,
                    updateSelectedItemIndex = { selectedNormalItemIndex = it },
                )
            }

            inactiveTabsEnabled && displayTab.inactive -> inactiveTabs.add(displayTab)

            else -> {
                normalTabCount++
                normalItems.add(displayTab)
                if (displayTab.isFocused) {
                    selectedNormalItemIndex = normalItems.lastIndex
                }
            }
        }
    }

    val displayPrivateTabs = privateTabs.map { it.toDisplayTab(selectedTabId = selectedTab?.id) }
    val (displayTabGroups, displayNormalItems) = generateDisplayModels(normalItems = normalItems, tabGroups = tabGroups)

    return TabStorageUpdate(
        selectedTabId = selectedTab?.id,
        normalItems = displayNormalItems,
        normalTabCount = normalTabCount,
        selectedNormalItemIndex = selectedNormalItemIndex,
        inactiveTabs = inactiveTabs,
        privateTabs = displayPrivateTabs,
        selectedPrivateItemIndex = displayPrivateTabs.indexOfFirst { it.isFocused }.coerceAtLeast(0),
        tabGroups = displayTabGroups,
    )
}

private fun Tab.toDisplayTab(selectedTabId: String?): TabsTrayItem.Tab =
    TabsTrayItem.Tab(
        id = id,
        url = url,
        title = title,
        inactive = inactive,
        private = private,
        icon = icon,
        isMediaActive = isMediaActive,
        lastAccess = lastAccess,
        isFocused = id == selectedTabId,
    )

private fun addToTabGroup(
    tab: TabsTrayItem.Tab,
    assignedGroup: MutableTabGroup,
    normalItems: MutableList<Any>,
    groupsIncludedInNormalItems: HashSet<String>,
    updateSelectedItemIndex: (Int) -> Unit,
) {
    assignedGroup.tabs.add(tab)

    // We need to separately check & track if the group has already been added to the collection of
    // Normal tab items because normalItems does not maintain a sort key and cannot be backed by a Map/Set.
    if (!assignedGroup.metaData.closed && assignedGroup.metaData.id !in groupsIncludedInNormalItems) {
        normalItems.add(assignedGroup)
        groupsIncludedInNormalItems.add(assignedGroup.metaData.id)
    }

    if (tab.isFocused) {
        updateSelectedItemIndex(normalItems.lastIndex)
        assignedGroup.isFocused = true
        assignedGroup.initialScrollIndex = assignedGroup.tabs.lastIndex
    }
}

private fun generateDisplayModels(
    normalItems: List<Any>,
    tabGroups: Map<String, MutableTabGroup>,
): Pair<List<TabsTrayItem.TabGroup>, List<TabsTrayItem>> {
    val displayTabGroups = tabGroups.mapValues { (_, group) ->
        TabsTrayItem.TabGroup(
            id = group.metaData.id,
            title = group.metaData.title,
            theme = group.metaData.theme.toTabGroupTheme(),
            tabs = group.tabs,
            closed = group.metaData.closed,
            lastModified = group.metaData.lastModified,
            isFocused = group.isFocused,
            initialScrollIndex = group.initialScrollIndex,
        )
    }
    val displayNormalItems = normalItems.mapNotNull { item ->
        when (item) {
            is MutableTabGroup -> displayTabGroups[item.metaData.id]
            is TabsTrayItem.Tab -> item
            else -> null
        }
    }

    return displayTabGroups.values.sortedByDescending { it.lastModified } to displayNormalItems
}
