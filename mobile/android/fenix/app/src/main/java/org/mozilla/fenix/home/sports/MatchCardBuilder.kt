/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

private val flagResIdByKey: Map<String, Int> = regionGrouping
    .flatMap { it.teams }
    .associateBy({ it.key }, { it.flagResId })

/**
 * Produces [MatchCard] lists from [MatchesResponseMapper] output.
 *
 * Card-shape rules:
 * - `GROUP_STAGE` matches → one card with live matches in `matches` and the rest in
 *   `relatedMatches`.
 * - Knockout matches (`ROUND_OF_32` onward):
 *   - team path → one card per match;
 *   - no team path → one card per date within the active round.
 *
 * Cards are ordered for the pager as: live cards first, then past cards, then
 * upcoming cards. Within each bucket the original chronological order is preserved.
 * The pager always lands on index 0, which is the live card when one exists.
 */
object MatchCardBuilder {

    /**
     * Path 1 — user has selected a team. Combines previous/current/next into stage-
     * partitioned cards.
     */
    fun buildForTeam(result: TeamMatchesResult): List<MatchCard> {
        val liveIds = result.current.map { it.globalEventId }.toSet()
        val all = (result.previous + result.current + result.next).sortedBy { it.date }
        val (groupMatches, knockoutMatches) = all.partition { it.stage == TournamentRound.GROUP_STAGE }

        val cards = buildList {
            if (groupMatches.isNotEmpty()) {
                add(buildGroupStageCard(groupMatches, liveIds))
            }
            knockoutMatches.forEach { add(buildSingleMatchCard(it)) }
        }
        return cards.orderedForPager()
    }

    /**
     * Path 2 — no team selected. Surfaces the full schedule available in the response as
     * one card per match day, in chronological order. Every match on a given day is rendered
     * inside that day's card; the round label is derived from that day's matches.
     */
    fun buildForNoTeam(matches: List<SportsMatch>): List<MatchCard> {
        if (matches.isEmpty()) return emptyList()
        return buildNoTeamPerDayCards(matches.sortedBy { it.date }).orderedForPager()
    }

    private fun buildGroupStageCard(
        groupMatches: List<SportsMatch>,
        liveIds: Set<Long>,
    ): MatchCard {
        // Featured (enlarged) matches go in `matches`; the rest go in `relatedMatches`.
        // Priority: live > next upcoming > most recent past — so the user always sees the
        // most-actionable game given the selected team's schedule.
        val featured = pickFeaturedMatches(groupMatches, liveIds)
        val featuredIds = featured.map { it.globalEventId }.toSet()
        val featuredUi = featured.map { it.toMatch() }
        val relatedUi = groupMatches
            .filter { it.globalEventId !in featuredIds }
            .map { it.toMatch() }
        return MatchCard(
            matches = featuredUi,
            round = TournamentRound.GROUP_STAGE,
            relatedMatches = relatedUi,
        )
    }

    private fun pickFeaturedMatches(
        matches: List<SportsMatch>,
        liveIds: Set<Long>,
    ): List<SportsMatch> {
        val live = matches.filter { it.globalEventId in liveIds }
        if (live.isNotEmpty()) return live
        // matches is sorted oldest-first; firstOrNull on Scheduled returns the next upcoming,
        // lastOrNull on past returns the most recently played.
        matches.firstOrNull { it.matchStatus is MatchStatus.Scheduled }?.let { return listOf(it) }
        return matches.lastOrNull { it.matchStatus.isPast() }?.let { listOf(it) } ?: emptyList()
    }

    private fun buildSingleMatchCard(match: SportsMatch): MatchCard {
        val ui = match.toMatch()
        return MatchCard(
            matches = listOf(ui),
            round = match.stage,
            viewerOutcome = celebrationOutcomeFor(match.stage, listOf(match)) ?: FollowedTeamOutcome.NotInvolved,
            relatedMatches = emptyList(),
        )
    }

    private fun buildNoTeamPerDayCards(sortedMatches: List<SportsMatch>): List<MatchCard> =
        sortedMatches
            .groupBy { it.date.toLocalDate() }
            .toSortedMap()
            .map { (_, dayMatches) -> buildDayCard(dayMatches, dayMatches.first().stage) }

