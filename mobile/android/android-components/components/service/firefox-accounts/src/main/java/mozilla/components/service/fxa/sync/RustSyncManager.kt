/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

import mozilla.appservices.syncmanager.SyncManager
import mozilla.appservices.syncmanager.SyncManagerInterface

/**
 * This typealias helps us use the [SyncManagerInterface] from appservices, but with a more contextual name.
 *
 * We are using this typealias becuase we currently have a two "SyncManager" types:
 * [mozilla.appservices.syncmanager.SyncManager] and [mozilla.components.service.fxa.sync.SyncManager], and
 * [SyncManagerInterface] does not immediately tell us which of these sync managers this interface defines.
 *
 * If this proves to be more confusing than using the [SyncManagerInterface] directly, we can remove the type alias.
 */
internal typealias RustSyncManager = SyncManagerInterface

/**
 * The Rust implemented SyncManager. Must be a singleton as it carries some state between syncs. Does no IO at creation
 * time so is safe to call on any thread.
 */
private val realRustSyncManager by lazy { SyncManager() }

/** A singleton implementation of [RustSyncManager] wrapping the Rust-implemented SyncManager. */
internal object DefaultRustSyncManager : RustSyncManager by realRustSyncManager
