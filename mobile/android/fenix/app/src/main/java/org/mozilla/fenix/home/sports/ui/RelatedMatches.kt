/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import org.mozilla.fenix.R
import org.mozilla.fenix.home.sports.MatchInfo
import org.mozilla.fenix.home.sports.MatchStatus
import org.mozilla.fenix.theme.FirefoxTheme

@Composable
internal fun RelatedMatchesSection(
    label: String?,
    matches: List<MatchInfo>,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = FirefoxTheme.layout.space.static100),
        verticalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static100),
    ) {
        if (!label.isNullOrEmpty()) {
            Text(
                text = label,
                modifier = Modifier.fillMaxWidth(),
                style = FirefoxTheme.typography.subtitle2,
            )
        }

        matches.forEach { match ->
            RelatedMatchRow(match)
        }
    }
}

@Composable
internal fun RelatedMatchRow(match: MatchInfo) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(24.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FlagContainer(flagResId = match.homeFlagResId)

        Spacer(Modifier.width(FirefoxTheme.layout.space.static100))

        Text(
            text = match.homeTeamCode,
            style = FirefoxTheme.typography.subtitle2,
        )

        Spacer(Modifier.weight(1f))

        if (match.homeScore != null && match.awayScore != null) {
            Text(
                text = formatScoreWithSuffix(match),
                style = FirefoxTheme.typography.subtitle2,
            )
        } else {
            val dateTime = listOfNotNull(
                match.date.takeIf { it.isNotEmpty() },
                match.time.takeIf { it.isNotEmpty() },
            ).joinToString(" · ")

            Text(
                text = dateTime,
                style = FirefoxTheme.typography.body2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Spacer(Modifier.weight(1f))

        Text(
            text = match.awayTeamCode,
            style = FirefoxTheme.typography.subtitle2,
        )

        Spacer(Modifier.width(FirefoxTheme.layout.space.static100))

        FlagContainer(flagResId = match.awayFlagResId)
    }
}

/**
 * Formats a match's final score, appending " (Full time)" for finished matches.
 */
@Composable
private fun formatScoreWithSuffix(match: MatchInfo): String {
    val suffix = when (match.status) {
        MatchStatus.FINAL,
        MatchStatus.ELIMINATED,
        MatchStatus.WINNER,
            -> stringResource(R.string.sports_widget_match_full_time)

        else -> ""
    }
    return "${match.homeScore} - ${match.awayScore} $suffix".trim()
}

@Composable
private fun FlagContainer(
    flagResId: Int,
) {
    val shape = MaterialTheme.shapes.extraSmall

    Image(
        painter = painterResource(flagResId),
        contentDescription = null,
        modifier = Modifier
            .size(width = 30.dp, height = 20.dp)
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outlineVariant,
                shape = shape,
            )
            .clip(shape),
    )
}

private data class RelatedMatchesPreviewState(
    val labelResId: Int?,
    val matches: List<MatchInfo>,
)

private class RelatedMatchesPreviewProvider : PreviewParameterProvider<RelatedMatchesPreviewState> {
    override val values = sequenceOf(
        RelatedMatchesPreviewState(
            labelResId = R.string.sports_widget_related_matches,
            matches = listOf(
                MatchInfo(
                    homeTeamCode = "USA",
                    homeFlagResId = R.drawable.flag_us,
                    awayTeamCode = "AUS",
                    awayFlagResId = R.drawable.flag_au,
                    date = "Jun 19",
                    time = "2:00 PM",
                ),
                MatchInfo(
                    homeTeamCode = "TUR",
                    homeFlagResId = R.drawable.flag_tr,
                    awayTeamCode = "USA",
                    awayFlagResId = R.drawable.flag_us,
                    date = "Jun 25",
                    time = "5:00 PM",
                ),
            ),
        ),
        RelatedMatchesPreviewState(
            labelResId = null,
            matches = listOf(
                MatchInfo(
                    homeTeamCode = "USA",
                    homeFlagResId = R.drawable.flag_us,
                    homeScore = 1,
                    awayTeamCode = "PAR",
                    awayFlagResId = R.drawable.flag_py,
                    awayScore = 2,
                    status = MatchStatus.LIVE,
                ),
                MatchInfo(
                    homeTeamCode = "USA",
                    homeFlagResId = R.drawable.flag_us,
                    homeScore = 1,
                    awayTeamCode = "PAR",
                    awayFlagResId = R.drawable.flag_py,
                    awayScore = 2,
                    status = MatchStatus.FINAL,
                ),
                MatchInfo(
                    homeTeamCode = "USA",
                    homeFlagResId = R.drawable.flag_us,
                    homeScore = 1,
                    awayTeamCode = "PAR",
                    awayFlagResId = R.drawable.flag_py,
                    awayScore = 2,
                    status = MatchStatus.FINAL,
                ),
            ),
        ),
    )
}

@FlexibleWindowLightDarkPreview
@Composable
private fun RelatedMatchesSectionPreview(
    @PreviewParameter(RelatedMatchesPreviewProvider::class) state: RelatedMatchesPreviewState,
) {
    FirefoxTheme {
        Surface {
            RelatedMatchesSection(
                label = state.labelResId?.let { stringResource(it) },
                matches = state.matches,
            )
        }
    }
}
