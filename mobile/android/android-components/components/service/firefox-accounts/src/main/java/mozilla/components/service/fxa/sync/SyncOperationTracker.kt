/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.yield
import mozilla.components.service.fxa.sync.SyncOperationTracker.isSyncInProgress

/**
 * A singleton that helps us to track sync operations. We use this to infer whether or not a sync operation is ongoing
 *
 * This need arose because we found out that the state of [androidx.work.WorkManager] does not map correctly & directly
 * to the possible states of our Rust [SyncManager]
 *
 * The reality of how the sync operation itself works is a bit more nuanced, because the calls to the sync manager are
 * blocking and not cancellable. Therefore, the WorkManager states do not correctly tell us if there's a sync operation
 * still ongoing. Even when the worker gets "cancelled", the sync manager operations may still be running
 *
 * This object exists because we are trying to implement support for tracking the active sync state of the underlying
 * sync operation implementation across different components.
 */
internal object SyncOperationTracker {

    private val syncOperationCounter = MutableStateFlow(0)

    /** Observable [Flow] indicating whether any sync request is currently in progress. */
    val isSyncInProgress: Flow<Boolean> = syncOperationCounter.map { it > 0 }.distinctUntilChanged()

    /**
     * Executes the given [operation] and updates the [isSyncInProgress] state accordingly. This ensures that the sync
     * state is tracked even if the underlying operation is blocking.
     */
    suspend fun <T> executeSyncOperation(operation: suspend () -> T): T {
        // syncOperationCounter is a mutable state flow that has atomicity guarantees
        syncOperationCounter.update { it + 1 }

        // we use this to give the observers of the sync progress state an opportunity
        // to observe the state change
        yield()
        return try {
            operation()
        } finally {
            syncOperationCounter.update { it - 1 }
        }
    }
}
