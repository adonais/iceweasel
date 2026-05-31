/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.support.utils.ext.isLandscape
import org.mozilla.fenix.R
import org.mozilla.fenix.components.appstate.sports.SportsWidgetState
import org.mozilla.fenix.ext.isLargeWindow
import org.mozilla.fenix.home.ui.horizontalMargin
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Sports widget for the homepage. Renders countdown, one-week promo, or match cards based on
 * the current date and [sportsWidgetState].
 *
 * @param sportsWidgetState [SportsWidgetState] driving the widget's content.
 * @param onDismiss Invoked when the user dismisses the sports widget.
 * @param onCountdownWidgetDismiss Invoked when the user dismisses the countdown card.
 * @param onViewSchedule Invoked when the "View schedule" button is tapped.
 * @param onFollowTeam Invoked when a team is followed.
 * @param onSkip Invoked when the user dismisses the "Follow team" card.
 * @param modifier [Modifier] to apply to the composable.
 */
@Composable
@Suppress("UNUSED_PARAMETER")
fun SportsWidget(
    sportsWidgetState: SportsWidgetState,
    onDismiss: () -> Unit,
    onCountdownWidgetDismiss: () -> Unit,
    onViewSchedule: () -> Unit,
    onFollowTeam: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Spacer(modifier = Modifier.height(44.dp))

    val worldCupKickoffDate = "2026-06-11T00:00:00Z"
    val isLargeWindow = LocalContext.current.isLargeWindow()
    val isLandscape = LocalContext.current.isLandscape()
    val modifier = Modifier.fillMaxWidth(
        fraction = when {
            isLargeWindow || isLandscape -> 0.7f
            else -> 1f
        },
    )

    when {
        sportsWidgetState.isCountdownShown -> {
            CountdownPromoCard(
                dateInUtc = worldCupKickoffDate,
                actionButtonLabelResId = R.string.sports_widget_view_schedule,
                onClick = onViewSchedule,
                onDismiss = onCountdownWidgetDismiss,
                modifier = modifier.padding(horizontal = horizontalMargin),
            )
        }

        sportsWidgetState.isOneWeekToWorldCup -> {
            SportsCardPager(
                pages = oneWeekToWorldCupPages(
                    sportsWidgetState = sportsWidgetState,
                    onFollowTeam = onFollowTeam,
                    worldCupKickoffDate = worldCupKickoffDate,
                ),
                onChangeTeam = onFollowTeam,
                onGetCustomWallpaper = {},
                onRemove = onDismiss,
                modifier = modifier.padding(horizontal = horizontalMargin),
            )
        }

        sportsWidgetState.hasWorldCupStarted -> {
            SportsCardPager(
                pages = worldCupStartedPages(
                    sportsWidgetState = sportsWidgetState,
                    onFollowTeam = onFollowTeam,
                    onSkip = onSkip,
                    onDismiss = onDismiss,
                ),
                onChangeTeam = onFollowTeam,
                onGetCustomWallpaper = {},
                onRemove = onDismiss,
                modifier = modifier.padding(horizontal = horizontalMargin),
            )
        }
    }
}

private fun oneWeekToWorldCupPages(
    sportsWidgetState: SportsWidgetState,
    onFollowTeam: () -> Unit,
    worldCupKickoffDate: String,
): List<@Composable () -> Unit> = buildList {
    if (sportsWidgetState.isFollowTeamsCardShown) {
        add {
            CountdownPromoCard(
                dateInUtc = worldCupKickoffDate,
                actionButtonLabelResId = R.string.sports_widget_country_selector_title,
                onClick = onFollowTeam,
                onDismiss = null,
            )
        }
    }
    if (sportsWidgetState.matchCardState != null) {
        add {
            MatchCard(state = sportsWidgetState.matchCardState)
        }
    }
}

private fun worldCupStartedPages(
    sportsWidgetState: SportsWidgetState,
    onFollowTeam: () -> Unit,
    onSkip: () -> Unit,
    onDismiss: () -> Unit,
): List<@Composable () -> Unit> = buildList {
    if (sportsWidgetState.isFollowTeamsCardShown) {
        add {
            FollowTeamPromoCard(
                onFollowTeam = onFollowTeam,
                onSkip = onSkip,
                onDismiss = onDismiss,
            )
        }
    }
    if (sportsWidgetState.matchCardState != null) {
        add {
            MatchCard(state = sportsWidgetState.matchCardState)
        }
    }
}

@PreviewLightDark
@Composable
private fun SportsWidgetCountdownPreview() {
    FirefoxTheme {
        Surface {
            CountdownPromoCard(
                dateInUtc = "2026-06-11T19:00:00Z",
                actionButtonLabelResId = R.string.sports_widget_country_selector_title,
                onClick = {},
                onDismiss = null,
                modifier = Modifier.padding(FirefoxTheme.layout.space.static200),
            )
        }
    }
}
