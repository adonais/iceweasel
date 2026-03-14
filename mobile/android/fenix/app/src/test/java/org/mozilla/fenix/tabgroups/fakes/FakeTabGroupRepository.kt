/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups.fakes

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.last
import org.mozilla.fenix.tabgroups.storage.database.StoredTabGroup
import org.mozilla.fenix.tabgroups.storage.database.TapGroupAssignment
import org.mozilla.fenix.tabgroups.storage.repository.TabGroupRepository

class FakeTabGroupRepository(
    private val tabGroupFlow: Flow<List<StoredTabGroup>> = flowOf(emptyList()),
    private val tabGroupAssignmentFlow: Flow<Map<String, String>> = flowOf(mapOf()),
    private val closeAllTabGroups: () -> Unit = {},
    private val deleteTabGroupAssignmentById: (String) -> Unit = {},
    private val deleteTabGroupAssignmentsById: (List<String>) -> Unit = {},
) : TabGroupRepository {

    override suspend fun createTabGroupWithTabs(
        tabGroup: StoredTabGroup,
        tabIds: List<String>,
    ) {}

    override fun observeTabGroups(): Flow<List<StoredTabGroup>> = tabGroupFlow

    override suspend fun fetchTabGroups(): List<StoredTabGroup> = tabGroupFlow.last()

    override suspend fun fetchTabGroupById(id: String): StoredTabGroup? = null

    override suspend fun addNewTabGroup(tabGroup: StoredTabGroup) {}

    override suspend fun updateTabGroup(tabGroup: StoredTabGroup) {}

    override suspend fun closeTabGroup(tabGroupId: String) {}

    override suspend fun openTabGroup(tabGroupId: String) {}

    override suspend fun closeAllTabGroups() {
        closeAllTabGroups.invoke()
    }

    override suspend fun deleteTabGroup(tabGroup: StoredTabGroup) {}

    override suspend fun deleteTabGroupById(tabGroupId: String) {}

    override suspend fun deleteTabGroupsById(ids: List<String>) {}

    override fun observeTabGroupAssignments(): Flow<Map<String, String>> = tabGroupAssignmentFlow

    override suspend fun fetchTabGroupAssignments(): Map<String, String> = mapOf()

    override suspend fun addTabGroupAssignment(
        tabId: String,
        tabGroupId: String,
    ) {}

    override suspend fun addTabGroupAssignments(assignments: List<TapGroupAssignment>) {}

    override suspend fun addTabsToTabGroup(
        tabGroupId: String,
        tabIds: List<String>,
    ) {}

    override suspend fun updateTabGroupAssignment(
        tabId: String,
        tabGroupId: String,
    ) {}

    override suspend fun deleteTabGroupAssignment(assignment: TapGroupAssignment) {}

    override suspend fun deleteTabGroupAssignmentById(tabId: String) {
        deleteTabGroupAssignmentById.invoke(tabId)
    }

    override suspend fun deleteTabGroupAssignmentsById(tabIds: List<String>) {
        deleteTabGroupAssignmentsById.invoke(tabIds)
    }

    override suspend fun deleteAllTabGroupAssignmentsForGroup(tabGroupId: String) {}

    override suspend fun addTabGroupAssignment(assignment: TapGroupAssignment) {}

    override suspend fun deleteAllTabGroupData() {}
}
