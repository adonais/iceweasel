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
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.CollectionItemInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.collectionItemInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import org.mozilla.fenix.R
import org.mozilla.fenix.home.sports.Match
import org.mozilla.fenix.home.sports.MatchStatus
import org.mozilla.fenix.home.sports.fake.FakeSportsPreview
import org.mozilla.fenix.theme.FirefoxTheme

@Composable
internal fun RelatedMatchesSection(
    matches: List<Match>,
    isTeamSelected: Boolean,
    onMatchClicked: (String?, String?, String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = FirefoxTheme.layout.space.static100)
            .semantics {
                collectionInfo = CollectionInfo(rowCount = matches.size, columnCount = 1)
            },
        verticalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static100),
    ) {
        matches.forEachIndexed { index, match ->
            RelatedMatchRow(
                match = match,
                isTeamSelected = isTeamSelected,
                onMatchClicked = onMatchClicked,
                positionInList = index,
            )
        }
    }
}

@Composable
internal fun RelatedMatchRow(
    match: Match,
    isTeamSelected: Boolean,
    onMatchClicked: (String?, String?, String?) -> Unit,
    positionInList: Int,
) {
    val homeName = match.home?.let { localizedTeamName(it) }
        ?: stringResource(R.string.sports_widget_team_to_be_determined)
    val awayName = match.away?.let { localizedTeamName(it) }
        ?: stringResource(R.string.sports_widget_team_to_be_determined)
    val scoreText = if (match.homeScore != null && match.awayScore != null) {
        formatScoreWithSuffix(match)
    } else {
        null
    }
    val group = groupDisplayName(group = match.home?.group)
    val upcomingPrefix = if (isTeamSelected) match.date else group ?: match.date
    val rowContentDescription = buildRowContentDescription(
        homeName = homeName,
        awayName = awayName,
        scoreText = scoreText,
        upcomingPrefix = upcomingPrefix,
        time = match.time,
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(24.dp)
            .clickable(
                onClick = {
                    if (match.home != null || match.away != null) {
                        onMatchClicked(match.home?.key, match.away?.key, "${match.date} ${match.time}")
                    }
                },
            )
            .clearAndSetSemantics {
                contentDescription = rowContentDescription
                collectionItemInfo = CollectionItemInfo(
                    rowIndex = positionInList,
                    rowSpan = 1,
                    columnIndex = 0,
                    columnSpan = 1,
                )
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FlagContainer(
            flagResId = match.home?.flagResId,
            modifier = Modifier.size(width = 30.dp, height = 20.dp),
        )

        Spacer(Modifier.width(FirefoxTheme.layout.space.static100))

        Text(
            text = match.home?.key ?: "--",
            style = FirefoxTheme.typography.subtitle2,
        )

        Spacer(Modifier.weight(1f))

        if (scoreText != null) {
            Text(text = scoreText, style = FirefoxTheme.typography.subtitle2)
        } else if (isTeamSelected || group != null) {
            Text(
                text = "$upcomingPrefix · ${match.time}",
                style = FirefoxTheme.typography.body2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Spacer(Modifier.weight(1f))

        Text(
            text = match.away?.key ?: "--",
            style = FirefoxTheme.typography.subtitle2,
        )

        Spacer(Modifier.width(FirefoxTheme.layout.space.static100))

        FlagContainer(
            flagResId = match.away?.flagResId,
            modifier = Modifier.size(width = 30.dp, height = 20.dp),
        )
    }
}

@Composable
private fun buildRowContentDescription(
    homeName: String,
    awayName: String,
    scoreText: String?,
    upcomingPrefix: String,
    time: String,
): String = if (scoreText != null) {
    stringResource(
        R.string.sports_widget_match_content_description,
        homeName,
        awayName,
        scoreText,
    )
} else {
    stringResource(
        R.string.sports_widget_upcoming_match_content_description,
        homeName,
        awayName,
        upcomingPrefix,
        time,
    )
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
    override val values = sequenceOf(
        RelatedMatchesPreviewState(
            labelResId = R.string.sports_widget_related_matches,
            matches = FakeSportsPreview.relatedMatches(),
        ),
        RelatedMatchesPreviewState(
            labelResId = null,
            matches = listOf(
                FakeSportsPreview.match(
                    homeScore = 1,
                    awayScore = 2,
                    matchStatus = MatchStatus.Live(period = "2", clock = "67"),
                ),
                FakeSportsPreview.match(
                    homeScore = 1,
                    awayScore = 2,
                    matchStatus = MatchStatus.Final,
                ),
                FakeSportsPreview.match(
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
            RelatedMatchesSection(matches = state.matches, isTeamSelected = true, onMatchClicked = { _, _, _ -> })
        }
    }
}
