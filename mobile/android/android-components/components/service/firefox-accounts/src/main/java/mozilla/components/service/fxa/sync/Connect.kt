/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

import mozilla.components.concept.sync.SyncEngine

/** The result of calling [SyncManager.connect] */
sealed interface ConnectResult {

    /** Sync was successfully connected */
    data object Success : ConnectResult

    /** Sync was not configured successfully */
    sealed interface Failure : ConnectResult {

        /**
         * The connect attempt failed and we need authentication. This happens when the account is not authenticated
         * (has auth issues)
         */
        data object NeedsAuthentication : Failure

        /** The connect attempt failed, there's an authenticated account but we need authorization for sync. */
        data object NeedsSyncAuthorization : Failure
    }
}

/**
 * Parameters for [SyncManager.connect].
 *
 * @property engines The engines to sync when [initiateSync] is `true`. If empty, all supported engines are synced. Has
 *   no effect when [initiateSync] is `false`. The engines specified must always be a subset of
 *   [mozilla.components.concept.sync.SyncConfig.supportedEngines]
 * @property initiateSync Whether to initiate a sync immediately after connecting.
 * @property reason The [SyncReason] reported for the sync initiated by [initiateSync].
 */
data class ConnectParams(
    val engines: Set<SyncEngine> = emptySet(),
    val initiateSync: Boolean = false,
    val reason: SyncReason = SyncReason.User,
)
