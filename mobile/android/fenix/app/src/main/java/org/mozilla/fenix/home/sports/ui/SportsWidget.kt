/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

import android.content.res.Configuration
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.theme.layout.AcornWindowSize
import org.mozilla.fenix.R
import org.mozilla.fenix.components.appstate.sports.SportsWidgetState
import org.mozilla.fenix.home.sports.CountrySelectorSource
import org.mozilla.fenix.home.sports.LiveMatchRefreshSource
import org.mozilla.fenix.home.sports.Team
import org.mozilla.fenix.home.sports.regionGrouping
import org.mozilla.fenix.home.ui.horizontalMargin
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.home.sports.MatchCard as MatchCardState

private const val WORLD_CUP_KICKOFF_DATE = "2026-06-11T00:00:00Z"
private const val WIDE_LAYOUT_WIDTH_FRACTION = 0.7f
private const val FULL_WIDTH_FRACTION = 1f
private val SportsWidgetTopSpacing = 44.dp

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
 * @param onGetCustomWallpaper Invoked when the user clicks on the "Get custom wallpaper" menu item.
 * @param onRefresh Used to refresh the scores for live matches.
 * @param onMatchClicked Used to handle match click actions.
 * @param modifier [Modifier] to apply to the composable.
 */
@Composable
@Suppress("UNUSED_PARAMETER", "LongParameterList")
fun SportsWidget(
    sportsWidgetState: SportsWidgetState,
    onDismiss: () -> Unit,
    onCountdownWidgetDismiss: () -> Unit,
    onViewSchedule: () -> Unit,
    onFollowTeam: (CountrySelectorSource) -> Unit,
    onSkip: () -> Unit,
    onGetCustomWallpaper: () -> Unit,
    onRefresh: (LiveMatchRefreshSource) -> Unit,
    onMatchClicked: (String, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Spacer(modifier = Modifier.height(SportsWidgetTopSpacing))

    val isLandscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
    val isLargeWindow = AcornWindowSize.isLargeWindow()
    val widthFraction = if (isLargeWindow || isLandscape) {
        WIDE_LAYOUT_WIDTH_FRACTION
    } else {
        FULL_WIDTH_FRACTION
    }

    val containerModifier = modifier
        .fillMaxWidth(fraction = widthFraction)
        .padding(horizontal = horizontalMargin)

    when {
        sportsWidgetState.isCountdownShown -> {
            CountdownPromoCard(
                dateInUtc = WORLD_CUP_KICKOFF_DATE,
                actionButtonLabelResId = R.string.sports_widget_view_schedule,
                onClick = onViewSchedule,
                onDismiss = onCountdownWidgetDismiss,
                modifier = containerModifier,
            )
        }

        sportsWidgetState.isOneWeekToWorldCup || sportsWidgetState.hasWorldCupStarted -> {
            val countriesSelected = sportsWidgetState.countriesSelected
            val selectedTeam = remember(countriesSelected) {
                regionGrouping
                    .asSequence()
                    .flatMap { it.teams.asSequence() }
                    .firstOrNull { it.key in countriesSelected }
            }

            val pages = remember(
                sportsWidgetState.isOneWeekToWorldCup,
                sportsWidgetState.isFollowTeamsCardShown,
                selectedTeam,
                sportsWidgetState.matchCardStates,
                onFollowTeam,
                onRefresh,
                onMatchClicked,
            ) {
                sportsCardPages(
                    isOneWeekToWorldCup = sportsWidgetState.isOneWeekToWorldCup,
                    isFollowTeamsCardShown = sportsWidgetState.isFollowTeamsCardShown,
                    selectedTeam = selectedTeam,
                    matchCardStates = sportsWidgetState.matchCardStates,
                    onFollowTeam = onFollowTeam,
                    onRefresh = onRefresh,
                    onMatchClicked = onMatchClicked,
                )
            }

            SportsCardPager(
                pages = pages,
                onChangeTeam = onFollowTeam,
                onGetCustomWallpaper = onGetCustomWallpaper,
                onRemove = onDismiss,
                modifier = containerModifier,
            )
        }
    }
}

private fun sportsCardPages(
    isOneWeekToWorldCup: Boolean,
    isFollowTeamsCardShown: Boolean,
    selectedTeam: Team?,
    matchCardStates: List<MatchCardState>,
    onFollowTeam: (CountrySelectorSource) -> Unit,
    onRefresh: (LiveMatchRefreshSource) -> Unit,
    onMatchClicked: (String, String) -> Unit,
): List<@Composable () -> Unit> = buildList {
    if (isFollowTeamsCardShown) {
        if (isOneWeekToWorldCup) {
            add {
                CountdownPromoCard(
                    dateInUtc = WORLD_CUP_KICKOFF_DATE,
                    actionButtonLabelResId = R.string.sports_widget_country_selector_title,
                    onClick = { onFollowTeam(CountrySelectorSource.COUNTDOWN_CARD_FOLLOW_TEAM_BUTTON) },
                    onDismiss = null,
                )
            }
        } else {
            add {
                FollowTeamPromoCard(onFollowTeam = onFollowTeam)
            }
        }
    } else if (selectedTeam != null && matchCardStates.isEmpty()) {
        add {
            FollowingPromoCard(team = selectedTeam)
        }
    }

    matchCardStates.forEach { matchCardState ->
        add {
            MatchCard(
                state = matchCardState,
                isTeamSelected = selectedTeam != null,
                onRefresh = onRefresh,
                onMatchClicked = onMatchClicked,
            )
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