    // Featured (enlarged) match in `matches`, everything else as compact rows in
    // `relatedMatches`. Featured priority: live > next upcoming > most recent past — same
    // shape the team-selected group-stage card uses, so a day with one live and two
    // scheduled matches renders one big tile + two related rows rather than three big tiles.
    private fun buildDayCard(dayMatches: List<SportsMatch>, round: TournamentRound): MatchCard {
        val liveIds = dayMatches.filter { it.matchStatus.isLive() }.map { it.globalEventId }.toSet()
        val featured = pickFeaturedMatches(dayMatches, liveIds)
        val featuredIds = featured.map { it.globalEventId }.toSet()
        val featuredUi = featured.map { it.toMatch() }
        val relatedUi = dayMatches
            .filter { it.globalEventId !in featuredIds }
            .map { it.toMatch() }
        return MatchCard(
            matches = featuredUi,
            round = round,
            viewerOutcome = celebrationOutcomeFor(round, featured) ?: FollowedTeamOutcome.NotInvolved,
            relatedMatches = relatedUi,
        )
    }
}

private enum class CardBucket { LIVE, PAST, UPCOMING }

private fun MatchCard.bucket(): CardBucket {
    val all = matches + relatedMatches
    return when {
        all.any { it.matchStatus.isLive() } -> CardBucket.LIVE
        all.isNotEmpty() && all.all { it.matchStatus.isPast() } -> CardBucket.PAST
        else -> CardBucket.UPCOMING
    }
}

// Stable bucket sort: live cards first, then past, then upcoming. Within each bucket
// the input order is preserved (callers feed chronological input).
private fun List<MatchCard>.orderedForPager(): List<MatchCard> {
    val live = mutableListOf<MatchCard>()
    val past = mutableListOf<MatchCard>()
    val upcoming = mutableListOf<MatchCard>()
    forEach { card ->
        when (card.bucket()) {
            CardBucket.LIVE -> live += card
            CardBucket.PAST -> past += card
            CardBucket.UPCOMING -> upcoming += card
        }
    }
    return live + past + upcoming
}

// A decided final or third-place playoff always carries the celebration outcome,
// regardless of which team (if any) the viewer follows — the champion card is shown
// universally. The winning team is computed and embedded in the outcome so callers
// don't have to re-derive it from scores. Returns null when this card shouldn't be a
// celebration (wrong stage, no decided match, or no clear winner).
private fun celebrationOutcomeFor(
    stage: TournamentRound,
    matches: List<SportsMatch>,
): FollowedTeamOutcome? {
    val decided = matches.firstOrNull {
        it.matchStatus is MatchStatus.Final || it.matchStatus is MatchStatus.FinalAfterPenalties
    } ?: return null
    val winner = winnerOf(decided)?.toTeam() ?: return null
    return when (stage) {
        TournamentRound.FINAL -> FollowedTeamOutcome.TournamentWinner(winner)
        TournamentRound.THIRD_PLACE_PLAYOFF -> FollowedTeamOutcome.ThirdPlace(winner)
        else -> null
    }
}

// Total = regulation + extra-time + penalty goals. Regulation alone decides a Final that
// ended in 90 minutes; extra-time goals decide an AET match (which also maps to
// MatchStatus.Final since there's no shootout); the penalty diff decides a
// FinalAfterPenalties. Returns null on a tie (which shouldn't happen in a real knockout
// match — defensive guard).
private fun winnerOf(match: SportsMatch): SportsTeam? {
    val homeTotal = (match.homeScore ?: 0) + (match.homeExtra ?: 0) + (match.homePenalty ?: 0)
    val awayTotal = (match.awayScore ?: 0) + (match.awayExtra ?: 0) + (match.awayPenalty ?: 0)
    return when {
        homeTotal > awayTotal -> match.homeTeam
        awayTotal > homeTotal -> match.awayTeam
        else -> null
    }
}

private fun SportsMatch.toMatch(): Match {
    // Read locale at use-time (not class-load) so a runtime locale change is reflected,
    // and use ofLocalizedTime for proper 12h/24h selection per locale.
    val locale = Locale.getDefault()
    return Match(
        globalEventId = globalEventId,
        date = DateTimeFormatter.ofPattern("MMM d").withLocale(locale).format(date),
        time = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(date),
        home = homeTeam?.toTeam(),
        away = awayTeam?.toTeam(),
        matchStatus = matchStatus,
        homeScore = homeScore,
        awayScore = awayScore,
        homePenalty = homePenalty,
        awayPenalty = awayPenalty,
        clock = clock,
        period = period,
        updated = updated,
    )
}

private fun SportsTeam.toTeam(): Team = Team(
    key = key,
    flagResId = flagResIdByKey[key] ?: 0,
    globalTeamId = globalTeamId,
    name = name,
    region = region,
    iconUrl = iconUrl,
    group = parseGroup(group),
    eliminated = eliminated,
)

private fun parseGroup(raw: String?): Group? {
    val cleaned = raw?.trim()?.removePrefix("Group")?.trim() ?: return null
    if (cleaned.isEmpty()) return null
    val letter = cleaned.first().uppercaseChar().toString()
    return runCatching { Group.valueOf(letter) }.getOrNull()
}
