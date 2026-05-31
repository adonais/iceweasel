/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import org.mozilla.fenix.home.sports.fake.FakeMatchCardScenario
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.home.sports.MatchCard as MatchCardState

/**
 * Card that renders a sports match and their related matches.
 *
 * @param state The [MatchCardState] to display in this card.
 * @param isTeamSelected Whether the user has selected a team.
 * @param onRefresh Used to refresh the scores for live matches.
 * @param onMatchClicked Used to handle match click actions.
 * @param modifier [Modifier] to be applied to the card.
 */
@Composable
fun MatchCard(
    state: MatchCardState,
    isTeamSelected: Boolean,
    onRefresh: () -> Unit,
    onMatchClicked: (String, String) -> Unit,
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
                top = FirefoxTheme.layout.space.static150,
                bottom = FirefoxTheme.layout.space.static200,
            ),
            verticalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static200),
        ) {
            val matches = state.matches
            val relatedMatches = state.relatedMatches
            val sportHeaderMatch = if (matches.isNotEmpty()) {
                matches.first()
            } else if (relatedMatches.isNotEmpty()) {
                relatedMatches.first()
            } else {
                null
            }

            if (sportHeaderMatch != null) {
                SportCardHeader(
                    match = sportHeaderMatch,
                    round = state.round,
                    isTeamSelected = isTeamSelected,
                    onRefresh = onRefresh,
                )
            }

            matches.forEach { match ->
                MatchBody(
                    match = match,
                    showDivider = relatedMatches.isNotEmpty(),
                    isTeamSelected = isTeamSelected,
                    onMatchClicked = onMatchClicked,
                )
            }

            if (relatedMatches.isNotEmpty()) {
                RelatedMatchesSection(
                    matches = relatedMatches,
                    isTeamSelected = isTeamSelected,
                    onMatchClicked = onMatchClicked,
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
    isTeamSelected: Boolean,
    onMatchClicked: (String, String) -> Unit,
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = { onMatchClicked(match.home.region, match.away.region) }),
            horizontalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static100),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TeamSlot(team = match.home, modifier = Modifier.weight(1f))

            Scoreboard(match = match, isTeamSelected = isTeamSelected)

            TeamSlot(team = match.away, modifier = Modifier.weight(1f))
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
private fun Scoreboard(match: Match, isTeamSelected: Boolean) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static100),
    ) {
        if (match.homeScore != null && match.awayScore != null) {
            ScorePill(
                homeScore = match.homeScore,
                awayScore = match.awayScore,
            )
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (match.matchStatus.hasStatusSubtitle() || isTeamSelected) {
                Text(
                    text = statusSubtitle(
                        status = match.matchStatus,
                        date = match.date,
                        isTeamSelected = isTeamSelected,
                    ),
                    style = FirefoxTheme.typography.caption,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (match.matchStatus.hasSecondaryStatusSubtitle()) {
                Text(
                    text = secondStatusSubtitle(status = match.matchStatus, time = match.time),
                    style = FirefoxTheme.typography.caption,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun MatchStatus.hasStatusSubtitle(): Boolean = when (this) {
    is MatchStatus.Penalties,
    is MatchStatus.FinalAfterPenalties,
    is MatchStatus.Live,
    is MatchStatus.Final,
        -> true

    else -> false
}

private fun MatchStatus.hasSecondaryStatusSubtitle(): Boolean = when (this) {
    is MatchStatus.Live,
    is MatchStatus.Final,
        -> false

    else -> true
}

@Composable
private fun statusSubtitle(status: MatchStatus, date: String, isTeamSelected: Boolean): String = when (status) {
    is MatchStatus.Live -> "${status.clock}'"
    is MatchStatus.Penalties -> stringResource(R.string.sports_widget_penalties)
    is MatchStatus.Final -> stringResource(R.string.sports_widget_match_full_time_2)
    is MatchStatus.FinalAfterPenalties -> "${stringResource(R.string.sports_widget_match_full_time_2)} · " +
        stringResource(R.string.sports_widget_penalties)

    else -> if (isTeamSelected) date else ""
}

@Composable
private fun secondStatusSubtitle(status: MatchStatus, time: String): String = when (status) {
    is MatchStatus.Penalties -> "(${status.homeScore ?: "-"} - ${status.awayScore ?: "-"})"
    is MatchStatus.FinalAfterPenalties -> "(${status.homeScore ?: "-"} - ${status.awayScore ?: "-"})"
    else -> time
}

private data class MatchCardPreviewState(
    val label: String,
    val state: MatchCardState,
)

private class MatchCardPreviewProvider : PreviewParameterProvider<MatchCardPreviewState> {
    override val values = FakeMatchCardScenario.entries.asSequence().map { scenario ->
        MatchCardPreviewState(label = scenario.label, state = scenario.build().first())
    }
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
                isTeamSelected = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(FirefoxTheme.layout.space.static200),
                onRefresh = {},
                onMatchClicked = { _, _ -> },
            )
        }
    }
}
