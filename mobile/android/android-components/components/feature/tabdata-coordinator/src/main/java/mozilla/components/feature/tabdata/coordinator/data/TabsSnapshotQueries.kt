/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabdata.coordinator.data

/**
 * Finds the [Tab] with the matching [id] in either browsing mode, or null if no such tab is open.
 *
 * @param id The ID of the tab to look up.
 */
fun TabsSnapshot.findTab(id: String): Tab? = normalTabs.find { it.id == id } ?: privateTabs.find { it.id == id }

/**
 * Finds the [TabGroup] with the matching [id], or null if no such group exists.
 *
 * @param id The ID of the tab group to look up.
 */
fun TabsSnapshot.findTabGroup(id: String): TabGroup? = tabGroups.find { it.id == id }

/**
 * Fetches the open tabs assigned to the group with [tabGroupId], in the order they appear in the tab list.
 *
 * Membership is derived from the open tabs rather than from [TabGroup.tabIds] so that assignments referencing tabs
 * which are no longer open are ignored.
 *
 * @param tabGroupId The ID of the tab group.
 */
fun TabsSnapshot.tabsInTabGroup(tabGroupId: String): List<Tab> = normalTabs.filter { it.tabGroupId == tabGroupId }

/**
 * Fetches the IDs of the open tabs assigned to the group with [tabGroupId], in the order they appear in the tab list.
 * Returns an empty list if the group is empty or does not exist.
 *
 * @param tabGroupId The ID of the tab group.
 */
fun TabsSnapshot.tabIdsInTabGroup(tabGroupId: String): List<String> =
    tabsInTabGroup(tabGroupId = tabGroupId).map { it.id }

/**
 * Fetches the ID of the first open tab in the group with [tabGroupId], or null if the group is empty or does not exist.
 *
 * @param tabGroupId The ID of the tab group.
 */
fun TabsSnapshot.firstTabIdInTabGroup(tabGroupId: String): String? =
    normalTabs.firstOrNull { it.tabGroupId == tabGroupId }?.id

/**
 * Fetches the ID of the last open tab in the group with [tabGroupId], or null if the group is empty or does not exist.
 *
 * @param tabGroupId The ID of the tab group.
 */
fun TabsSnapshot.lastTabIdInTabGroup(tabGroupId: String): String? =
    normalTabs.lastOrNull { it.tabGroupId == tabGroupId }?.id
