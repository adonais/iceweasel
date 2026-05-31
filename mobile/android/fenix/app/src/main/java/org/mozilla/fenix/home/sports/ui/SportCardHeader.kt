/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import mozilla.components.compose.base.theme.success
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.StatusBadge
import org.mozilla.fenix.home.sports.Match
import org.mozilla.fenix.home.sports.MatchStatus
import org.mozilla.fenix.home.sports.Team
import org.mozilla.fenix.home.sports.TournamentRound
import org.mozilla.fenix.theme.FirefoxTheme

@Composable
internal fun SportCardHeader(
    match: Match,
    round: TournamentRound,
    modifier: Modifier = Modifier,
) {
    val groupOrRound = match.home.group ?: roundDisplayName(round)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = FirefoxTheme.layout.space.static100),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = groupOrRound,
            style = FirefoxTheme.typography.headline8,
            color = MaterialTheme.colorScheme.onSurface,
        )

        if (match.matchStatus.isLive()) {
            Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

            LiveBadge()
        } else {
            Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

            Text(
                text = "·",
                style = FirefoxTheme.typography.body2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

            Text(
                text = match.date,
                style = FirefoxTheme.typography.body2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun LiveBadge() {
    StatusBadge(
        status = stringResource(R.string.sports_widget_match_live),
        containerColor = MaterialTheme.colorScheme.success,
    )
}

private fun MatchStatus.isLive(): Boolean = when (this) {
    is MatchStatus.Live,
    is MatchStatus.Penalties,
        -> true

    else -> false
}

@Composable
private fun roundDisplayName(round: TournamentRound): String = when (round) {
    TournamentRound.ROUND_OF_32 -> stringResource(R.string.sports_widget_round_of_32)
    TournamentRound.ROUND_OF_16 -> stringResource(R.string.sports_widget_round_of_16)
    TournamentRound.QUARTER_FINAL -> stringResource(R.string.sports_widget_quarter_final)
    TournamentRound.SEMI_FINAL -> stringResource(R.string.sports_widget_semi_final)
    TournamentRound.FINAL -> stringResource(R.string.sports_widget_final)
    TournamentRound.THIRD_PLACE_PLAYOFF -> stringResource(R.string.sports_widget_bronze_final)
    TournamentRound.GROUP_STAGE -> ""
}

private data class SportCardHeaderPreviewState(
    val round: TournamentRound,
    @param:StringRes val groupLabelResId: Int?,
    val status: MatchStatus,
)

private class SportCardHeaderPreviewProvider : PreviewParameterProvider<SportCardHeaderPreviewState> {
    override val values = sequenceOf(
        SportCardHeaderPreviewState(
            round = TournamentRound.GROUP_STAGE,
            groupLabelResId = R.string.sports_widget_group_d,
            status = MatchStatus.Live(period = "1", clock = "29"),
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.GROUP_STAGE,
            groupLabelResId = R.string.sports_widget_group_a,
            status = MatchStatus.Scheduled,
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.ROUND_OF_16,
            groupLabelResId = null,
            status = MatchStatus.Scheduled,
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.SEMI_FINAL,
            groupLabelResId = null,
            status = MatchStatus.Penalties(),
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.FINAL,
            groupLabelResId = null,
            status = MatchStatus.Final,
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.THIRD_PLACE_PLAYOFF,
            groupLabelResId = null,
            status = MatchStatus.Scheduled,
        ),
    )
}

@PreviewLightDark
@Composable
private fun SportCardHeaderPreview(
    @PreviewParameter(SportCardHeaderPreviewProvider::class) state: SportCardHeaderPreviewState,
) {
    val groupLabel = state.groupLabelResId?.let { stringResource(it) }
    FirefoxTheme {
        Surface {
            SportCardHeader(
                match = Match(
                    date = "2026-06-19T18:00:00Z",
                    home = Team(
                        key = "USA",
                        flagResId = R.drawable.flag_us,
                        group = groupLabel,
                    ),
                    away = Team(
                        key = "PAR",
                        flagResId = R.drawable.flag_py,
                        group = groupLabel,
                    ),
                    matchStatus = state.status,
                ),
                round = state.round,
            )
        }
    }
}
