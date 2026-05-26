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
 * Connectivity is checked at the dispatch sites of [SportsWidgetAction.FetchMatches];
 * a [SportsWidgetAction.FetchFailed] with [SportCardErrorState.ConnectionInterrupted]
 * is dispatched instead when the device is offline, and [fetchAndBuild] is not invoked.
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
                    store.dispatch(SportsWidgetAction.EliminatedCountriesUpdated(eliminatedCodes(result)))
                }
                .onFailure {
                    store.dispatch(SportsWidgetAction.FetchFailed(SportCardErrorState.LoadFailed))
                }
        }
    }

    private fun eliminatedCodes(result: TeamMatchesResult): Set<String> =
        (result.previous + result.current + result.next)
            .asSequence()
            .flatMap { sequenceOf(it.homeTeam, it.awayTeam) }
            .filter { it.eliminated }
            .map { it.key }
            .toSet()

    private fun buildCards(result: TeamMatchesResult, countryCodes: Set<String>): List<MatchCard> {
        // Once the followed team is out of the tournament, switch to the generic experience
        // (the bracket-wide view) rather than continuing to render an empty team-specific
        // pager. The user's selection is preserved in state — they can still see and
        // change it via the country selector — we just stop rendering as if their team
        // were still in play.
        val effectiveCodes = if (allFollowedTeamsEliminated(result, countryCodes)) {
            emptySet()
        } else {
            countryCodes
        }
        return if (effectiveCodes.isEmpty()) {
            // Filter to the active round before handing to the builder. The response —
            // which spans multiple rounds in the mock and a ±10-day window in prod —
            // would otherwise mix stages in the pager and surface group-stage matches
            // even after R32 has begun.
            val activeRound = result.activeRound() ?: return emptyList()
            MatchCardBuilder.buildForNoTeam(
                (result.previous + result.current + result.next)
                    .filter { it.stage == activeRound },
            )
        } else {
            MatchCardBuilder.buildForTeam(filterByTeam(result, effectiveCodes))
        }
    }

    // The "active" round is the most-advanced round that has at least one match
    // already underway. Priority:
    //   1. A live match's round wins — even if a later round has played matches,
    //      the in-progress game is what the user came to see.
    //   2. Otherwise: the highest-ordinal round with any finished match. This is what
    //      makes the widget hide group stage as soon as the first R32 game has
    //      kicked off, even when no R32 game is live at this exact moment and the
    //      ±10-day window still carries the prior round's matches.
    //   3. Pre-tournament fallback: the round of the soonest upcoming match.
    private fun TeamMatchesResult.activeRound(): TournamentRound? {
        val all = previous + current + next
        return all.firstOrNull { it.matchStatus.isLive() }?.stage
            ?: all.filter { it.matchStatus.isPast() }.maxByOrNull { it.stage.ordinal }?.stage
            ?: all.minByOrNull { it.date }?.stage
    }

    // True when every followed team appears in the response with `eliminated = true`. If a
    // followed code isn't found in the response at all, we treat it as not-eliminated
    // (safe default: keep rendering the team-specific view rather than disappearing it
    // on stale or partial data).
    private fun allFollowedTeamsEliminated(
        result: TeamMatchesResult,
        codes: Set<String>,
    ): Boolean {
        if (codes.isEmpty()) return false
        val allMatches = result.previous + result.current + result.next
        return codes.all { code ->
            val snapshot = allMatches.firstNotNullOfOrNull { match ->
                when (code) {
                    match.homeTeam.key -> match.homeTeam
                    match.awayTeam.key -> match.awayTeam
                    else -> null
                }
            }
            snapshot?.eliminated == true
        }
    }

    private fun filterByTeam(result: TeamMatchesResult, codes: Set<String>): TeamMatchesResult {
        // The followed team's own matches PLUS the bracket-finishing matches (FINAL and
        // THIRD_PLACE_PLAYOFF) so the universal celebration card surfaces in the pager
        // even when the followed team isn't in them.
        fun List<SportsMatch>.relevantFor(codes: Set<String>): List<SportsMatch> =
            filter { match ->
                match.homeTeam.key in codes ||
                    match.awayTeam.key in codes ||
                    match.stage == TournamentRound.FINAL ||
                    match.stage == TournamentRound.THIRD_PLACE_PLAYOFF
            }
        return TeamMatchesResult(
            previous = result.previous.relevantFor(codes),
            current = result.current.relevantFor(codes),
            next = result.next.relevantFor(codes),
        )
    }
}
