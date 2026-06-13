/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups.storage.repository

import android.content.Context
import androidx.room.Room
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import mozilla.components.support.utils.DateTimeProvider
import mozilla.components.support.utils.DefaultDateTimeProvider
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
     * @param dateTimeProvider The [DateTimeProvider] used to update time-based metadata.
     */
    constructor(
        applicationContext: Context,
        dateTimeProvider: DateTimeProvider = DefaultDateTimeProvider(),
    ) {
        this.database = Room.databaseBuilder(
            context = applicationContext,
            klass = TabGroupDatabase::class.java,
            name = "tab_groups",
        ).build()
        this.dateTimeProvider = dateTimeProvider
    }

    /**
     * The test implementation of [TabGroupRepository].
     *
     * @param database The test instance of [TabGroupDatabase].
     * @param dateTimeProvider The [DateTimeProvider] used to update time-based metadata.
     *
     */
    internal constructor(
        database: TabGroupDatabase,
        dateTimeProvider: DateTimeProvider,
    ) {
        this.database = database
        this.dateTimeProvider = dateTimeProvider
    }

    private val database: TabGroupDatabase

    private val dateTimeProvider: DateTimeProvider

    override suspend fun createTabGroupWithTabs(
        tabGroup: StoredTabGroup,
        tabIds: List<String>,
    ) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.createTabGroup(
            tabGroup = tabGroup,
            assignments = tabIds.map { TapGroupAssignment(id = it, tabGroupId = tabGroup.id) },
        )
    }

    override suspend fun deleteAllTabGroupData() = withContext(Dispatchers.IO) {
        database.clearAllTables()
    }

    // Tab Group Metadata operations

    override fun observeTabGroups(): Flow<List<StoredTabGroup>> =
        database.tabGroupOperationsDao.getAllTabGroups()

    override suspend fun fetchTabGroups(): List<StoredTabGroup> =
        database.tabGroupOperationsDao.getAllTabGroups().first()

    override suspend fun fetchTabGroupById(id: String): StoredTabGroup? =
        database.tabGroupOperationsDao.getTabGroupById(id = id)

    override suspend fun addNewTabGroup(tabGroup: StoredTabGroup) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.upsertTabGroup(tabGroup = tabGroup)
    }

    override suspend fun updateTabGroup(tabGroup: StoredTabGroup) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.upsertTabGroup(tabGroup = tabGroup)
    }

    override suspend fun closeTabGroup(tabGroupId: String) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.updateTabGroupCloseState(
            id = tabGroupId,
            closed = true,
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }

    override suspend fun openTabGroup(tabGroupId: String) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.updateTabGroupCloseState(
            id = tabGroupId,
            closed = false,
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }

    override suspend fun closeAllTabGroups() = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.closeAllTabGroups(
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }

    override suspend fun deleteTabGroup(tabGroup: StoredTabGroup) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.deleteTabGroup(tabGroup = tabGroup)
    }

    override suspend fun deleteTabGroupById(tabGroupId: String) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.deleteTabGroupById(id = tabGroupId)
    }

    override suspend fun deleteTabGroupsById(ids: List<String>) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.deleteTabGroupsById(ids = ids)
    }

    // Tab Group Assignment operations

    override fun observeTabGroupAssignments(): Flow<Map<String, String>> =
        database.tabGroupOperationsDao
            .getAllTabGroupAssignments()
            .map {
                it.associate { assignment ->
                    assignment.id to assignment.tabGroupId
                }
            }

    override suspend fun fetchTabGroupAssignments(): Map<String, String> =
        database.tabGroupOperationsDao
            .getAllTabGroupAssignments()
            .first()
            .associate { it.id to it.tabGroupId }

    override suspend fun addTabGroupAssignment(assignment: TapGroupAssignment) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.upsertTabGroupAssignment(
            assignment = assignment,
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }

    override suspend fun addTabGroupAssignments(assignments: List<TapGroupAssignment>) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.upsertTabGroupAssignments(
            assignments = assignments,
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }

    override suspend fun addTabGroupAssignment(tabId: String, tabGroupId: String) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.upsertTabGroupAssignment(
            assignment = TapGroupAssignment(
                id = tabId,
                tabGroupId = tabGroupId,
            ),
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }

    override suspend fun updateTabGroupAssignment(tabId: String, tabGroupId: String) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.upsertTabGroupAssignment(
            assignment = TapGroupAssignment(
                id = tabId,
                tabGroupId = tabGroupId,
            ),
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }

    override suspend fun addTabsToTabGroup(tabGroupId: String, tabIds: List<String>) = withContext(Dispatchers.IO) {
        val assignments = tabIds.map { TapGroupAssignment(id = it, tabGroupId = tabGroupId) }
        database.tabGroupOperationsDao.upsertTabGroupAssignments(
            assignments = assignments,
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }

    override suspend fun deleteTabGroupAssignment(assignment: TapGroupAssignment) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.deleteTabGroupAssignment(
            assignment = assignment,
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }

    override suspend fun deleteTabGroupAssignmentById(tabId: String) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.deleteTabGroupAssignmentById(
            tabId = tabId,
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }

    override suspend fun deleteAllTabGroupAssignmentsForGroup(tabGroupId: String) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.deleteTabGroupAssignmentsByTabGroupId(
            tabGroupId = tabGroupId,
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }

    override suspend fun deleteTabGroupAssignmentsById(tabIds: List<String>) = withContext(Dispatchers.IO) {
        database.tabGroupOperationsDao.deleteAllAssignmentsById(
            tabIds = tabIds,
            currentTime = dateTimeProvider.currentTimeMillis(),
        )
    }
}
