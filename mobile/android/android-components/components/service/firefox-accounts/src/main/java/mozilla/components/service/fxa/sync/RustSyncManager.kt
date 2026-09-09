/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

import mozilla.appservices.syncmanager.SyncManager
import mozilla.appservices.syncmanager.SyncParams
import mozilla.appservices.syncmanager.SyncResult

/**
 * An abstract type around application services [SyncManager].
 *
 * This abstraction allows us to write tests easily. It also helps us work around
 * [bug 1923209](https://bugzilla.mozilla.org/show_bug.cgi?id=1923209) where we cannot run tests that use Rust generated
 * code on Apple silicon devices
 */
internal interface RustSyncManager {

    /** Performs a sync with [params] and returns a [SyncResult] */
    fun sync(params: SyncParams): SyncResult
}

/** A singleton implementation of [RustSyncManager] wrapping the Rust-implemented SyncManager. */
internal object DefaultRustSyncManager : RustSyncManager {

    /**
     * The Rust implemented SyncManager. Must be a singleton as it carries some state between syncs. Does no IO at
     * creation time so is safe to call on any thread.
     */
    private val syncManager by lazy { SyncManager() }

    override fun sync(params: SyncParams): SyncResult = syncManager.sync(params)
}
