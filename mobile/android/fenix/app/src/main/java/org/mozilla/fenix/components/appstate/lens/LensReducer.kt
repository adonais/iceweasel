/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.lens

import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState

/**
 * A [AppAction.LensAction] reducer that updates [AppState.lensState].
 */
object LensReducer {

    /**
     * Reduces [AppAction.LensAction]s to produce a new [AppState].
     */
    fun reduce(state: AppState, action: AppAction.LensAction): AppState = when (action) {
        AppAction.LensAction.LensRequested -> state.copy(
            lensState = LensState(isRequesting = true, inProgress = false, resultUrl = null),
        )
        AppAction.LensAction.LensRequestConsumed -> state.copy(
            lensState = LensState(isRequesting = false, inProgress = true, resultUrl = null),
        )
        AppAction.LensAction.LensDismissed -> state.copy(
            lensState = LensState.DEFAULT,
        )
        is AppAction.LensAction.LensResultAvailable -> state.copy(
            lensState = LensState(isRequesting = false, inProgress = false, resultUrl = action.url),
        )
        AppAction.LensAction.LensResultConsumed -> state.copy(
            lensState = LensState.DEFAULT,
        )
    }
}
