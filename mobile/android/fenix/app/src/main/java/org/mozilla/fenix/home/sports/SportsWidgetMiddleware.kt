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
 * Reacts to [SportsWidgetAction.FetchMatches] by fetching the full tournament
 * schedule from [sportsRepository] and dispatching the resulting [MatchCard]s.
 * The raw [TeamMatchesResult] is cached in memory so that a follow-up
 * [SportsWidgetAction.CountriesSelected] (the user picks/changes a followed
 * team) can re-derive cards locally without a network round-trip. On cold
 * cache the selection falls through to a fresh fetch.
 *
 * @param sportsRepository [SportsRepository] used to fetch match data.
 * @param coroutineScope [CoroutineScope] used for async fetch operations.
 */
class SportsWidgetMiddleware(
    private val sportsRepository: SportsRepository,
    private val coroutineScope: CoroutineScope = CoroutineScope(Dispatchers.IO),
) : Middleware<AppState, AppAction> {

    @Volatile
    private var cachedMatches: TeamMatchesResult? = null

    override fun invoke(
        store: Store<AppState, AppAction>,
        next: (AppAction) -> Unit,
        action: AppAction,
    ) {
        next(action)

        when (action) {
            is SportsWidgetAction.FetchMatches -> fetchAndBuild(store)
            is SportsWidgetAction.CountriesSelected -> {
                val cached = cachedMatches
                if (cached != null) {
                    store.dispatch(
                        SportsWidgetAction.MatchCardStateUpdated(buildCards(cached, action.countryCodes)),
                    )
                } else {
                    fetchAndBuild(store)
                }
            }
            // Debug-tool overrides change which UI state should render. Trigger a fetch so the
            // pager has data without waiting for the next HomeFragment.onResume.
            is SportsWidgetAction.OneWeekToWorldCupOverrideUpdated,
            is SportsWidgetAction.WorldCupStartedOverrideUpdated,
            -> fetchAndBuild(store)
            else -> Unit
        }
    }

    private fun fetchAndBuild(store: Store<AppState, AppAction>) {
        coroutineScope.launch {
            sportsRepository.fetchMatches()
                .onSuccess { result ->
                    cachedMatches = result
                    val countryCodes = store.state.sportsWidgetState.countriesSelected
                    store.dispatch(SportsWidgetAction.MatchCardStateUpdated(buildCards(result, countryCodes)))
                }
                .onFailure {
                    store.dispatch(SportsWidgetAction.FetchFailed(SportCardErrorState.LoadFailed))
                }
        }
    }

    private fun buildCards(result: TeamMatchesResult, countryCodes: Set<String>): List<MatchCard> =
        if (countryCodes.isEmpty()) {
            MatchCardBuilder.buildForNoTeam(result.previous + result.current + result.next)
        } else {
            MatchCardBuilder.buildForTeam(filterByTeam(result, countryCodes))
        }

    private fun filterByTeam(result: TeamMatchesResult, codes: Set<String>): TeamMatchesResult {
        fun List<SportsMatch>.involving(): List<SportsMatch> =
            filter { it.homeTeam.key in codes || it.awayTeam.key in codes }
        return TeamMatchesResult(
            previous = result.previous.involving(),
            current = result.current.involving(),
            next = result.next.involving(),
        )
    }
}
