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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.theme.success
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.LinkText
import org.mozilla.fenix.compose.LinkTextState
import org.mozilla.fenix.compose.StatusBadge
import org.mozilla.fenix.home.sports.MatchInfo
import org.mozilla.fenix.home.sports.MatchStatus
import org.mozilla.fenix.home.sports.TournamentRound
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

@Composable
internal fun SportCardHeader(
    match: MatchInfo,
    onViewMatchDetails: () -> Unit,
    onMenuClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = FirefoxTheme.layout.space.static100),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = match.groupLabel.ifEmpty { roundDisplayName(match.round) },
            style = FirefoxTheme.typography.headline8,
            color = MaterialTheme.colorScheme.onSurface,
        )

        Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

        Text(
            text = "·",
            style = FirefoxTheme.typography.body2,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

        LinkText(
            text = stringResource(id = R.string.sports_widget_view_match_details),
            linkTextStates = listOf(
                LinkTextState(
                    text = stringResource(id = R.string.sports_widget_view_match_details),
                    url = "",
                    onClick = { onViewMatchDetails() },
                ),
            ),
            style = FirefoxTheme.typography.body2,
            linkTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
            linkTextDecoration = TextDecoration.Underline,
        )

        if (isLiveStatus(match.status)) {
            Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

            Text(
                text = "·",
                style = FirefoxTheme.typography.body2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

            LiveBadge()
        }

        Spacer(Modifier.weight(1f))

        IconButton(
            onClick = onMenuClick,
            contentDescription = null,
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_ellipsis_vertical_24),
                contentDescription = null,
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

private fun isLiveStatus(status: MatchStatus): Boolean = when (status) {
    MatchStatus.LIVE,
    MatchStatus.HALFTIME,
    MatchStatus.EXTRA_TIME,
    MatchStatus.PENALTIES,
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
            status = MatchStatus.LIVE,
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.GROUP_STAGE,
            groupLabelResId = R.string.sports_widget_group_a,
            status = MatchStatus.UPCOMING,
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.ROUND_OF_32,
            groupLabelResId = null,
            status = MatchStatus.HALFTIME,
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.ROUND_OF_16,
            groupLabelResId = null,
            status = MatchStatus.UPCOMING,
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.QUARTER_FINAL,
            groupLabelResId = null,
            status = MatchStatus.EXTRA_TIME,
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.SEMI_FINAL,
            groupLabelResId = null,
            status = MatchStatus.PENALTIES,
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.FINAL,
            groupLabelResId = null,
            status = MatchStatus.FINAL,
        ),
        SportCardHeaderPreviewState(
            round = TournamentRound.THIRD_PLACE_PLAYOFF,
            groupLabelResId = null,
            status = MatchStatus.UPCOMING,
        ),
    )
}

@PreviewLightDark
@Composable
private fun SportCardHeaderPreview(
    @PreviewParameter(SportCardHeaderPreviewProvider::class) state: SportCardHeaderPreviewState,
) {
    FirefoxTheme {
        Surface {
            SportCardHeader(
                match = MatchInfo(
                    homeTeamCode = "USA",
                    homeFlagResId = R.drawable.flag_us,
                    awayTeamCode = "PAR",
                    awayFlagResId = R.drawable.flag_py,
                    status = state.status,
                    round = state.round,
                    groupLabel = state.groupLabelResId?.let { stringResource(it) }.orEmpty(),
                ),
                onViewMatchDetails = {},
                onMenuClick = {},
            )
        }
    }
}
