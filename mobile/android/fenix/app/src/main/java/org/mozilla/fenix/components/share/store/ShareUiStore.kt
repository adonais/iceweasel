/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.share.store

import mozilla.components.lib.state.Action
import mozilla.components.lib.state.State
import mozilla.components.lib.state.Store
import org.mozilla.fenix.share.listadapters.SyncShareOption

/**
 * Represents the state of the Share UI, containing the data to be displayed in the share sheet.
 *
 * @property devices The list of synchronized devices or account-related actions (e.g., Sign In).
 * @property isLoading Whether the initial data load or device refresh for the share sheet is in progress.
 * @property selectedDevices The set of selected devices.
 */
data class ShareUiState(
    val devices: List<SyncShareOption> = emptyList(),
    val isLoading: Boolean = false,
    val selectedDevices: Set<SyncShareOption.SingleDevice> = emptySet(),
) : State {
    val singleDevices: List<SyncShareOption.SingleDevice> = devices.filterIsInstance<SyncShareOption.SingleDevice>()

    companion object {
        val initial = ShareUiState(isLoading = true)
    }
}

/** Actions for the [ShareUiStore]. */
sealed class ShareUiAction : Action {
    /**
     * Dispatched when the user's available devices changes.
     *
     * @property devices The list of available devices.
     */
    data class UpdateDevices(val devices: List<SyncShareOption>) : ShareUiAction()

    /**
     * Dispatched when the selected devices are changed.
     *
     * @property tappedDevice The device tapped by the user.
     */
    data class DeviceSelectionToggle(val tappedDevice: SyncShareOption.SingleDevice) : ShareUiAction()

    /** Dispatched when devices are updating. */
    data object Loading : ShareUiAction()
}

private fun reduce(
    state: ShareUiState,
    action: ShareUiAction,
): ShareUiState =
    when (action) {
        is ShareUiAction.UpdateDevices ->
            state.copy(
                devices = action.devices,
                isLoading = false,
            )
        is ShareUiAction.DeviceSelectionToggle ->
            state.copy(
                selectedDevices =
                    if (action.tappedDevice in state.selectedDevices) {
                        state.selectedDevices - action.tappedDevice
                    } else {
                        state.selectedDevices + action.tappedDevice
                    }
            )
        ShareUiAction.Loading -> state.copy(isLoading = true)
    }

/**
 * A store for handling [ShareUiState] and dispatching [ShareUiAction].
 *
 * @param initialState The initial state for the store.
 */
class ShareUiStore(initialState: ShareUiState = ShareUiState()) :
    Store<ShareUiState, ShareUiAction>(
        initialState,
        ::reduce,
    )
