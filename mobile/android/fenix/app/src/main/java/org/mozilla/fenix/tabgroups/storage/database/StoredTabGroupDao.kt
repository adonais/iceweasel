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
 * [Dao] to interact with the table containing [StoredTabGroup].
 **/
@Dao
interface StoredTabGroupDao {

    /**
     * Updates, or inserts, the provided [StoredTabGroup].
     **/
    @Upsert
    suspend fun upsertTabGroup(tabGroup: StoredTabGroup)

    /**
     * Updates, or inserts, the provided [StoredTabGroup].
     **/
    @Upsert
    suspend fun upsertTabGroups(tabGroups: List<StoredTabGroup>)

    /**
     * Fetches the [StoredTabGroup] that corresponds to [id].
     **/
    @Query("SELECT * FROM $TAB_GROUP_TABLE_NAME WHERE id = :id")
    suspend fun getTabGroupById(id: String): StoredTabGroup?

    /**
     * Fetches all of the [StoredTabGroup]s.
     **/
    @Query("SELECT * FROM $TAB_GROUP_TABLE_NAME")
    fun getAllTabGroups(): Flow<List<StoredTabGroup>>

    /**
     * Deletes the specified [StoredTabGroup].
     **/
    @Delete
    suspend fun deleteTabGroup(tabGroup: StoredTabGroup)

    /**
     * Updates the closure state of the entity with the corresponding [id].
     **/
    @Query("UPDATE $TAB_GROUP_TABLE_NAME SET closed = :closed  WHERE id = :id")
    fun updateTabGroupCloseState(id: String, closed: Boolean)

    /**
     * Marks all tab groups as closed.
     **/
    @Query("UPDATE $TAB_GROUP_TABLE_NAME SET closed = 1")
    fun closeAllTabGroups()

    /**
     * Deletes the [StoredTabGroup] with the corresponding [id].
     **/
    @Query("DELETE FROM $TAB_GROUP_TABLE_NAME WHERE id = :id")
    suspend fun deleteTabGroupById(id: String)

    /**
     * Deletes all of the [StoredTabGroup] whose ID is contained in [ids].
     **/
    @Query("DELETE FROM $TAB_GROUP_TABLE_NAME WHERE id in (:ids)")
    suspend fun deleteTabGroupsById(ids: List<String>)

    /**
     * Deletes all of the [StoredTabGroup]s in the database.
     **/
    @Query("DELETE FROM $TAB_GROUP_TABLE_NAME")
    suspend fun deleteAllTabGroups()
}
