/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection

import mozilla.components.lib.state.Action
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Reducer
import mozilla.components.lib.state.Store

/** Actions that can be dispatched to [IPProtectionStore]. */
sealed interface IPProtectionAction : Action {
    /** Replaces the full IP protection state with a new snapshot from the GeckoView proxy. */
    data class UpdateState(val state: IPProtectionState) : IPProtectionAction
}

internal fun iPProtectionReducer(
    state: IPProtectionState,
    action: IPProtectionAction,
): IPProtectionState = when (action) {
    is IPProtectionAction.UpdateState -> state.copy(
        status = action.state.status,
        dataRemainingBytes = action.state.dataRemainingBytes,
        dataMaxBytes = action.state.dataMaxBytes,
        resetDate = action.state.resetDate,
        isEnrollmentNeeded = action.state.isEnrollmentNeeded,
    )
}

/**
 * Dedicated [Store] for IP protection state. Instantiated in the app's component graph and passed
 * into [DefaultIPProtectionFeature] and any UI consumers that need to observe IP protection state.
 */
class IPProtectionStore(
    initialState: IPProtectionState = IPProtectionState(),
    reducer: Reducer<IPProtectionState, IPProtectionAction> = ::iPProtectionReducer,
    middleware: List<Middleware<IPProtectionState, IPProtectionAction>> = emptyList(),
) : Store<IPProtectionState, IPProtectionAction>(initialState, reducer, middleware)
