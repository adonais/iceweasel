/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight.Companion.W700
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Pill displaying the score of a match.
 *
 * @param homeScore Home team score, or null if not available.
 * @param awayScore Away team score, or null if not available.
 * @param modifier [Modifier] to be applied to the pill.
 * @param isLive Whether the match is currently live.
 */
@Composable
internal fun ScorePill(
    homeScore: Int?,
    awayScore: Int?,
    modifier: Modifier = Modifier,
    isLive: Boolean = false,
) {
    val containerColor = if (isLive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.surfaceContainerHigh
    val contentColor = if (isLive) MaterialTheme.colorScheme.onError else MaterialTheme.colorScheme.onSurface

    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.extraLarge,
        color = containerColor,
    ) {
        Row(
            modifier =
                Modifier.padding(
                    horizontal = FirefoxTheme.layout.space.static200,
                    vertical = FirefoxTheme.layout.space.static50,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = homeScore?.toString() ?: "-",
                style = FirefoxTheme.typography.headline5,
                color = contentColor,
                fontWeight = W700,
            )
            Text(
                text = "-",
                modifier = Modifier.padding(horizontal = FirefoxTheme.layout.space.static50),
                style = FirefoxTheme.typography.headline5,
                color = contentColor,
                fontWeight = W700,
            )
            Text(
                text = awayScore?.toString() ?: "-",
                style = FirefoxTheme.typography.headline5,
                color = contentColor,
                fontWeight = W700,
            )
        }
    }
}

private data class ScorePillPreviewState(
    val homeScore: Int?,
    val awayScore: Int?,
    val isLive: Boolean = false,
)

private class ScorePillPreviewProvider : PreviewParameterProvider<ScorePillPreviewState> {
    override val values =
        sequenceOf(
            ScorePillPreviewState(homeScore = 1, awayScore = 1, isLive = true),
            ScorePillPreviewState(homeScore = 1, awayScore = 1),
            ScorePillPreviewState(homeScore = 0, awayScore = 0),
            ScorePillPreviewState(homeScore = 3, awayScore = 2),
            ScorePillPreviewState(homeScore = 10, awayScore = 1),
            ScorePillPreviewState(homeScore = null, awayScore = null),
            ScorePillPreviewState(homeScore = 1, awayScore = null),
        )
}

@PreviewLightDark
@Composable
private fun ScorePillPreview(@PreviewParameter(ScorePillPreviewProvider::class) state: ScorePillPreviewState) {
    FirefoxTheme {
        Surface {
            ScorePill(
                homeScore = state.homeScore,
                awayScore = state.awayScore,
                isLive = state.isLive,
            )
        }
    }
}
