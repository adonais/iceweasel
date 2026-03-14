/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups.storage.repository

import android.content.Context
import androidx.room.Room
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import org.mozilla.fenix.tabgroups.storage.database.StoredTabGroup
import org.mozilla.fenix.tabgroups.storage.database.TabGroupDatabase
import org.mozilla.fenix.tabgroups.storage.database.TapGroupAssignment

/**
 * Abstraction for interfacing with tab group storage.
 **/
interface TabGroupRepository {

    /**
     * Create a new tab group with tabs.
     **/
    suspend fun createTabGroupWithTabs(tabGroup: StoredTabGroup, tabIds: List<String>)

    /**
     * Deletes all tab group data from the repository.
     **/
    suspend fun deleteAllTabGroupData()

    // Tab Group operations

    /**
     * Observe the collection of [StoredTabGroup]s.
     **/
    fun observeTabGroups(): Flow<List<StoredTabGroup>>

    /**
     * Fetch the current collection of [StoredTabGroup]s.
     **/
    suspend fun fetchTabGroups(): List<StoredTabGroup>

    /**
     * Fetch the tab group with the matching [id]
     **/
    suspend fun fetchTabGroupById(id: String): StoredTabGroup?

    /**
     * Add a new [StoredTabGroup] to the repository.
     **/
    suspend fun addNewTabGroup(tabGroup: StoredTabGroup)

    /**
     * Update the matching [StoredTabGroup] in the repository.
     **/
    suspend fun updateTabGroup(tabGroup: StoredTabGroup)

    /**
     * Mark the specified tab group as closed.
     **/
    suspend fun closeTabGroup(tabGroupId: String)

    /**
     * Mark the specified tab group as open.
     **/
    suspend fun openTabGroup(tabGroupId: String)

    /**
     * Mark all tab groups as closed.
     **/
    suspend fun closeAllTabGroups()

    /**
     * Delete the matching [StoredTabGroup] in the repository.
     **/
    suspend fun deleteTabGroup(tabGroup: StoredTabGroup)

    /**
     * Delete the tab group in the repository with the matching ID.
     **/
    suspend fun deleteTabGroupById(tabGroupId: String)

    /**
     * Delete tab groups with the provided [ids] in the repository.
     **/
    suspend fun deleteTabGroupsById(ids: List<String>)

    // Tab Group Assignment operations

    /**
     * Observe the mapping of tab IDs to tab group IDs.
     **/
    fun observeTabGroupAssignments(): Flow<Map<String, String>>

    /**
     * Fetch the current the mapping of tab IDs to tab group IDs.
     **/
    suspend fun fetchTabGroupAssignments(): Map<String, String>

    /**
     * Add a new tab group assignment to the repository.
     **/
    suspend fun addTabGroupAssignment(assignment: TapGroupAssignment)

    /**
     * Add a new tab group assignment to the repository.
     **/
    suspend fun addTabGroupAssignments(assignments: List<TapGroupAssignment>)

    /**
     * Add a new tab group assignment to the repository.
     **/
    suspend fun addTabGroupAssignment(tabId: String, tabGroupId: String)

    /**
     * Map all of the [tabIds] to [tabGroupId].
     **/
    suspend fun addTabsToTabGroup(tabGroupId: String, tabIds: List<String>)

    /**
     * Update the group assignment for [tabId].
     **/
    suspend fun updateTabGroupAssignment(tabId: String, tabGroupId: String)

    /**
     * Delete the provided [assignment].
     **/
    suspend fun deleteTabGroupAssignment(assignment: TapGroupAssignment)

    /**
     * Delete the assignment for the provided [tabId].
     **/
    suspend fun deleteTabGroupAssignmentById(tabId: String)

    /**
     * Delete all the assignments for the provided [tabIds].
     **/
    suspend fun deleteTabGroupAssignmentsById(tabIds: List<String>)

    /**
     * Delete the assignments for the provided [tabGroupId].
     **/
    suspend fun deleteAllTabGroupAssignmentsForGroup(tabGroupId: String)
}

/**
 * The default implementation of [TabGroupRepository] built off of Room.
 **/
class DefaultTabGroupRepository : TabGroupRepository {

    /**
     * The default implementation of [TabGroupRepository] built off of Room.
     *
     * @param applicationContext [Context] used to instantiate the database.
     **/
    constructor(applicationContext: Context) {
        this.database = Room.databaseBuilder(
            context = applicationContext,
            klass = TabGroupDatabase::class.java,
            name = "tab_groups",
        ).build()
    }

    internal constructor(database: TabGroupDatabase) {
        this.database = database
    }

    private val database: TabGroupDatabase

