/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.browsingmode

import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.utils.Settings

/**
 * A [Middleware] that persists browsing mode changes to [Settings].
 *
 * @param settings [Settings] used to persist the current browsing mode.
 */
class BrowsingModeMiddleware(
    private val settings: Settings,
) : Middleware<AppState, AppAction> {
    override fun invoke(
        store: Store<AppState, AppAction>,
        next: (AppAction) -> Unit,
        action: AppAction,
    ) {
        next(action)

        if (action is AppAction.BrowsingModeManagerModeChanged) {
            settings.lastKnownMode = action.mode
        }
    }
}
