/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.SportsWidgetAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.components.appstate.sports.SportsWidgetState
import java.time.ZoneId
import java.time.ZonedDateTime

class SportsWidgetMiddlewareTest {

    private val zone = ZoneId.of("America/New_York")

    @Test
    fun `GIVEN FetchMatches WHEN repo succeeds THEN dispatches MatchCardStateUpdated`() = runTest {
        val repo = StubRepository(Result.success(resultWithMatches()))
        val store = appStore(repo)

        store.dispatchAndAwait(SportsWidgetAction.FetchMatches)

        assertEquals(1, repo.fetchCount)
        assertTrue(store.state.sportsWidgetState.matchCardStates.isNotEmpty())
    }

    @Test
    fun `GIVEN FetchMatches WHEN repo fails THEN dispatches FetchFailed`() = runTest {
        val repo = StubRepository(Result.failure(RuntimeException("boom")))
        val store = appStore(repo)

        store.dispatchAndAwait(SportsWidgetAction.FetchMatches)

        assertEquals(SportCardErrorState.LoadFailed, store.state.sportsWidgetState.errorState)
    }

    @Test
    fun `GIVEN no cache WHEN CountriesSelected dispatched THEN fetches fresh`() = runTest {
        val repo = StubRepository(Result.success(resultWithMatches()))
        val store = appStore(repo)

        store.dispatchAndAwait(SportsWidgetAction.CountriesSelected(setOf("USA")))

        assertEquals(1, repo.fetchCount)
    }

    @Test
    fun `GIVEN cache present WHEN CountriesSelected dispatched THEN reuses cache without fetching`() = runTest {
        val repo = StubRepository(Result.success(resultWithMatches()))
        val store = appStore(repo)

        store.dispatchAndAwait(SportsWidgetAction.FetchMatches)
        val baselineFetches = repo.fetchCount
        store.dispatchAndAwait(SportsWidgetAction.CountriesSelected(setOf("USA")))

        assertEquals(baselineFetches, repo.fetchCount)
        assertTrue(store.state.sportsWidgetState.matchCardStates.isNotEmpty())
    }

    @Test
    fun `GIVEN cache present WHEN CountriesSelected with unrelated team THEN cards filtered to empty`() = runTest {
        val repo = StubRepository(Result.success(resultWithMatches()))
        val store = appStore(repo)

        store.dispatchAndAwait(SportsWidgetAction.FetchMatches)
        store.dispatchAndAwait(SportsWidgetAction.CountriesSelected(setOf("JPN")))

        // No matches in our fixture involve JPN, so buildForTeam yields zero cards.
        assertEquals(0, store.state.sportsWidgetState.matchCardStates.size)
    }

    @Test
    fun `WHEN OneWeekToWorldCupOverrideUpdated dispatched THEN triggers a fetch`() = runTest {
        val repo = StubRepository(Result.success(resultWithMatches()))
        val store = appStore(repo)

        store.dispatchAndAwait(
            SportsWidgetAction.OneWeekToWorldCupOverrideUpdated(isOneWeekToWorldCupOverride = true),
        )

        assertEquals(1, repo.fetchCount)
        assertTrue(store.state.sportsWidgetState.matchCardStates.isNotEmpty())
    }

    @Test
    fun `WHEN WorldCupStartedOverrideUpdated dispatched THEN triggers a fetch`() = runTest {
        val repo = StubRepository(Result.success(resultWithMatches()))
        val store = appStore(repo)

        store.dispatchAndAwait(
            SportsWidgetAction.WorldCupStartedOverrideUpdated(hasWorldCupStartedOverride = true),
        )

        assertEquals(1, repo.fetchCount)
    }

    // region helpers

    private fun resultWithMatches(): TeamMatchesResult {
        val mex = SportsTeam("MEX", 1L, "Mexico", "MEX", null, null, false)
        val rsa = SportsTeam("RSA", 2L, "South Africa", "RSA", null, null, false)
        val match = SportsMatch(
            globalEventId = 1L,
            date = ZonedDateTime.of(2026, 6, 11, 14, 0, 0, 0, zone),
            homeTeam = mex,
            awayTeam = rsa,
            matchStatus = MatchStatus.Scheduled,
            homeScore = null,
            awayScore = null,
            homeExtra = null,
            awayExtra = null,
            homePenalty = null,
            awayPenalty = null,
            clock = null,
            period = null,
            updated = null,
            venue = null,
            stage = TournamentRound.GROUP_STAGE,
        )
        return TeamMatchesResult(previous = emptyList(), current = emptyList(), next = listOf(match))
    }

    private fun TestScope.appStore(repo: StubRepository): AppStore {
        val middleware = SportsWidgetMiddleware(
            sportsRepository = repo,
            coroutineScope = CoroutineScope(UnconfinedTestDispatcher(testScheduler)),
        )
        return AppStore(
            initialState = AppState(sportsWidgetState = SportsWidgetState()),
            middlewares = listOf(middleware),
        )
    }

    private suspend fun AppStore.dispatchAndAwait(action: SportsWidgetAction) {
        dispatch(action).join()
    }

    private class StubRepository(private val response: Result<TeamMatchesResult>) : SportsRepository {
        var fetchCount: Int = 0
            private set

        override suspend fun fetchMatches(): Result<TeamMatchesResult> {
            fetchCount += 1
            return response
        }
    }
}
