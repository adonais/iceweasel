/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.home.sports.MatchCard
import org.mozilla.fenix.home.sports.SportCardErrorState
import org.mozilla.fenix.home.sports.Team
import org.mozilla.fenix.home.sports.fake.FakeMatchCardScenario

class SportsWidgetTest {

    // --- Phase 2 (isOneWeekToWorldCup) error suppression ---

    @Test
    fun `GIVEN phase 2 and cached matches WHEN error is set THEN error is suppressed and pager keeps cached schedule`() {
        val cached = FakeMatchCardScenario.Scheduled.build()

        val result = invokeSportsCardPages(
            isOneWeekToWorldCup = true,
            isFollowTeamsCardShown = true,
            matchCardStates = cached,
            errorState = SportCardErrorState.ConnectionInterrupted,
        )

        // Promo page + the cached match cards; the error must not surface.
        assertEquals(cached.size + 1, result.pages.size)
        assertTrue(result.errorPageIndices.isEmpty())
    }

    @Test
    fun `GIVEN phase 2 and cached matches WHEN error is set with LoadFailed THEN error is suppressed`() {
        val cached = FakeMatchCardScenario.Scheduled.build()

        val result = invokeSportsCardPages(
            isOneWeekToWorldCup = true,
            isFollowTeamsCardShown = true,
            matchCardStates = cached,
            errorState = SportCardErrorState.LoadFailed,
        )

        assertTrue(result.errorPageIndices.isEmpty())
        assertEquals(cached.size + 1, result.pages.size)
    }

    @Test
    fun `GIVEN phase 2 and empty cache WHEN error is set THEN pager collapses to a single error card`() {
        val result = invokeSportsCardPages(
            isOneWeekToWorldCup = true,
            isFollowTeamsCardShown = true,
            matchCardStates = emptyList(),
            errorState = SportCardErrorState.ConnectionInterrupted,
        )

        assertEquals(setOf(0), result.errorPageIndices)
        assertEquals(1, result.pages.size)
    }

    // --- Regression guards for the unchanged paths ---

    @Test
    fun `GIVEN world cup started with cached matches and no live match WHEN error is set THEN pager still collapses`() {
        // hasWorldCupStarted == true is modelled by isOneWeekToWorldCup == false in the
        // sportsCardPages signature; the phase 2 short-circuit must not fire here.
        val cached = FakeMatchCardScenario.Scheduled.build()

        val result = invokeSportsCardPages(
            isOneWeekToWorldCup = false,
            isFollowTeamsCardShown = false,
            matchCardStates = cached,
            errorState = SportCardErrorState.LoadFailed,
        )

        assertEquals(setOf(0), result.errorPageIndices)
        assertEquals(1, result.pages.size)
    }

    @Test
    fun `GIVEN world cup started with a live match WHEN error is set THEN pager keeps match cards for in-line swap`() {
        val live = FakeMatchCardScenario.Live.build()

        val result = invokeSportsCardPages(
            isOneWeekToWorldCup = false,
            isFollowTeamsCardShown = false,
            matchCardStates = live,
            errorState = SportCardErrorState.LoadFailed,
        )

        // No collapse — the live MatchCard handles the in-line error swap and the
        // surrounding pages keep their normal content.
        assertTrue(result.errorPageIndices.isEmpty())
        assertEquals(live.size, result.pages.size)
    }

    @Test
    fun `GIVEN phase 2 with cached matches WHEN no error THEN pager renders promo plus match cards normally`() {
        val cached = FakeMatchCardScenario.Scheduled.build()

        val result = invokeSportsCardPages(
            isOneWeekToWorldCup = true,
            isFollowTeamsCardShown = true,
            matchCardStates = cached,
            errorState = null,
        )

        assertTrue(result.errorPageIndices.isEmpty())
        assertEquals(cached.size + 1, result.pages.size)
    }

    private fun invokeSportsCardPages(
        isOneWeekToWorldCup: Boolean,
        isFollowTeamsCardShown: Boolean,
        matchCardStates: List<MatchCard>,
        errorState: SportCardErrorState?,
        selectedTeam: Team? = null,
    ): SportsCardPagesResult = sportsCardPages(
        isOneWeekToWorldCup = isOneWeekToWorldCup,
        isFollowTeamsCardShown = isFollowTeamsCardShown,
        selectedTeam = selectedTeam,
        matchCardStates = matchCardStates,
        errorState = errorState,
        onFollowTeam = {},
        onGetCustomWallpaper = {},
        onRemove = {},
        onRefresh = {},
        onMatchClicked = { _, _, _ -> },
    )
}
