/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import androidx.annotation.DrawableRes

/**
 * A participating team in the sports tournament.
 *
 * @property key Abbreviation named for a given name (e.g. "ENG").
 * @property flagResId Local fallback drawable for the flag.
 * @property globalTeamId Unique numeric identifier for this team.
 * @property name Long display name (e.g. "England").
 * @property region ISO3 region code This may differ from [key] (e.g. "ENG").
 * @property iconUrl Optional URL for the team logo.
 * @property group [Group] name (e.g. "Group A"). This will be null after the knockout stage starts.
 * @property eliminated True once the team is out of the tournament.
 * @property standing The [TeamStanding] record in the tournament.
 */
data class Team(
    val key: String,
    @param:DrawableRes val flagResId: Int,
    val globalTeamId: Long = 0L,
    val name: String = "",
    val region: String = "",
    val iconUrl: String? = null,
    val group: Group? = null,
    val eliminated: Boolean = false,
    val standing: TeamStanding = TeamStanding(),
)

/**
 * Represents the Group stage within the tournament.
 */
enum class Group { A, B, C, D, E, F, G, H, I, J, K, L }

/**
 * The team's record within the tournament.
 */
data class TeamStanding(
    val wins: Int = 0,
    val losses: Int = 0,
    val draws: Int = 0,
    val points: Int = 0,
)

/**
 * Game status of a match.
 */
sealed class MatchStatus {
    /**
     * Match has not started yet.
     */
    data object Scheduled : MatchStatus()

    /**
     * Match is currently in progress.
     *
     * @property period Period description string ("1", "2", "Extra", etc.)
     * @property clock Minutes of elapsed play time, with extra time denoted as a "+"
     * (e.g. "42", "90+3" (indicating 3 minutes extra time)).
     */
    data class Live(val period: String, val clock: String) : MatchStatus()

    /**
     * Match is in a penalty shootout.
     *
     * @property homeScore Home team score.
     * @property awayScore Away team score.
     */
    data class Penalties(val homeScore: Int? = null, val awayScore: Int? = null) : MatchStatus()

    /**
     * Match has ended.
     */
    data object Final : MatchStatus()

    /**
     * Match has ended with penalities.
     *
     * @property homeScore Home team score.
     * @property awayScore Away team score.
     */
    data class FinalAfterPenalties(val homeScore: Int? = null, val awayScore: Int? = null) : MatchStatus()

    /**
     * API returned an unrecognized status string.
     */
    data object Unknown : MatchStatus()
}

/**
 * Information related to a given sport event (game/match).
 *
 * @property globalEventId Stable upstream identifier; the natural cache key.
 * @property date Date string for start of match e.g. Jun 13.
 * @property time Time string for start of match e.g. 5:00 PM.
 * @property home Home [Team].
 * @property away Away [Team].
 * @property matchStatus Current [MatchStatus].
 * @property homeScore Home team score. Null if the match has not started.
 * @property awayScore Away team score. Null if the match has not started.
 * @property homePenalty Home penalty shootout score. Null if no shootout occurred.
 * @property awayPenalty Away penalty shootout score. Null if no shootout occurred.
 * @property clock Minutes of elapsed play time, with extra time denoted as a "+".
 * (e.g. "42", "90+3" (indicating 3 minutes extra time))
 * @property period Period description string ("1", "2", "Extra", etc.)
 * @property updated UTC timestamp when this event record was last updated.
 */
data class Match(
    val globalEventId: Long = 0L,
    val date: String,
    val time: String,
    val home: Team,
    val away: Team,
    val matchStatus: MatchStatus = MatchStatus.Scheduled,
    val homeScore: Int? = null,
    val awayScore: Int? = null,
    val homePenalty: Int? = null,
    val awayPenalty: Int? = null,
    val clock: String? = null,
    val period: String? = null,
    val updated: Int? = null,
)

/**
 * Outcome of a match from the viewpoint of a followed team.
 */
sealed class FollowedTeamOutcome {
    /**
     * Followed team is not playing in this match.
     */
    data object NotInvolved : FollowedTeamOutcome()

    /**
     * Match has not concluded yet.
     */
    data object Pending : FollowedTeamOutcome()

    /**
     * Followed team won this match.
     */
    data object Won : FollowedTeamOutcome()

    /**
     * Followed team lost or drew but advanced.
     */
    data object Advanced : FollowedTeamOutcome()

    /**
     * Followed team was eliminated by this match.
     */
    data object Eliminated : FollowedTeamOutcome()

    /**
     * Followed team won the tournament with this match.
     */
    data object TournamentWinner : FollowedTeamOutcome()
}

/**
 * Round/stage of the soccer tournament.
 */
enum class TournamentRound {
    GROUP_STAGE,
    ROUND_OF_32,
    ROUND_OF_16,
    QUARTER_FINAL,
    SEMI_FINAL,
    FINAL,
    THIRD_PLACE_PLAYOFF,
}

/**
 * UI state for a match card.
 *
 * @property matches The underlying data for each match.
 * @property round Which round of the tournament this match belongs to.
 * @property viewerOutcome Outcome of this match from the perspective of the followed team(s).
 * @property relatedMatches Related [Match]es to display.
 */
data class MatchCard(
    val matches: List<Match>,
    val round: TournamentRound = TournamentRound.GROUP_STAGE,
    val viewerOutcome: FollowedTeamOutcome = FollowedTeamOutcome.NotInvolved,
    val relatedMatches: List<Match>,
)

/**
 * UI state for the champion celebration card shown when a followed team wins.
 *
 * @property finalMatch The final (or third-place playoff) [Match] whose result determined
 * the celebrated team.
 * @property winner The team being celebrated.
 * @property thirdPlace Whether this card celebrates a third-place finish rather than the
 * tournament winner.
 */
data class ChampionCard(
    val finalMatch: Match,
    val winner: Team,
    val thirdPlace: Boolean = false,
)
