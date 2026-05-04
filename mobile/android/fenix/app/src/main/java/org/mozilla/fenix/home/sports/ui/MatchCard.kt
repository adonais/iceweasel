/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import org.mozilla.fenix.R
import org.mozilla.fenix.home.sports.Match
import org.mozilla.fenix.home.sports.MatchStatus
import org.mozilla.fenix.home.sports.Team
import org.mozilla.fenix.home.sports.TournamentRound
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.home.sports.MatchCard as MatchCardState

/**
 * Card that renders a sports match and their related matches.
 *
 * @param state The [MatchCardState] to display in this card.
 * @param onMenuClick Invoked when the overflow menu button is clicked.
 * @param modifier [Modifier] to be applied to the card.
 */
@Composable
fun MatchCard(
    state: MatchCardState,
    onMenuClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
    ) {
        Column(
            modifier = Modifier.padding(
                start = FirefoxTheme.layout.space.static100,
                end = FirefoxTheme.layout.space.static100,
                top = FirefoxTheme.layout.space.static50,
                bottom = FirefoxTheme.layout.space.static200,
            ),
            verticalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static200),
        ) {
            SportCardHeader(
                match = state.match,
                round = state.round,
                onViewMatchDetails = {},
                onMenuClick = onMenuClick,
            )

            MatchBody(
                match = state.match,
                showDivider = state.relatedMatches.isNotEmpty() && state.match.matchStatus != MatchStatus.Scheduled,
            )

            if (state.relatedMatches.isNotEmpty()) {
                RelatedMatchesSection(
                    label = stringResource(R.string.sports_widget_related_matches),
                    matches = state.relatedMatches,
                )
            }
        }
    }
}

/**
 * Renders the body content of the card. This will display a countdown pill for scheduled matches or
 * a score pill for current matches.
 */
@Composable
private fun MatchBody(
    match: Match,
    showDivider: Boolean,
) {
    Column {
        when (match.matchStatus) {
            MatchStatus.Scheduled -> {
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    CountdownPill(dateInUtc = match.date)
                }
            }

            else -> {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static100),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TeamSlot(team = match.home, modifier = Modifier.weight(1f))

                    Scoreboard(match = match)

                    TeamSlot(team = match.away, modifier = Modifier.weight(1f))
                }
            }
        }

        if (showDivider) {
            Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static100))

            HorizontalDivider()
        }
    }
}

@Composable
private fun TeamSlot(
    team: Team,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static50),
    ) {
        FlagContainer(
            flagResId = team.flagResId,
            modifier = Modifier.size(width = 60.dp, height = 40.dp),
        )

        Text(
            text = team.key,
            style = FirefoxTheme.typography.subtitle2,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun Scoreboard(match: Match) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static100),
    ) {
        ScorePill(
            homeScore = match.homeScore,
            awayScore = match.awayScore,
        )

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = statusSubtitle(match.matchStatus),
                style = FirefoxTheme.typography.caption,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (match.matchStatus.hasPenalties()) {
                Text(
                    text = penaltiesScore(match.matchStatus),
                    style = FirefoxTheme.typography.caption,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun MatchStatus.hasPenalties(): Boolean = when (this) {
    is MatchStatus.Penalties,
    is MatchStatus.FinalAfterPenalties,
        -> true
    else -> false
}

@Composable
private fun statusSubtitle(status: MatchStatus): String = when (status) {
    is MatchStatus.Live -> "${status.clock}'"
    is MatchStatus.Penalties -> stringResource(R.string.sports_widget_penalties)
    is MatchStatus.Final -> stringResource(R.string.sports_widget_match_full_time_2)
    is MatchStatus.FinalAfterPenalties -> "${stringResource(R.string.sports_widget_match_full_time_2)} · " +
        "${stringResource(R.string.sports_widget_penalties)}"
    else -> ""
}

@Composable
private fun penaltiesScore(status: MatchStatus): String = when (status) {
    is MatchStatus.Penalties -> "(${status.homeScore ?: "-"} - ${status.awayScore ?: "-"})"
    is MatchStatus.FinalAfterPenalties -> "(${status.homeScore ?: "-"} - ${status.awayScore ?: "-"})"
    else -> ""
}

private data class MatchCardPreviewState(
    val label: String,
    val state: MatchCardState,
)

private class MatchCardPreviewProvider : PreviewParameterProvider<MatchCardPreviewState> {
    private val usa = Team(key = "USA", flagResId = R.drawable.flag_us, group = "Group D")
    private val par = Team(key = "PAR", flagResId = R.drawable.flag_py, group = "Group D")
    private val aus = Team(key = "AUS", flagResId = R.drawable.flag_au, group = "Group D")
    private val tur = Team(key = "TUR", flagResId = R.drawable.flag_tr, group = "Group D")

    private val relatedMatches = listOf(
        Match(date = "2026-06-19T18:00:00Z", home = usa, away = aus),
        Match(date = "2026-06-25T21:00:00Z", home = tur, away = usa),
    )

    override val values = sequenceOf(
        MatchCardPreviewState(
            label = "Live",
            state = MatchCardState(
                match = Match(
                    date = "2026-06-22T18:00:00Z",
                    home = usa,
                    away = par,
                    homeScore = 1,
                    awayScore = 2,
                    matchStatus = MatchStatus.Live(period = "1", clock = "29"),
                ),
                round = TournamentRound.GROUP_STAGE,
                relatedMatches = relatedMatches,
            ),
        ),
        MatchCardPreviewState(
            label = "Scheduled",
            state = MatchCardState(
                match = Match(
                    date = "2026-06-22T18:00:00Z",
                    home = usa,
                    away = par,
                    matchStatus = MatchStatus.Scheduled,
                ),
                round = TournamentRound.GROUP_STAGE,
                relatedMatches = relatedMatches,
            ),
        ),
        MatchCardPreviewState(
            label = "Penalties",
            state = MatchCardState(
                match = Match(
                    date = "2026-07-15T20:00:00Z",
                    home = usa,
                    away = par,
                    homeScore = 3,
                    awayScore = 3,
                    matchStatus = MatchStatus.Penalties(homeScore = 5, awayScore = 4),
                ),
                round = TournamentRound.SEMI_FINAL,
                relatedMatches = emptyList(),
            ),
        ),
        MatchCardPreviewState(
            label = "Final",
            state = MatchCardState(
                match = Match(
                    date = "2026-07-19T20:00:00Z",
                    home = usa,
                    away = par,
                    homeScore = 2,
                    awayScore = 1,
                    matchStatus = MatchStatus.Final,
                ),
                round = TournamentRound.FINAL,
                relatedMatches = emptyList(),
            ),
        ),
        MatchCardPreviewState(
            label = "Final after penalties",
            state = MatchCardState(
                match = Match(
                    date = "2026-07-19T20:00:00Z",
                    home = usa,
                    away = par,
                    homeScore = 3,
                    awayScore = 3,
                    matchStatus = MatchStatus.FinalAfterPenalties(homeScore = 5, awayScore = 4),
                ),
                round = TournamentRound.FINAL,
                relatedMatches = emptyList(),
            ),
        ),
    )
}

@PreviewLightDark
@Composable
private fun MatchCardPreview(
    @PreviewParameter(MatchCardPreviewProvider::class) preview: MatchCardPreviewState,
) {
    FirefoxTheme {
        Surface {
            MatchCard(
                state = preview.state,
                onMenuClick = {},
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(FirefoxTheme.layout.space.static200),
            )
        }
    }
}
