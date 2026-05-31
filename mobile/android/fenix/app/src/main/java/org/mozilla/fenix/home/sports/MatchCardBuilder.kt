/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import java.time.LocalDate
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
     * Path 2 — no team selected. Renders the next-available day's matches as a single
     * card during the group stage, and one card per date during knockout rounds.
     */
    fun buildForNoTeam(
        matches: List<SportsMatch>,
        today: LocalDate = LocalDate.now(),
    ): List<MatchCard> {
        if (matches.isEmpty()) return emptyList()
        val sorted = matches.sortedBy { it.date }
        val cards = if (sorted.first().stage == TournamentRound.GROUP_STAGE) {
            listOf(buildNoTeamGroupCard(sorted, today))
        } else {
            buildNoTeamKnockoutCards(sorted)
        }
        return cards.orderedForPager()
    }

    private fun buildGroupStageCard(
        groupMatches: List<SportsMatch>,
        liveIds: Set<Long>,
    ): MatchCard {
        val liveUi = groupMatches.filter { it.globalEventId in liveIds }.map { it.toMatch() }
        val relatedUi = groupMatches.filter { it.globalEventId !in liveIds }.map { it.toMatch() }
        return MatchCard(
            matches = liveUi,
            round = TournamentRound.GROUP_STAGE,
            relatedMatches = relatedUi,
        )
    }

    private fun buildSingleMatchCard(match: SportsMatch): MatchCard {
        val ui = match.toMatch()
        val matchesList = listOf(ui)
        return MatchCard(
            matches = matchesList,
            round = match.stage,
            viewerOutcome = celebrationOutcomeFor(match.stage, matchesList) ?: FollowedTeamOutcome.NotInvolved,
            relatedMatches = emptyList(),
        )
    }

    private fun buildNoTeamGroupCard(
        sortedMatches: List<SportsMatch>,
        today: LocalDate,
    ): MatchCard {
        val targetDay = sortedMatches
            .map { it.date.toLocalDate() }
            .firstOrNull { !it.isBefore(today) }
            ?: sortedMatches.last().date.toLocalDate()
        val dayMatches = sortedMatches.filter { it.date.toLocalDate() == targetDay }
        val (live, others) = dayMatches.partition { it.matchStatus.isLive() }
        val liveUi = live.map { it.toMatch() }
        val relatedUi = others.map { it.toMatch() }
        return MatchCard(
            matches = liveUi,
            round = TournamentRound.GROUP_STAGE,
            relatedMatches = relatedUi,
        )
    }

    private fun buildNoTeamKnockoutCards(sortedMatches: List<SportsMatch>): List<MatchCard> {
        val round = sortedMatches.first().stage
        return sortedMatches
            .groupBy { it.date.toLocalDate() }
            .toSortedMap()
            .map { (_, dayMatches) ->
                val uiMatches = dayMatches.map { it.toMatch() }
                MatchCard(
                    matches = uiMatches,
                    round = round,
                    viewerOutcome = celebrationOutcomeFor(round, uiMatches) ?: FollowedTeamOutcome.NotInvolved,
                    relatedMatches = emptyList(),
                )
            }
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

private fun MatchStatus.isLive(): Boolean = this is MatchStatus.Live || this is MatchStatus.Penalties

private fun MatchStatus.isPast(): Boolean = this is MatchStatus.Final || this is MatchStatus.FinalAfterPenalties

// A decided final or third-place playoff always carries the celebration outcome,
// regardless of which team (if any) the viewer follows — the champion card is shown
// universally. Returns null when this card shouldn't be a celebration.
private fun celebrationOutcomeFor(
    stage: TournamentRound,
    matches: List<Match>,
): FollowedTeamOutcome? {
    val hasDecidedMatch = matches.any {
        it.matchStatus is MatchStatus.Final || it.matchStatus is MatchStatus.FinalAfterPenalties
    }
    if (!hasDecidedMatch) return null
    return when (stage) {
        TournamentRound.FINAL -> FollowedTeamOutcome.TournamentWinner
        TournamentRound.THIRD_PLACE_PLAYOFF -> FollowedTeamOutcome.ThirdPlace
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
        home = homeTeam.toTeam(),
        away = awayTeam.toTeam(),
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
