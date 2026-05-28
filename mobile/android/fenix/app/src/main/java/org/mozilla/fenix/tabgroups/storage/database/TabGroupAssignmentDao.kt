/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups.storage.database

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * [Dao] to interact with the table containing [TapGroupAssignment].
 */
@Dao
interface TabGroupAssignmentDao {

    /**
     * Updates or inserts the provided [TapGroupAssignment]s.
     */
    @Upsert
    suspend fun upsertTabGroupAssignments(assignments: List<TapGroupAssignment>)

    /**
     * Updates or inserts the provided [TapGroupAssignment].
     */
    @Upsert
    suspend fun upsertTabGroupAssignment(assignment: TapGroupAssignment)

    /**
     * Fetches all of the [TapGroupAssignment]s.
     */
    @Query("SELECT * FROM $TAB_GROUP_ASSIGNMENT_TABLE_NAME")
    fun getAllTabGroupAssignments(): Flow<List<TapGroupAssignment>>

    /**
     * Deletes the specified [TapGroupAssignment].
     */
    @Delete
    suspend fun deleteTabGroupAssignment(tabGroupAssignment: TapGroupAssignment)

    /**
     * Deletes the [TapGroupAssignment] corresponding to [tabId].
     */
    @Query("DELETE FROM $TAB_GROUP_ASSIGNMENT_TABLE_NAME WHERE id = :tabId")
    suspend fun deleteTabGroupAssignmentById(tabId: String)

    /**
     * Deletes all of the [TapGroupAssignment]s who are tied to [tabGroupId].
     */
    @Query("DELETE FROM $TAB_GROUP_ASSIGNMENT_TABLE_NAME WHERE tabGroupId = :tabGroupId")
    suspend fun deleteTabGroupAssignmentsByTabGroupId(tabGroupId: String)

    /**
     * Deletes all of the [TapGroupAssignment]s in the database.
     */
    @Query("DELETE FROM $TAB_GROUP_ASSIGNMENT_TABLE_NAME")
    suspend fun deleteAllTabGroupAssignments()

    /**
     * Updates the tab group timestamp which contain [tabId].
     */
    @Query(
        """
        UPDATE $TAB_GROUP_TABLE_NAME
        SET lastModified = :currentTime
        WHERE id IN (
            SELECT DISTINCT tabGroupId
            FROM $TAB_GROUP_ASSIGNMENT_TABLE_NAME
            WHERE id IN (:tabId)
        )
    """,
    )
    suspend fun touchGroupForTab(tabId: String, currentTime: Long): Int

    /**
     * Updates the tab groups' timestamps which contain [tabIds].
     */
    @Query(
        """
        UPDATE $TAB_GROUP_TABLE_NAME
        SET lastModified = :currentTime
        WHERE id IN (
            SELECT DISTINCT tabGroupId
            FROM $TAB_GROUP_ASSIGNMENT_TABLE_NAME
            WHERE id IN (:tabIds)
        )
    """,
    )
    suspend fun touchGroupsForTabs(tabIds: List<String>, currentTime: Long): Int

    /**
     * Deletes all of the [TapGroupAssignment]s whose ID is contained in [tabIds].
     */
    @Query(
        """
        DELETE FROM $TAB_GROUP_ASSIGNMENT_TABLE_NAME
        WHERE id IN (:tabIds)
    """,
    )
    suspend fun deleteAllAssignmentsById(tabIds: List<String>): Int
}
