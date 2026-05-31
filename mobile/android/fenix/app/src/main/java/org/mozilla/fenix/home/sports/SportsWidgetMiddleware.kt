/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppAction.SportsWidgetAction
import org.mozilla.fenix.components.appstate.AppState

/**
 * [Middleware] that handles side effects for [SportsWidgetAction].
 *
 * Reacts to [SportsWidgetAction.FetchMatches] by fetching match data from [sportsRepository]
 * and dispatching the result. Also triggers a fetch automatically when the user selects
 * countries via [SportsWidgetAction.CountriesSelected].
 *
 * @param sportsRepository [SportsRepository] used to fetch match data.
 * @param coroutineScope [CoroutineScope] used for async fetch operations.
 */
class SportsWidgetMiddleware(
    private val sportsRepository: SportsRepository,
    private val coroutineScope: CoroutineScope = CoroutineScope(Dispatchers.IO),
) : Middleware<AppState, AppAction> {

    override fun invoke(
        store: Store<AppState, AppAction>,
        next: (AppAction) -> Unit,
        action: AppAction,
    ) {
        next(action)

        when (action) {
            is SportsWidgetAction.FetchMatches -> fetchMatches(store)
            is SportsWidgetAction.CountriesSelected -> fetchMatches(store)
            else -> Unit
        }
    }

    private fun fetchMatches(store: Store<AppState, AppAction>) {
        coroutineScope.launch {
            val countryCodes = store.state.sportsWidgetState.countriesSelected
            sportsRepository.fetchMatches(countryCodes)
                .onSuccess { matchCards ->
                    store.dispatch(SportsWidgetAction.MatchCardStateUpdated(matchCards))
                }
                .onFailure {
                    store.dispatch(SportsWidgetAction.FetchFailed(SportCardErrorState.LoadFailed))
                }
        }
    }
}
