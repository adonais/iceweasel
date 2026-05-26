/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.R
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.test.assertIs

class MatchCardBuilderTest {

    private val zone = ZoneId.of("America/New_York")

    // region buildForTeam

    @Test
    fun `buildForTeam GIVEN empty result THEN returns empty cards`() {
        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(previous = emptyList(), current = emptyList(), next = emptyList()),
        )
        assertTrue(cards.isEmpty())
    }

    @Test
    fun `buildForTeam GIVEN all group stage matches THEN one combined card`() {
        val past = sportsMatch(id = 1L, status = MatchStatus.Final, homeScore = 1, awayScore = 0)
        val live = sportsMatch(id = 2L, status = MatchStatus.Live(period = "1", clock = "30"))
        val upcoming = sportsMatch(id = 3L, status = MatchStatus.Scheduled)

        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(
                previous = listOf(past),
                current = listOf(live),
                next = listOf(upcoming),
            ),
        )

        assertEquals(1, cards.size)
        val card = cards[0]
        assertEquals(TournamentRound.GROUP_STAGE, card.round)
        assertEquals(listOf(2L), card.matches.map { it.globalEventId })
        assertEquals(listOf(1L, 3L), card.relatedMatches.map { it.globalEventId })
    }

    @Test
    fun `buildForTeam GIVEN knockout matches THEN live before past before upcoming`() {
        val r32 = sportsMatch(
            id = 1L,
            stage = TournamentRound.ROUND_OF_32,
            status = MatchStatus.Final,
            homeScore = 2,
            awayScore = 1,
        )
        val r16 = sportsMatch(
            id = 2L,
            stage = TournamentRound.ROUND_OF_16,
            status = MatchStatus.Live(period = "1", clock = "10"),
        )
        val qf = sportsMatch(
            id = 3L,
            stage = TournamentRound.QUARTER_FINAL,
            status = MatchStatus.Scheduled,
        )

        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(previous = listOf(r32), current = listOf(r16), next = listOf(qf)),
        )

        assertEquals(3, cards.size)
        assertEquals(TournamentRound.ROUND_OF_16, cards[0].round) // live first
        assertEquals(TournamentRound.ROUND_OF_32, cards[1].round) // then past
        assertEquals(TournamentRound.QUARTER_FINAL, cards[2].round) // then upcoming
        cards.forEach {
            assertEquals(1, it.matches.size)
            assertTrue(it.relatedMatches.isEmpty())
        }
    }

    @Test
    fun `buildForTeam GIVEN mixed stages with past group and upcoming knockout THEN past card before upcoming card`() {
        val g1 = sportsMatch(
            id = 1L,
            stage = TournamentRound.GROUP_STAGE,
            status = MatchStatus.Final,
            homeScore = 1,
            awayScore = 0,
            date = zonedDateTime(2026, 6, 12, 18),
        )
        val g2 = sportsMatch(
            id = 2L,
            stage = TournamentRound.GROUP_STAGE,
            status = MatchStatus.Final,
            homeScore = 2,
            awayScore = 0,
            date = zonedDateTime(2026, 6, 17, 18),
        )
        val ko = sportsMatch(
            id = 3L,
            stage = TournamentRound.ROUND_OF_16,
            status = MatchStatus.Scheduled,
            date = zonedDateTime(2026, 7, 5, 17),
        )

        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(previous = listOf(g1, g2), current = emptyList(), next = listOf(ko)),
        )

        assertEquals(2, cards.size)
        assertEquals(TournamentRound.GROUP_STAGE, cards[0].round)
        // Group card features the most recent past since there's no live or upcoming group match.
        assertEquals(listOf(2L), cards[0].matches.map { it.globalEventId })
        assertEquals(listOf(1L), cards[0].relatedMatches.map { it.globalEventId })
        assertEquals(TournamentRound.ROUND_OF_16, cards[1].round)
        assertEquals(listOf(3L), cards[1].matches.map { it.globalEventId })
    }

    @Test
    fun `buildForTeam GIVEN group stage with no live but upcoming matches THEN next upcoming is featured`() {
        val past = sportsMatch(
            id = 1L,
            stage = TournamentRound.GROUP_STAGE,
            status = MatchStatus.Final,
            homeScore = 1,
            awayScore = 0,
            date = zonedDateTime(2026, 6, 12, 18),
        )
        val nextUpcoming = sportsMatch(
            id = 2L,
            stage = TournamentRound.GROUP_STAGE,
            status = MatchStatus.Scheduled,
            date = zonedDateTime(2026, 6, 17, 18),
        )
        val laterUpcoming = sportsMatch(
            id = 3L,
            stage = TournamentRound.GROUP_STAGE,
            status = MatchStatus.Scheduled,
            date = zonedDateTime(2026, 6, 22, 18),
        )

        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(
                previous = listOf(past),
                current = emptyList(),
                next = listOf(nextUpcoming, laterUpcoming),
            ),
        )

        assertEquals(1, cards.size)
        assertEquals(TournamentRound.GROUP_STAGE, cards[0].round)
        assertEquals(listOf(2L), cards[0].matches.map { it.globalEventId })
        assertEquals(listOf(1L, 3L), cards[0].relatedMatches.map { it.globalEventId })
    }

    @Test
    fun `buildForTeam GIVEN group stage with only past matches THEN most recent past is featured`() {
        val earlier = sportsMatch(
            id = 1L,
            stage = TournamentRound.GROUP_STAGE,
            status = MatchStatus.Final,
            homeScore = 1,
            awayScore = 0,
            date = zonedDateTime(2026, 6, 12, 18),
        )
        val recent = sportsMatch(
            id = 2L,
            stage = TournamentRound.GROUP_STAGE,
            status = MatchStatus.Final,
            homeScore = 2,
            awayScore = 1,
            date = zonedDateTime(2026, 6, 22, 18),
        )

        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(
                previous = listOf(earlier, recent),
                current = emptyList(),
                next = emptyList(),
            ),
        )

        assertEquals(1, cards.size)
        assertEquals(listOf(2L), cards[0].matches.map { it.globalEventId })
        assertEquals(listOf(1L), cards[0].relatedMatches.map { it.globalEventId })
    }

    @Test
    fun `buildForTeam GIVEN penalties match THEN live knockout card comes before past group card`() {
        val g1 = sportsMatch(id = 1L, stage = TournamentRound.GROUP_STAGE, status = MatchStatus.Final)
        val r32 = sportsMatch(
            id = 2L,
            stage = TournamentRound.ROUND_OF_32,
            status = MatchStatus.Penalties(homePenalty = 3, awayPenalty = 2),
        )
        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(previous = listOf(g1), current = listOf(r32), next = emptyList()),
        )
        assertEquals(2, cards.size)
        assertEquals(TournamentRound.ROUND_OF_32, cards[0].round) // Penalties counted as live
        assertEquals(TournamentRound.GROUP_STAGE, cards[1].round)
    }

    // endregion

    // region buildForNoTeam

    @Test
    fun `buildForNoTeam GIVEN empty THEN empty pager`() {
        val cards = MatchCardBuilder.buildForNoTeam(matches = emptyList())
        assertTrue(cards.isEmpty())
    }

    @Test
    fun `buildForNoTeam GIVEN group stage matches across days THEN one card per date in chronological order`() {
        val day1Early = sportsMatch(id = 1L, date = zonedDateTime(2026, 6, 13, 14))
        val day1Late = sportsMatch(id = 2L, date = zonedDateTime(2026, 6, 13, 18))
        val day2 = sportsMatch(id = 3L, date = zonedDateTime(2026, 6, 14, 14))

        val cards = MatchCardBuilder.buildForNoTeam(
            matches = listOf(day1Early, day1Late, day2),
        )

        assertEquals(2, cards.size)
        assertEquals(listOf(1L, 2L), cards[0].matches.map { it.globalEventId })
        assertTrue(cards[0].relatedMatches.isEmpty())
        assertEquals(listOf(3L), cards[1].matches.map { it.globalEventId })
        assertTrue(cards[1].relatedMatches.isEmpty())
    }

    @Test
    fun `buildForNoTeam GIVEN multiple matches on one day THEN single card lists them all`() {
        val past = sportsMatch(
            id = 1L,
            date = zonedDateTime(2026, 6, 12, 9),
            status = MatchStatus.Final,
            homeScore = 1,
            awayScore = 1,
        )
        val live = sportsMatch(
            id = 2L,
            date = zonedDateTime(2026, 6, 12, 14),
            status = MatchStatus.Live(period = "2", clock = "60"),
        )
        val future = sportsMatch(
            id = 3L,
            date = zonedDateTime(2026, 6, 12, 20),
            status = MatchStatus.Scheduled,
        )

        val cards = MatchCardBuilder.buildForNoTeam(
            matches = listOf(past, live, future),
        )

        assertEquals(1, cards.size)
        assertEquals(listOf(1L, 2L, 3L), cards[0].matches.map { it.globalEventId })
        assertTrue(cards[0].relatedMatches.isEmpty())
    }

    @Test
    fun `buildForNoTeam GIVEN only past matches on different days THEN one card per date in chronological order`() {
        val past1 = sportsMatch(
            id = 1L,
            date = zonedDateTime(2026, 6, 10, 18),
            status = MatchStatus.Final,
            homeScore = 1,
            awayScore = 0,
        )
        val past2 = sportsMatch(
            id = 2L,
            date = zonedDateTime(2026, 6, 15, 18),
            status = MatchStatus.Final,
            homeScore = 2,
            awayScore = 1,
        )

        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(past1, past2))

        assertEquals(2, cards.size)
        assertEquals(listOf(1L), cards[0].matches.map { it.globalEventId })
        assertEquals(listOf(2L), cards[1].matches.map { it.globalEventId })
    }

    @Test
    fun `buildForNoTeam GIVEN knockout matches across days THEN live date before upcoming date`() {
        val d1a = sportsMatch(
            id = 1L,
            stage = TournamentRound.ROUND_OF_16,
            date = zonedDateTime(2026, 7, 4, 17),
            status = MatchStatus.Scheduled,
        )
        val d1b = sportsMatch(
            id = 2L,
            stage = TournamentRound.ROUND_OF_16,
            date = zonedDateTime(2026, 7, 4, 20),
            status = MatchStatus.Scheduled,
        )
        val d2 = sportsMatch(
            id = 3L,
            stage = TournamentRound.ROUND_OF_16,
            date = zonedDateTime(2026, 7, 5, 17),
            status = MatchStatus.Live(period = "1", clock = "5"),
        )

        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(d1a, d1b, d2))

        assertEquals(2, cards.size)
        assertEquals(listOf(3L), cards[0].matches.map { it.globalEventId }) // live day first
        assertEquals(listOf(1L, 2L), cards[1].matches.map { it.globalEventId }) // upcoming day after
        assertEquals(TournamentRound.ROUND_OF_16, cards[0].round)
        assertEquals(TournamentRound.ROUND_OF_16, cards[1].round)
        cards.forEach { assertTrue(it.relatedMatches.isEmpty()) }
    }

    // endregion

    // region ordering

    @Test
    fun `ordering GIVEN no live but past and upcoming exist THEN past comes before upcoming`() {
        val r32 = sportsMatch(
            id = 1L,
            stage = TournamentRound.ROUND_OF_32,
            status = MatchStatus.Final,
            homeScore = 1,
            awayScore = 0,
        )
        val r16 = sportsMatch(
            id = 2L,
            stage = TournamentRound.ROUND_OF_16,
            status = MatchStatus.Scheduled,
        )

        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(previous = listOf(r32), current = emptyList(), next = listOf(r16)),
        )

        assertEquals(2, cards.size)
        assertEquals(TournamentRound.ROUND_OF_32, cards[0].round)
        assertEquals(TournamentRound.ROUND_OF_16, cards[1].round)
    }

    @Test
    fun `ordering GIVEN only past matches THEN chronological order preserved`() {
        val earlier = sportsMatch(
            id = 1L,
            stage = TournamentRound.ROUND_OF_32,
            date = zonedDateTime(2026, 6, 20, 18),
            status = MatchStatus.Final,
            homeScore = 1,
            awayScore = 0,
        )
        val later = sportsMatch(
            id = 2L,
            stage = TournamentRound.ROUND_OF_16,
            date = zonedDateTime(2026, 6, 28, 18),
            status = MatchStatus.Final,
            homeScore = 2,
            awayScore = 1,
        )

        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(previous = listOf(earlier, later), current = emptyList(), next = emptyList()),
        )

        assertEquals(2, cards.size)
        assertEquals(TournamentRound.ROUND_OF_32, cards[0].round)
        assertEquals(TournamentRound.ROUND_OF_16, cards[1].round)
    }

    // endregion

    // region celebration outcome

    @Test
    fun `viewerOutcome GIVEN decided final via buildForTeam THEN TournamentWinner carries the winning team`() {
        // CAN home, AUS away. Regulation 1-1, penalties 4-3 → CAN wins.
        val finalMatch = sportsMatch(
            id = 1L,
            stage = TournamentRound.FINAL,
            homeKey = "CAN",
            awayKey = "AUS",
            status = MatchStatus.FinalAfterPenalties(homePenalty = 4, awayPenalty = 3),
            homeScore = 1,
            awayScore = 1,
            homePenalty = 4,
            awayPenalty = 3,
        )
        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(previous = listOf(finalMatch), current = emptyList(), next = emptyList()),
        )
        val outcome = cards[0].viewerOutcome
        assertIs<FollowedTeamOutcome.TournamentWinner>(outcome)
        assertEquals("CAN", outcome.winner.key)
    }

    @Test
    fun `viewerOutcome GIVEN decided final via buildForNoTeam THEN TournamentWinner carries the winning team`() {
        val finalMatch = sportsMatch(
            id = 1L,
            stage = TournamentRound.FINAL,
            homeKey = "CAN",
            awayKey = "AUS",
            status = MatchStatus.FinalAfterPenalties(homePenalty = 4, awayPenalty = 3),
            homeScore = 1,
            awayScore = 1,
            homePenalty = 4,
            awayPenalty = 3,
        )
        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(finalMatch))
        assertEquals(1, cards.size)
        val outcome = cards[0].viewerOutcome
        assertIs<FollowedTeamOutcome.TournamentWinner>(outcome)
        assertEquals("CAN", outcome.winner.key)
    }

    @Test
    fun `viewerOutcome GIVEN final where away team wins THEN winner is the away team`() {
        // CAN home, AUS away. Regulation 0-2 → AUS wins outright.
        val finalMatch = sportsMatch(
            id = 1L,
            stage = TournamentRound.FINAL,
            homeKey = "CAN",
            awayKey = "AUS",
            status = MatchStatus.Final,
            homeScore = 0,
            awayScore = 2,
        )
        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(finalMatch))
        val outcome = cards[0].viewerOutcome
        assertIs<FollowedTeamOutcome.TournamentWinner>(outcome)
        assertEquals("AUS", outcome.winner.key)
    }

    @Test
    fun `viewerOutcome GIVEN decided third-place playoff THEN ThirdPlace carries the winning team`() {
        // USA home, PAR away. Regulation 8-5 → USA wins the playoff.
        val playoff = sportsMatch(
            id = 1L,
            stage = TournamentRound.THIRD_PLACE_PLAYOFF,
            homeKey = "USA",
            awayKey = "PAR",
            status = MatchStatus.Final,
            homeScore = 8,
            awayScore = 5,
        )
        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(playoff))
        assertEquals(1, cards.size)
        val outcome = cards[0].viewerOutcome
        assertIs<FollowedTeamOutcome.ThirdPlace>(outcome)
        assertEquals("USA", outcome.winner.key)
    }

    @Test
    fun `viewerOutcome GIVEN scheduled final (not yet decided) THEN NotInvolved`() {
        val finalMatch = sportsMatch(
            id = 1L,
            stage = TournamentRound.FINAL,
            status = MatchStatus.Scheduled,
        )
        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(finalMatch))
        assertEquals(FollowedTeamOutcome.NotInvolved, cards[0].viewerOutcome)
    }

    @Test
    fun `viewerOutcome GIVEN decided quarter-final THEN NotInvolved (only FINAL and THIRD_PLACE_PLAYOFF celebrate)`() {
        val qf = sportsMatch(
            id = 1L,
            stage = TournamentRound.QUARTER_FINAL,
            status = MatchStatus.Final,
            homeScore = 2,
            awayScore = 1,
        )
        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(previous = listOf(qf), current = emptyList(), next = emptyList()),
        )
        assertEquals(FollowedTeamOutcome.NotInvolved, cards[0].viewerOutcome)
    }

    // endregion

    // region key normalization

    @Test
    fun `toTeam GIVEN unknown key THEN preserve key and produce zero flagResId`() {
        val match = sportsMatch(id = 1L, homeKey = "XYZ", awayKey = "USA")
        val home = MatchCardBuilder.buildForNoTeam(listOf(match))
            .first()
            .matches
            .first()
            .home
        assertEquals("XYZ", home?.key)
        assertEquals(0, home?.flagResId)
    }

    @Test
    fun `toTeam GIVEN FIFA key already matches Region THEN pass through`() {
        val match = sportsMatch(id = 1L, homeKey = "ENG", awayKey = "BRA")
        val ui = MatchCardBuilder.buildForNoTeam(listOf(match))
            .first()
            .matches
            .first()
        assertEquals("ENG", ui.home?.key)
        assertEquals(R.drawable.flag_eng, ui.home?.flagResId)
        assertEquals("BRA", ui.away?.key)
        assertEquals(R.drawable.flag_br, ui.away?.flagResId)
    }

    // endregion

    // region helpers

    private fun zonedDateTime(year: Int, month: Int, day: Int, hour: Int): ZonedDateTime =
        ZonedDateTime.of(year, month, day, hour, 0, 0, 0, zone)

    private fun sportsMatch(
        id: Long,
        date: ZonedDateTime = zonedDateTime(2026, 6, 12, 18),
        homeKey: String = "USA",
        awayKey: String = "MEX",
        status: MatchStatus = MatchStatus.Scheduled,
        stage: TournamentRound = TournamentRound.GROUP_STAGE,
        homeScore: Int? = null,
        awayScore: Int? = null,
        homePenalty: Int? = null,
        awayPenalty: Int? = null,
        homeEliminated: Boolean = false,
        awayEliminated: Boolean = false,
    ): SportsMatch = SportsMatch(
        globalEventId = id,
        date = date,
        homeTeam = SportsTeam(
            key = homeKey,
            globalTeamId = 0L,
            name = homeKey,
            region = homeKey,
            iconUrl = null,
            group = null,
            eliminated = homeEliminated,
        ),
        awayTeam = SportsTeam(
            key = awayKey,
            globalTeamId = 0L,
            name = awayKey,
            region = awayKey,
            iconUrl = null,
            group = null,
            eliminated = awayEliminated,
        ),
        matchStatus = status,
        homeScore = homeScore,
        awayScore = awayScore,
        homeExtra = null,
        awayExtra = null,
        homePenalty = homePenalty,
        awayPenalty = awayPenalty,
        clock = null,
        period = null,
        updated = null,
        venue = null,
        stage = stage,
    )

    // endregion
}