    override suspend fun createTabGroupWithTabs(
        tabGroup: StoredTabGroup,
        tabIds: List<String>,
    ) {
        database.tabGroupDao.upsertTabGroup(tabGroup)
        database.tabGroupAssignmentDao.upsertTabGroupAssignments(
            tabIds.map { TapGroupAssignment(id = it, tabGroupId = tabGroup.id) },
        )
    }

    override suspend fun deleteAllTabGroupData() {
        database.clearAllTables()
    }

    // Tab Group Metadata operations

    override fun observeTabGroups(): Flow<List<StoredTabGroup>> =
        database.tabGroupDao.getAllTabGroups()

    override suspend fun fetchTabGroups(): List<StoredTabGroup> =
        database.tabGroupDao.getAllTabGroups().first()

    override suspend fun fetchTabGroupById(id: String): StoredTabGroup? =
        database.tabGroupDao.getTabGroupById(id = id)

    override suspend fun addNewTabGroup(tabGroup: StoredTabGroup) {
        database.tabGroupDao.upsertTabGroup(tabGroup = tabGroup)
    }

    override suspend fun updateTabGroup(tabGroup: StoredTabGroup) {
        database.tabGroupDao.upsertTabGroup(tabGroup = tabGroup)
    }

    override suspend fun closeTabGroup(tabGroupId: String) {
        database.tabGroupDao.updateTabGroupCloseState(id = tabGroupId, closed = true)
    }

    override suspend fun openTabGroup(tabGroupId: String) {
        database.tabGroupDao.updateTabGroupCloseState(id = tabGroupId, closed = false)
    }

    override suspend fun closeAllTabGroups() {
        database.tabGroupDao.closeAllTabGroups()
    }

    override suspend fun deleteTabGroup(tabGroup: StoredTabGroup) =
        database.tabGroupDao.deleteTabGroup(tabGroup = tabGroup)

    override suspend fun deleteTabGroupById(tabGroupId: String) =
        database.tabGroupDao.deleteTabGroupById(id = tabGroupId)

    override suspend fun deleteTabGroupsById(ids: List<String>) =
        database.tabGroupDao.deleteTabGroupsById(ids = ids)

    // Tab Group Assignment operations

    override fun observeTabGroupAssignments(): Flow<Map<String, String>> =
        database.tabGroupAssignmentDao
            .getAllTabGroups()
            .map {
                it.associate { assignment ->
                    assignment.id to assignment.tabGroupId
                }
            }

    override suspend fun fetchTabGroupAssignments(): Map<String, String> =
        database.tabGroupAssignmentDao
            .getAllTabGroups()
            .first()
            .associate { it.id to it.tabGroupId }

    override suspend fun addTabGroupAssignment(assignment: TapGroupAssignment) {
        database.tabGroupAssignmentDao.upsertTabGroupAssignment(assignment = assignment)
    }

    override suspend fun addTabGroupAssignments(assignments: List<TapGroupAssignment>) {
        database.tabGroupAssignmentDao.upsertTabGroupAssignments(assignments = assignments)
    }

    override suspend fun addTabGroupAssignment(tabId: String, tabGroupId: String) =
        database.tabGroupAssignmentDao.upsertTabGroupAssignment(
            assignment = TapGroupAssignment(
                id = tabId,
                tabGroupId = tabGroupId,
            ),
        )

    override suspend fun updateTabGroupAssignment(tabId: String, tabGroupId: String) =
        database.tabGroupAssignmentDao.upsertTabGroupAssignment(
            assignment = TapGroupAssignment(
                id = tabId,
                tabGroupId = tabGroupId,
            ),
        )

    override suspend fun addTabsToTabGroup(tabGroupId: String, tabIds: List<String>) {
        val assignments = tabIds.map { TapGroupAssignment(id = it, tabGroupId = tabGroupId) }
        database.tabGroupAssignmentDao.upsertTabGroupAssignments(assignments)
    }

    override suspend fun deleteTabGroupAssignment(assignment: TapGroupAssignment) =
        database.tabGroupAssignmentDao.deleteTabGroupAssignment(tabGroupAssignment = assignment)

    override suspend fun deleteTabGroupAssignmentById(tabId: String) =
        database.tabGroupAssignmentDao.deleteTabGroupAssignmentById(tabId = tabId)

    override suspend fun deleteAllTabGroupAssignmentsForGroup(tabGroupId: String) =
        database.tabGroupAssignmentDao.deleteTabGroupAssignmentsByTabGroupId(tabGroupId = tabGroupId)

    override suspend fun deleteTabGroupAssignmentsById(tabIds: List<String>) =
        database.tabGroupAssignmentDao.deleteAllAssignmentsById(ids = tabIds)
}
