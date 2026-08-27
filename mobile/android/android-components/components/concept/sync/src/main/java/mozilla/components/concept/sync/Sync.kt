/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.concept.sync

/**
 * Results of running a sync via [SyncableStore.sync].
 */
sealed class SyncStatus {
    /**
     * Sync succeeded successfully.
     */
    object Ok : SyncStatus()

    /**
     * Sync completed with an error.
     */
    data class Error(val exception: Exception) : SyncStatus()
}

/**
 * Describes a "sync" entry point for a storage layer.
 */
interface SyncableStore {
    /**
     * Registers this storage with a sync manager.
     */
    fun registerWithSyncManager()
}
