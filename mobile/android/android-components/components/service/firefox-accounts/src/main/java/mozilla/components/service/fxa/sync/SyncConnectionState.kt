/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

/** Whether sync is connected on this device, and if it is, whether it is able to run. */
sealed interface SyncConnectionState {

    /** Sync state has not been resolved yet. See [SyncManager.initialize]. */
    data object Uninitialized : SyncConnectionState

    /** The user explicitly disconnected sync on this device. */
    data object Disconnected : SyncConnectionState

    /** Sync is connected on this device. */
    data object Connected : SyncConnectionState
}
