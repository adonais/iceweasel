/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups.fakes

import androidx.annotation.VisibleForTesting
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import org.mozilla.fenix.tabgroups.storage.database.StoredTabGroup
import org.mozilla.fenix.tabgroups.storage.database.TapGroupAssignment
import org.mozilla.fenix.tabgroups.storage.repository.TabGroupRepository

/**
 * Important Note: This is used for TESTING and COMPOSE PREVIEWS only.
 *
 * This is a fake implementation of [TabGroupRepository] designed exclusively
 * for unit tests and Compose previews. Do NOT use this in production UI code.
 */
@VisibleForTesting
@Suppress("EmptyFunctionBlock")
class FakeTabGroupRepository(
    private val tabGroupFlow: MutableStateFlow<List<StoredTabGroup>> = MutableStateFlow(emptyList()),
    private val tabGroupAssignmentFlow: MutableStateFlow<Map<String, String>> = MutableStateFlow(mapOf()),
    private val closeAllTabGroups: () -> Unit = {},
    private val deleteTabGroupAssignmentById: (String) -> Unit = {},
    private val deleteTabGroupAssignmentsById: (List<String>) -> Unit = {},
) : TabGroupRepository {

    override suspend fun createTabGroupWithTabs(
        tabGroup: StoredTabGroup,
        tabIds: List<String>,
    ) {
        tabGroupFlow.emit(tabGroupFlow.value + tabGroup)
        addTabsToTabGroup(tabIds = tabIds, tabGroupId = tabGroup.id)
    }

    override fun observeTabGroups(): Flow<List<StoredTabGroup>> = tabGroupFlow

    override suspend fun fetchTabGroups(): List<StoredTabGroup> =
        tabGroupFlow.value

    override suspend fun fetchTabGroupById(id: String): StoredTabGroup? =
        tabGroupFlow.value.find { it.id == id }

    override suspend fun addNewTabGroup(tabGroup: StoredTabGroup) {
        tabGroupFlow.emit(tabGroupFlow.value + tabGroup)
    }

    override suspend fun updateTabGroup(tabGroup: StoredTabGroup) {
        val updatedList = tabGroupFlow.value.map {
            if (it.id == tabGroup.id) {
                tabGroup
            } else {
                it
            }
        }
        tabGroupFlow.emit(updatedList)
    }

    override suspend fun closeTabGroup(tabGroupId: String) {
        tabGroupFlow.emit(
            tabGroupFlow.value.map { group ->
                if (group.id == tabGroupId) {
                    group.copy(closed = true)
                } else {
                    group
                }
            },
        )
    }

    override suspend fun openTabGroup(tabGroupId: String) {
        tabGroupFlow.emit(
            tabGroupFlow.value.map { group ->
                if (group.id == tabGroupId) {
                    group.copy(closed = false)
                } else {
                    group
                }
            },
        )
    }

    override suspend fun closeAllTabGroups() {
        closeAllTabGroups.invoke()
    }

    override suspend fun deleteTabGroup(tabGroup: StoredTabGroup) {
        tabGroupFlow.emit(tabGroupFlow.value.filterNot { it.id == tabGroup.id })
    }

    override suspend fun deleteTabGroupById(tabGroupId: String) {
        tabGroupFlow.emit(tabGroupFlow.value.filterNot { it.id == tabGroupId })
    }

    override suspend fun deleteTabGroupsById(ids: List<String>) {
        tabGroupFlow.emit(fetchTabGroups().filterNot { it.id in ids })
    }

    override fun observeTabGroupAssignments(): Flow<Map<String, String>> = tabGroupAssignmentFlow

    override suspend fun fetchTabGroupAssignments(): Map<String, String> =
        tabGroupAssignmentFlow.value

    override suspend fun addTabGroupAssignment(
        tabId: String,
        tabGroupId: String,
    ) {
        val updatedAssignments = hashMapOf<String, String>()
        updatedAssignments.putAll(tabGroupAssignmentFlow.value)
        updatedAssignments[tabId] = tabGroupId
        tabGroupAssignmentFlow.emit(updatedAssignments)
    }

    override suspend fun addTabGroupAssignments(assignments: List<TapGroupAssignment>) {
        val updatedAssignments = hashMapOf<String, String>()
        updatedAssignments.putAll(tabGroupAssignmentFlow.value)
        assignments.forEach {
            updatedAssignments[it.id] = it.tabGroupId
        }
        tabGroupAssignmentFlow.emit(updatedAssignments)
    }

    override suspend fun addTabsToTabGroup(
        tabGroupId: String,
        tabIds: List<String>,
    ) {
        addTabGroupAssignments(assignments = tabIds.map { TapGroupAssignment(id = it, tabGroupId = tabGroupId) })
    }

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

    override suspend fun deleteAllTabGroupData() {
        tabGroupFlow.emit(emptyList())
        tabGroupAssignmentFlow.emit(mapOf())
    }
}
