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
    fun `buildForTeam GIVEN a match with undetermined teams THEN null teams pass through to the UI`() {
        val tbd = sportsMatch(
            id = 1L,
            stage = TournamentRound.SEMI_FINAL,
            status = MatchStatus.Scheduled,
            homeKey = null,
            awayKey = null,
        )

        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(previous = emptyList(), current = emptyList(), next = listOf(tbd)),
        )

        val match = cards.single().matches.single()
        assertEquals(null, match.home)
        assertEquals(null, match.away)
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
        // No live match: featured falls back to the most-recent past (g2); older sibling collapses to related.
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
        // Day 1: soonest scheduled is featured, sibling collapses to a related row.
        assertEquals(listOf(1L), cards[0].matches.map { it.globalEventId })
        assertEquals(listOf(2L), cards[0].relatedMatches.map { it.globalEventId })
        // Day 2: lone match is featured, no siblings.
        assertEquals(listOf(3L), cards[1].matches.map { it.globalEventId })
        assertTrue(cards[1].relatedMatches.isEmpty())
    }

    @Test
    fun `buildForNoTeam GIVEN multiple matches on one day THEN live is featured and others are related`() {
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
        assertEquals(listOf(2L), cards[0].matches.map { it.globalEventId })
        assertEquals(listOf(1L, 3L), cards[0].relatedMatches.map { it.globalEventId })
    }

    @Test
    fun `buildForNoTeam GIVEN only past matches on different days THEN one card per date in reverse-chronological order`() {
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

        // Past cards surface newest first so the most recent result sits closest to the
        // celebration cards (or the top of the pager when no celebration exists).
        assertEquals(2, cards.size)
        assertEquals(listOf(2L), cards[0].matches.map { it.globalEventId })
        assertEquals(listOf(1L), cards[1].matches.map { it.globalEventId })
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
        // Live day comes first; its lone live match is featured with no siblings.
        assertEquals(listOf(3L), cards[0].matches.map { it.globalEventId })
        assertTrue(cards[0].relatedMatches.isEmpty())
        // Upcoming day: soonest scheduled is featured, the sibling collapses to a related row.
        assertEquals(listOf(1L), cards[1].matches.map { it.globalEventId })
        assertEquals(listOf(2L), cards[1].relatedMatches.map { it.globalEventId })
        assertEquals(TournamentRound.ROUND_OF_16, cards[0].round)
        assertEquals(TournamentRound.ROUND_OF_16, cards[1].round)
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
    fun `ordering GIVEN only past matches THEN reverse-chronological order`() {
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
        assertEquals(TournamentRound.ROUND_OF_16, cards[0].round)
        assertEquals(TournamentRound.ROUND_OF_32, cards[1].round)
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
    fun `viewerOutcome GIVEN final decided in extra time THEN TournamentWinner uses ET goals to break the regulation tie`() {
        // CAN home, AUS away. Regulation 2-2 (tied), extra time 1-0 → CAN wins in AET.
        // Per MatchesResponseMapper.mapPastStatus, AET collapses to MatchStatus.Final
        // (only "FT(P)" maps to FinalAfterPenalties), so winnerOf must consult the
        // home_extra / away_extra fields to disambiguate.
        val finalMatch = sportsMatch(
            id = 1L,
            stage = TournamentRound.FINAL,
            homeKey = "CAN",
            awayKey = "AUS",
            status = MatchStatus.Final,
            homeScore = 2,
            awayScore = 2,
            homeExtra = 1,
            awayExtra = 0,
        )
        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(finalMatch))
        val outcome = cards[0].viewerOutcome
        assertIs<FollowedTeamOutcome.TournamentWinner>(outcome)
        assertEquals("CAN", outcome.winner.key)
    }

    @Test
    fun `viewerOutcome GIVEN third-place playoff decided in extra time THEN ThirdPlace uses ET goals`() {
        val playoff = sportsMatch(
            id = 1L,
            stage = TournamentRound.THIRD_PLACE_PLAYOFF,
            homeKey = "USA",
            awayKey = "PAR",
            status = MatchStatus.Final,
            homeScore = 1,
            awayScore = 1,
            homeExtra = 0,
            awayExtra = 1,
        )
        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(playoff))
        val outcome = cards[0].viewerOutcome
        assertIs<FollowedTeamOutcome.ThirdPlace>(outcome)
        assertEquals("PAR", outcome.winner.key)
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

    // region pager ordering — end-of-tournament narrative

    // Helpers for the seven ordering scenarios. Match dates are spread across the
    // tournament timeline so reverse-chronological sorting is observable.
    private fun teamGroupMatch(date: ZonedDateTime, status: MatchStatus, id: Long): SportsMatch =
        sportsMatch(id = id, stage = TournamentRound.GROUP_STAGE, status = status, date = date)

    private fun teamKoMatch(
        id: Long,
        stage: TournamentRound,
        date: ZonedDateTime,
        status: MatchStatus,
        homeScore: Int? = null,
        awayScore: Int? = null,
    ): SportsMatch = sportsMatch(
        id = id,
        stage = stage,
        status = status,
        date = date,
        homeKey = "USA",
        awayKey = "MEX",
        homeScore = homeScore,
        awayScore = awayScore,
    )

    private fun otherKnockoutMatch(
        id: Long,
        stage: TournamentRound,
        date: ZonedDateTime,
        status: MatchStatus,
        homeKey: String,
        awayKey: String,
        homeScore: Int? = null,
        awayScore: Int? = null,
    ): SportsMatch = sportsMatch(
        id = id,
        stage = stage,
        status = status,
        date = date,
        homeKey = homeKey,
        awayKey = awayKey,
        homeScore = homeScore,
        awayScore = awayScore,
    )

    @Test
    fun `pager order GIVEN followed team in live Final with decided TPP THEN live Final then Third Place then team past reverse-chrono`() {
        // S1: USA reaches Final, Final is live Sun. TPP was Sat (decided). Past: Group, R16, QF, SF.
        val group = teamGroupMatch(zonedDateTime(2026, 6, 12, 18), MatchStatus.Final, 1L)
        val r16 = teamKoMatch(2L, TournamentRound.ROUND_OF_16, zonedDateTime(2026, 6, 28, 18), MatchStatus.Final, 2, 1)
        val qf = teamKoMatch(3L, TournamentRound.QUARTER_FINAL, zonedDateTime(2026, 7, 5, 18), MatchStatus.Final, 1, 0)
        val sf = teamKoMatch(4L, TournamentRound.SEMI_FINAL, zonedDateTime(2026, 7, 12, 18), MatchStatus.Final, 2, 0)
        val tpp = otherKnockoutMatch(
            id = 5L,
            stage = TournamentRound.THIRD_PLACE_PLAYOFF,
            date = zonedDateTime(2026, 7, 18, 18),
            status = MatchStatus.Final,
            homeKey = "BRA",
            awayKey = "ARG",
            homeScore = 2,
            awayScore = 1,
        )
        val liveFinal = teamKoMatch(
            id = 6L,
            stage = TournamentRound.FINAL,
            date = zonedDateTime(2026, 7, 19, 18),
            status = MatchStatus.Live(period = "1", clock = "30"),
        )

        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(
                previous = listOf(group, r16, qf, sf, tpp),
                current = listOf(liveFinal),
                next = emptyList(),
            ),
        )

        assertEquals(
            listOf(
                TournamentRound.FINAL,
                TournamentRound.THIRD_PLACE_PLAYOFF,
                TournamentRound.SEMI_FINAL,
                TournamentRound.QUARTER_FINAL,
                TournamentRound.ROUND_OF_16,
                TournamentRound.GROUP_STAGE,
            ),
            cards.map { it.round },
        )
    }

    @Test
    fun `pager order GIVEN no team and Final is live THEN live Final first`() {
        // S2.
        val tpp = otherKnockoutMatch(
            id = 1L,
            stage = TournamentRound.THIRD_PLACE_PLAYOFF,
            date = zonedDateTime(2026, 7, 18, 18),
            status = MatchStatus.Final,
            homeKey = "BRA",
            awayKey = "ARG",
            homeScore = 2,
            awayScore = 1,
        )
        val liveFinal = otherKnockoutMatch(
            id = 2L,
            stage = TournamentRound.FINAL,
            date = zonedDateTime(2026, 7, 19, 18),
            status = MatchStatus.Live(period = "2", clock = "12"),
            homeKey = "USA",
            awayKey = "MEX",
        )

        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(tpp, liveFinal))

        assertEquals(TournamentRound.FINAL, cards[0].round)
        assertEquals(TournamentRound.THIRD_PLACE_PLAYOFF, cards[1].round)
    }

    @Test
    fun `pager order GIVEN followed team in upcoming Final on Friday THEN upcoming TPP then upcoming Final then team past reverse-chrono`() {
        // S3: Friday Jul 17. SF played Tue/Wed. TPP upcoming Sat, Final upcoming Sun.
        val group = teamGroupMatch(zonedDateTime(2026, 6, 12, 18), MatchStatus.Final, 1L)
        val r16 = teamKoMatch(2L, TournamentRound.ROUND_OF_16, zonedDateTime(2026, 6, 28, 18), MatchStatus.Final, 2, 1)
        val qf = teamKoMatch(3L, TournamentRound.QUARTER_FINAL, zonedDateTime(2026, 7, 5, 18), MatchStatus.Final, 1, 0)
        val sf = teamKoMatch(4L, TournamentRound.SEMI_FINAL, zonedDateTime(2026, 7, 14, 18), MatchStatus.Final, 2, 0)
        val tppUpcoming = otherKnockoutMatch(
            id = 5L,
            stage = TournamentRound.THIRD_PLACE_PLAYOFF,
            date = zonedDateTime(2026, 7, 18, 18),
            status = MatchStatus.Scheduled,
            homeKey = "BRA",
            awayKey = "ARG",
        )
        val finalUpcoming = teamKoMatch(
            id = 6L,
            stage = TournamentRound.FINAL,
            date = zonedDateTime(2026, 7, 19, 18),
            status = MatchStatus.Scheduled,
        )

        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(
                previous = listOf(group, r16, qf, sf),
                current = emptyList(),
                next = listOf(tppUpcoming, finalUpcoming),
            ),
        )

        assertEquals(
            listOf(
                TournamentRound.THIRD_PLACE_PLAYOFF,
                TournamentRound.FINAL,
                TournamentRound.SEMI_FINAL,
                TournamentRound.QUARTER_FINAL,
                TournamentRound.ROUND_OF_16,
                TournamentRound.GROUP_STAGE,
            ),
            cards.map { it.round },
        )
    }

    @Test
    fun `pager order GIVEN no team on Friday before TPP and Final THEN upcoming TPP then upcoming Final then SF past reverse-chrono`() {
        // S4: SFs played, TPP+Final upcoming.
        val sf1 = otherKnockoutMatch(
            id = 1L,
            stage = TournamentRound.SEMI_FINAL,
            date = zonedDateTime(2026, 7, 14, 18),
            status = MatchStatus.Final,
            homeKey = "USA",
            awayKey = "MEX",
            homeScore = 2,
            awayScore = 0,
        )
        val sf2 = otherKnockoutMatch(
            id = 2L,
            stage = TournamentRound.SEMI_FINAL,
            date = zonedDateTime(2026, 7, 15, 18),
            status = MatchStatus.Final,
            homeKey = "BRA",
            awayKey = "ARG",
            homeScore = 1,
            awayScore = 0,
        )
        val tpp = otherKnockoutMatch(
            id = 3L,
            stage = TournamentRound.THIRD_PLACE_PLAYOFF,
            date = zonedDateTime(2026, 7, 18, 18),
            status = MatchStatus.Scheduled,
            homeKey = "MEX",
            awayKey = "ARG",
        )
        val finalMatch = otherKnockoutMatch(
            id = 4L,
            stage = TournamentRound.FINAL,
            date = zonedDateTime(2026, 7, 19, 18),
            status = MatchStatus.Scheduled,
            homeKey = "USA",
            awayKey = "BRA",
        )

        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(sf1, sf2, tpp, finalMatch))

        assertEquals(
            listOf(
                TournamentRound.THIRD_PLACE_PLAYOFF,
                TournamentRound.FINAL,
                TournamentRound.SEMI_FINAL,
                TournamentRound.SEMI_FINAL,
            ),
            cards.map { it.round },
        )
        // SF reverse-chrono: sf2 (Jul 15) before sf1 (Jul 14).
        assertEquals(listOf(2L), cards[2].matches.map { it.globalEventId })
        assertEquals(listOf(1L), cards[3].matches.map { it.globalEventId })
    }

    @Test
    fun `pager order GIVEN followed team played the Final and it ended THEN Champion then Third Place then team past reverse-chrono`() {
        // S5: USA played + won Final. TPP decided Sat. All team's KO + Group decided.
        val group = teamGroupMatch(zonedDateTime(2026, 6, 12, 18), MatchStatus.Final, 1L)
        val r16 = teamKoMatch(2L, TournamentRound.ROUND_OF_16, zonedDateTime(2026, 6, 28, 18), MatchStatus.Final, 2, 1)
        val qf = teamKoMatch(3L, TournamentRound.QUARTER_FINAL, zonedDateTime(2026, 7, 5, 18), MatchStatus.Final, 1, 0)
        val sf = teamKoMatch(4L, TournamentRound.SEMI_FINAL, zonedDateTime(2026, 7, 14, 18), MatchStatus.Final, 2, 0)
        val tpp = otherKnockoutMatch(
            id = 5L,
            stage = TournamentRound.THIRD_PLACE_PLAYOFF,
            date = zonedDateTime(2026, 7, 18, 18),
            status = MatchStatus.Final,
            homeKey = "BRA",
            awayKey = "ARG",
            homeScore = 2,
            awayScore = 1,
        )
        val decidedFinal = teamKoMatch(
            id = 6L,
            stage = TournamentRound.FINAL,
            date = zonedDateTime(2026, 7, 19, 18),
            status = MatchStatus.Final,
            homeScore = 3,
            awayScore = 1,
        )

        val cards = MatchCardBuilder.buildForTeam(
            TeamMatchesResult(
                previous = listOf(group, r16, qf, sf, tpp, decidedFinal),
                current = emptyList(),
                next = emptyList(),
            ),
        )

        assertEquals(
            listOf(
                TournamentRound.FINAL,
                TournamentRound.THIRD_PLACE_PLAYOFF,
                TournamentRound.SEMI_FINAL,
                TournamentRound.QUARTER_FINAL,
                TournamentRound.ROUND_OF_16,
                TournamentRound.GROUP_STAGE,
            ),
            cards.map { it.round },
        )
        assertIs<FollowedTeamOutcome.TournamentWinner>(cards[0].viewerOutcome)
        assertIs<FollowedTeamOutcome.ThirdPlace>(cards[1].viewerOutcome)
    }

    @Test
    fun `pager order GIVEN no team and Final ended THEN Champion then Third Place`() {
        // S6.
        val tpp = otherKnockoutMatch(
            id = 1L,
            stage = TournamentRound.THIRD_PLACE_PLAYOFF,
            date = zonedDateTime(2026, 7, 18, 18),
            status = MatchStatus.Final,
            homeKey = "BRA",
            awayKey = "ARG",
            homeScore = 2,
            awayScore = 1,
        )
        val finalMatch = otherKnockoutMatch(
            id = 2L,
            stage = TournamentRound.FINAL,
            date = zonedDateTime(2026, 7, 19, 18),
            status = MatchStatus.Final,
            homeKey = "USA",
            awayKey = "MEX",
            homeScore = 2,
            awayScore = 0,
        )

        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(tpp, finalMatch))

        assertEquals(listOf(TournamentRound.FINAL, TournamentRound.THIRD_PLACE_PLAYOFF), cards.map { it.round })
        assertIs<FollowedTeamOutcome.TournamentWinner>(cards[0].viewerOutcome)
        assertIs<FollowedTeamOutcome.ThirdPlace>(cards[1].viewerOutcome)
    }

    @Test
    fun `pager order GIVEN no team on Saturday after TPP and Final tomorrow THEN Third Place then upcoming Final`() {
        // S7.
        val tpp = otherKnockoutMatch(
            id = 1L,
            stage = TournamentRound.THIRD_PLACE_PLAYOFF,
            date = zonedDateTime(2026, 7, 18, 18),
            status = MatchStatus.Final,
            homeKey = "BRA",
            awayKey = "ARG",
            homeScore = 2,
            awayScore = 1,
        )
        val finalUpcoming = otherKnockoutMatch(
            id = 2L,
            stage = TournamentRound.FINAL,
            date = zonedDateTime(2026, 7, 19, 18),
            status = MatchStatus.Scheduled,
            homeKey = "USA",
            awayKey = "MEX",
        )

        val cards = MatchCardBuilder.buildForNoTeam(matches = listOf(tpp, finalUpcoming))

        assertEquals(listOf(TournamentRound.THIRD_PLACE_PLAYOFF, TournamentRound.FINAL), cards.map { it.round })
        assertIs<FollowedTeamOutcome.ThirdPlace>(cards[0].viewerOutcome)
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
        homeKey: String? = "USA",
        awayKey: String? = "MEX",
        status: MatchStatus = MatchStatus.Scheduled,
        stage: TournamentRound = TournamentRound.GROUP_STAGE,
        homeScore: Int? = null,
        awayScore: Int? = null,
        homeExtra: Int? = null,
        awayExtra: Int? = null,
        homePenalty: Int? = null,
        awayPenalty: Int? = null,
        homeEliminated: Boolean = false,
        awayEliminated: Boolean = false,
    ): SportsMatch = SportsMatch(
        globalEventId = id,
        date = date,
        homeTeam = homeKey?.let { sportsTeam(it, homeEliminated) },
        awayTeam = awayKey?.let { sportsTeam(it, awayEliminated) },
        matchStatus = status,
        homeScore = homeScore,
        awayScore = awayScore,
        homeExtra = homeExtra,
        awayExtra = awayExtra,
        homePenalty = homePenalty,
        awayPenalty = awayPenalty,
        clock = null,
        period = null,
        updated = null,
        venue = null,
        stage = stage,
    )

    private fun sportsTeam(key: String, eliminated: Boolean): SportsTeam = SportsTeam(
        key = key,
        globalTeamId = 0L,
        name = key,
        region = key,
        iconUrl = null,
        group = null,
        eliminated = eliminated,
    )

    // endregion
}
