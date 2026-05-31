/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.fake

import org.mozilla.fenix.R
import org.mozilla.fenix.home.sports.Group
import org.mozilla.fenix.home.sports.Match
import org.mozilla.fenix.home.sports.MatchCard
import org.mozilla.fenix.home.sports.MatchStatus
import org.mozilla.fenix.home.sports.Team
import org.mozilla.fenix.home.sports.TournamentRound

/**
 * Fake data used for the Homepage Sports Widget Compose previews and debug tool.
 */
internal object FakeSportsPreview {

    private val GROUP_LABEL = Group.D

    val usa = Team(key = "USA", flagResId = R.drawable.flag_us, region = "USA", group = GROUP_LABEL)
    val par = Team(key = "PAR", flagResId = R.drawable.flag_py, region = "PRY", group = GROUP_LABEL)
    val aus = Team(key = "AUS", flagResId = R.drawable.flag_au, region = "AUS", group = GROUP_LABEL)
    val tur = Team(key = "TUR", flagResId = R.drawable.flag_tr, region = "TUR", group = GROUP_LABEL)
    val can = Team(key = "CAN", flagResId = R.drawable.flag_ca, region = "CAN", group = GROUP_LABEL)

    /**
     * Builds a fake [Match].
     */
    fun match(
        home: Team = usa,
        away: Team = par,
        date: String = "Jun 28",
        time: String = "2:00 PM",
        homeScore: Int? = null,
        awayScore: Int? = null,
        matchStatus: MatchStatus = MatchStatus.Scheduled,
    ): Match = Match(
        date = date,
        time = time,
        home = home,
        away = away,
        homeScore = homeScore,
        awayScore = awayScore,
        matchStatus = matchStatus,
    )

    /**
     * Returns a list of related [Match]es.
     */
    fun relatedMatches(): List<Match> = listOf(
        match(home = usa, away = aus, date = "Jun 19", time = "5:00 PM"),
        match(home = tur, away = usa, date = "Jun 25", time = "5:00 PM"),
    )
}

/**
 * Catalog of [MatchCard] fake scenarios.
 */
internal enum class FakeMatchCardScenario(val label: String) {
    Live("Live") {
        override fun build() = listOf(
            MatchCard(
                matches = listOf(
                    FakeSportsPreview.match(
                        homeScore = 1,
                        awayScore = 2,
                        matchStatus = MatchStatus.Live(period = "1", clock = "29"),
                    ),
                ),
                round = TournamentRound.GROUP_STAGE,
                relatedMatches = FakeSportsPreview.relatedMatches(),
            ),
        )
    },

    Scheduled("Scheduled") {
        override fun build() = listOf(
            MatchCard(
                matches = listOf(FakeSportsPreview.match(matchStatus = MatchStatus.Scheduled)),
                round = TournamentRound.GROUP_STAGE,
                relatedMatches = FakeSportsPreview.relatedMatches(),
            ),
        )
    },

    Penalties("Penalties") {
        override fun build() = listOf(
            MatchCard(
                matches = listOf(
                    FakeSportsPreview.match(
                        date = "Jun 15",
                        time = "8:00 PM",
                        homeScore = 3,
                        awayScore = 3,
                        matchStatus = MatchStatus.Penalties(homeScore = 5, awayScore = 4),
                    ),
                ),
                round = TournamentRound.SEMI_FINAL,
                relatedMatches = emptyList(),
            ),
        )
    },

    Final("Final") {
        override fun build() = listOf(
            MatchCard(
                matches = listOf(
                    FakeSportsPreview.match(
                        date = "Jun 19",
                        time = "8:00 PM",
                        homeScore = 2,
                        awayScore = 1,
                        matchStatus = MatchStatus.Final,
                    ),
                ),
                round = TournamentRound.FINAL,
                relatedMatches = emptyList(),
            ),
        )
    },

    FinalAfterPenalties("Final after penalties") {
        override fun build() = listOf(
            MatchCard(
                matches = listOf(
                    FakeSportsPreview.match(
                        date = "Jun 19",
                        time = "8:00 PM",
                        homeScore = 3,
                        awayScore = 3,
                        matchStatus = MatchStatus.FinalAfterPenalties(homeScore = 5, awayScore = 4),
                    ),
                ),
                round = TournamentRound.FINAL,
                relatedMatches = emptyList(),
            ),
        )
    },

    FollowAllSchedule("Follow all schedule") {
        override fun build() = listOf(
            MatchCard(
                matches = listOf(FakeSportsPreview.match(matchStatus = MatchStatus.Scheduled)),
                round = TournamentRound.GROUP_STAGE,
                relatedMatches = emptyList(),
            ),
            MatchCard(
                matches = listOf(FakeSportsPreview.match(matchStatus = MatchStatus.Scheduled)),
                round = TournamentRound.GROUP_STAGE,
                relatedMatches = emptyList(),
            ),
            MatchCard(
                matches = listOf(FakeSportsPreview.match(matchStatus = MatchStatus.Scheduled)),
                round = TournamentRound.GROUP_STAGE,
                relatedMatches = emptyList(),
            ),
        )
    },
    ;

    abstract fun build(): List<MatchCard>
}
