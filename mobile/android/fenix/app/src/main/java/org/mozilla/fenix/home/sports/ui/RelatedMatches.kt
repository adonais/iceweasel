/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import org.mozilla.fenix.R
import org.mozilla.fenix.home.sports.Match
import org.mozilla.fenix.home.sports.MatchStatus
import org.mozilla.fenix.home.sports.Team
import org.mozilla.fenix.theme.FirefoxTheme

@Composable
internal fun RelatedMatchesSection(
    label: String?,
    matches: List<Match>,
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
            RelatedMatchRow(match = match)
        }
    }
}

@Composable
internal fun RelatedMatchRow(match: Match) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(24.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FlagContainer(
            flagResId = match.home.flagResId,
            modifier = Modifier.size(width = 30.dp, height = 20.dp),
        )

        Spacer(Modifier.width(FirefoxTheme.layout.space.static100))

        Text(
            text = match.home.key,
            style = FirefoxTheme.typography.subtitle2,
        )

        Spacer(Modifier.weight(1f))

        if (match.homeScore != null && match.awayScore != null) {
            Text(
                text = formatScoreWithSuffix(match),
                style = FirefoxTheme.typography.subtitle2,
            )
        } else {
            Text(
                text = match.date,
                style = FirefoxTheme.typography.body2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Spacer(Modifier.weight(1f))

        Text(
            text = match.away.key,
            style = FirefoxTheme.typography.subtitle2,
        )

        Spacer(Modifier.width(FirefoxTheme.layout.space.static100))

        FlagContainer(
            flagResId = match.away.flagResId,
            modifier = Modifier.size(width = 30.dp, height = 20.dp),
        )
    }
}

/**
 * Formats a match's score, appending " (Full time)" once the match is final.
 */
@Composable
private fun formatScoreWithSuffix(match: Match): String {
    val suffix = if (match.matchStatus == MatchStatus.Final) {
        stringResource(R.string.sports_widget_match_full_time_suffix)
    } else {
        ""
    }
    return "${match.homeScore} - ${match.awayScore} $suffix".trim()
}

private data class RelatedMatchesPreviewState(
    val labelResId: Int?,
    val matches: List<Match>,
)

private class RelatedMatchesPreviewProvider : PreviewParameterProvider<RelatedMatchesPreviewState> {
    private val usa = Team(key = "USA", flagResId = R.drawable.flag_us)
    private val aus = Team(key = "AUS", flagResId = R.drawable.flag_au)
    private val tur = Team(key = "TUR", flagResId = R.drawable.flag_tr)
    private val par = Team(key = "PAR", flagResId = R.drawable.flag_py)

    override val values = sequenceOf(
        RelatedMatchesPreviewState(
            labelResId = R.string.sports_widget_related_matches,
            matches = listOf(
                Match(
                    date = "2026-06-19T18:00:00Z",
                    home = usa,
                    away = aus,
                ),
                Match(
                    date = "2026-06-25T21:00:00Z",
                    home = tur,
                    away = usa,
                ),
            ),
        ),
        RelatedMatchesPreviewState(
            labelResId = null,
            matches = listOf(
                Match(
                    date = "2026-06-19T18:00:00Z",
                    home = usa,
                    away = par,
                    homeScore = 1,
                    awayScore = 2,
                    matchStatus = MatchStatus.Live(period = "2", clock = "67"),
                ),
                Match(
                    date = "2026-06-19T18:00:00Z",
                    home = usa,
                    away = par,
                    homeScore = 1,
                    awayScore = 2,
                    matchStatus = MatchStatus.Final,
                ),
                Match(
                    date = "2026-06-19T18:00:00Z",
                    home = usa,
                    away = par,
                    homeScore = 1,
                    awayScore = 2,
                    matchStatus = MatchStatus.Final,
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
