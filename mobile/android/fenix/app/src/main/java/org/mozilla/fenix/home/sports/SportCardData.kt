/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import androidx.annotation.DrawableRes

/**
 * Status of a match within the sports widget.
 */
enum class MatchStatus {
    /**
     * Match hasn't started yet. Displayed with an upcoming countdown.
     */
    UPCOMING,

    /**
     * Match is currently in progress.
     */
    LIVE,

    /**
     * Match is at halftime.
     */
    HALFTIME,

    /**
     * Match is in extra time.
     */
    EXTRA_TIME,

    /**
     * Match is in penalty shootout.
     */
    PENALTIES,

    /**
     * Match has ended.
     */
    FINAL,

    /**
     * Match has ended and the followed team was eliminated.
     */
    ELIMINATED,

    /**
     * Match has ended and the followed team won.
     */
    WINNER,
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
 * Data for a single match in the scoreboard.
 *
 * @property homeTeamCode Short display code for the home team (e.g. "USA").
 * @property homeFlagResId Drawable resource for the home team's flag.
 * @property homeScore Home team's score, or null if match hasn't started.
 * @property awayTeamCode Short display code for the away team (e.g. "PAR").
 * @property awayFlagResId Drawable resource for the away team's flag.
 * @property awayScore Away team's score, or null if match hasn't started.
 * @property status Current status of the match.
 * @property matchMinute Current match minute (e.g. "29'"), shown during live matches.
 * @property date Display date for the match (e.g. "Jun 28").
 * @property time Display time for the match (e.g. "2:00 PM").
 * @property round Which round of the tournament this match belongs to.
 * @property groupLabel Group label (e.g. "Group D"), shown during group stage.
 * @property countdownDays Days remaining until kickoff.
 * @property countdownHours Hours remaining until kickoff.
 * @property countdownMins Minutes remaining until kickoff.
 * @property penaltiesSummary Post-match penalties summary, e.g. "FINAL 5-2 on penalties".
 */
data class MatchInfo(
    val homeTeamCode: String,
    @param:DrawableRes val homeFlagResId: Int,
    val homeScore: Int? = null,
    val awayTeamCode: String,
    @param:DrawableRes val awayFlagResId: Int,
    val awayScore: Int? = null,
    val status: MatchStatus = MatchStatus.UPCOMING,
    val matchMinute: String = "",
    val date: String = "",
    val time: String = "",
    val round: TournamentRound = TournamentRound.GROUP_STAGE,
    val groupLabel: String = "",
    val countdownDays: String = "",
    val countdownHours: String = "",
    val countdownMins: String = "",
    val penaltiesSummary: String = "",
)

/**
 * Data for a champion celebration card.
 *
 * @property countryName Full name of the winning country (e.g. "United States").
 * @property flagResId Flag drawable for the winner.
 * @property homeTeamCode Code of the home team in the final match.
 * @property homeFlagResId Flag drawable for the home team.
 * @property homeScore Final home score.
 * @property awayTeamCode Code of the away team in the final match.
 * @property awayFlagResId Flag drawable for the away team.
 * @property awayScore Final away score.
 * @property thirdPlace Whether this is the third-place celebration.
 */
data class ChampionInfo(
    val countryName: String,
    @param:DrawableRes val flagResId: Int,
    val homeTeamCode: String,
    @param:DrawableRes val homeFlagResId: Int,
    val homeScore: Int,
    val awayTeamCode: String,
    @param:DrawableRes val awayFlagResId: Int,
    val awayScore: Int,
    val thirdPlace: Boolean = false,
)
