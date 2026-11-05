/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.pwa.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

/** Internal DAO for accessing [ManifestEntity] instances. */
@Dao
internal interface ManifestDao {
    @Query("SELECT * from manifests WHERE start_url = :startUrl")
    suspend fun getManifest(startUrl: String): ManifestEntity?

    @Query("SELECT * from manifests WHERE :url LIKE scope||'%' ORDER BY LENGTH(scope) DESC")
    suspend fun getManifestsByScope(url: String): List<ManifestEntity>

    @Query("SELECT count(start_url) from manifests WHERE :url LIKE scope||'%' AND used_at > :thresholdMs")
    suspend fun hasRecentManifest(url: String, thresholdMs: Long): Int

    @Query("SELECT count(start_url) from manifests WHERE used_at > :thresholdMs")
    suspend fun recentManifestsCount(thresholdMs: Long): Int

    @Query(
        """
        SELECT * from manifests
        WHERE has_share_targets == 1
        AND used_at > :deadline
        ORDER BY used_at DESC
    """
    )
    suspend fun getRecentShareableManifests(deadline: Long): List<ManifestEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertManifest(manifest: ManifestEntity): Long

    @Update suspend fun updateManifest(manifest: ManifestEntity)

    @Query("DELETE FROM manifests WHERE start_url IN (:startUrls)") suspend fun deleteManifests(startUrls: List<String>)

    @Query("SELECT * from manifests WHERE used_at > :expiresAt ORDER BY LENGTH(scope)")
    suspend fun getInstalledScopes(expiresAt: Long): List<ManifestEntity>
}
