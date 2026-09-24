/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

import mozilla.appservices.syncmanager.SyncParams
import mozilla.appservices.syncmanager.SyncResult

/** Test variant of [RustSyncManager] that allows us to set various behaviours by setting the [expectedResult] */
class TestRustSyncManager : RustSyncManager {
    var expectedResult: SyncResult? = null

    /** The params that was passed to the [RustSyncManager] */
    lateinit var requestedSyncParams: SyncParams
        private set

    override fun disconnect() = Unit

    override fun getAvailableEngines(): List<String> = emptyList()

    override fun sync(params: SyncParams): SyncResult {
        requestedSyncParams = params
        return requireNotNull(expectedResult) {
            "Please set TestRustSyncManager.expectedResult before use"
        }
    }
}
