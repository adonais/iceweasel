/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.powersavingmode

import org.mozilla.fenix.components.appstate.AppAction.PowerSavingModeAction
import org.mozilla.fenix.components.appstate.AppState

/** A [PowerSavingModeAction] reducer that updates based on [AppState]. */
internal object PowerSavingModeReducer {
    fun reduce(state: AppState, action: PowerSavingModeAction): AppState =
        when (action) {
            is PowerSavingModeAction.Changed -> state.copy(isPowerSavingModeActive = action.isActive)
            is PowerSavingModeAction.ReaderViewForced ->
                state.copy(powerSavingModeReaderViewTabIds = state.powerSavingModeReaderViewTabIds + action.tabId)
            is PowerSavingModeAction.ForcedReaderViewLeft ->
                state.copy(powerSavingModeReaderViewTabIds = state.powerSavingModeReaderViewTabIds - action.tabIds)
        }
}
