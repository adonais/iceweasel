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
import org.mozilla.fenix.home.sports.FollowedTeamOutcome
import org.mozilla.fenix.home.sports.LiveMatchRefreshSource
import org.mozilla.fenix.home.sports.SportCardErrorState
import org.mozilla.fenix.home.sports.Team
import org.mozilla.fenix.home.sports.WORLD_CUP_KICKOFF_UTC
import org.mozilla.fenix.home.sports.regionGrouping
import org.mozilla.fenix.home.ui.horizontalMargin
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.home.sports.MatchCard as MatchCardState

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
    onMatchClicked: (String?, String?, String?) -> Unit,
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
            // Even pre-tournament, surface the error card when a fetch failure is
            // active so the user sees the failure instead of the countdown promo.
            if (sportsWidgetState.errorState != null) {
                SportsWidgetErrorCard(
                    error = sportsWidgetState.errorState,
                    onRefresh = { onRefresh(LiveMatchRefreshSource.LIVE_MATCH_ERROR_BUTTON) },
                    modifier = containerModifier,
                )
            } else {
                CountdownPromoCard(
                    dateInUtc = WORLD_CUP_KICKOFF_UTC,
                    actionButtonLabelResId = R.string.sports_widget_view_schedule,
                    onClick = onViewSchedule,
                    onDismiss = onCountdownWidgetDismiss,
                    modifier = containerModifier,
                )
            }
        }

        sportsWidgetState.isOneWeekToWorldCup || sportsWidgetState.hasWorldCupStarted -> {
            SportsCardPagerSection(
                sportsWidgetState = sportsWidgetState,
                onFollowTeam = onFollowTeam,
                onGetCustomWallpaper = onGetCustomWallpaper,
                onDismiss = onDismiss,
                onRefresh = onRefresh,
                onMatchClicked = onMatchClicked,
                modifier = containerModifier,
            )
        }
    }
}

@Composable
@Suppress("LongParameterList")
private fun SportsCardPagerSection(
    sportsWidgetState: SportsWidgetState,
    onFollowTeam: (CountrySelectorSource) -> Unit,
    onGetCustomWallpaper: () -> Unit,
    onDismiss: () -> Unit,
    onRefresh: (LiveMatchRefreshSource) -> Unit,
    onMatchClicked: (String?, String?, String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val countriesSelected = sportsWidgetState.countriesSelected
    val selectedTeam = remember(countriesSelected) {
        regionGrouping
            .asSequence()
            .flatMap { it.teams.asSequence() }
            .firstOrNull { it.key in countriesSelected }
    }

    val pagesResult = remember(
        sportsWidgetState.isOneWeekToWorldCup,
        sportsWidgetState.isFollowTeamsCardShown,
        selectedTeam,
        sportsWidgetState.matchCardStates,
        sportsWidgetState.errorState,
        onFollowTeam,
        onGetCustomWallpaper,
        onDismiss,
        onRefresh,
        onMatchClicked,
    ) {
        sportsCardPages(
            isOneWeekToWorldCup = sportsWidgetState.isOneWeekToWorldCup,
            isFollowTeamsCardShown = sportsWidgetState.isFollowTeamsCardShown,
            selectedTeam = selectedTeam,
            matchCardStates = sportsWidgetState.matchCardStates,
            errorState = sportsWidgetState.errorState,
            onFollowTeam = onFollowTeam,
            onGetCustomWallpaper = onGetCustomWallpaper,
            onRemove = onDismiss,
            onRefresh = onRefresh,
            onMatchClicked = onMatchClicked,
        )
    }

    SportsCardPager(
        isTeamSelected = selectedTeam != null,
        pages = pagesResult.pages,
        onChangeTeam = onFollowTeam,
        onGetCustomWallpaper = onGetCustomWallpaper,
        onRemove = onDismiss,
        modifier = modifier,
        championsPageIndices = pagesResult.championsPageIndices,
        errorPageIndices = pagesResult.errorPageIndices,
    )
}

private data class SportsCardPagesResult(
    val pages: List<@Composable (pageNumber: Int, pageCount: Int) -> Unit>,
    val championsPageIndices: Set<Int>,
    val errorPageIndices: Set<Int>,
)

@Suppress("LongParameterList")
private fun sportsCardPages(
    isOneWeekToWorldCup: Boolean,
    isFollowTeamsCardShown: Boolean,
    selectedTeam: Team?,
    matchCardStates: List<MatchCardState>,
    errorState: SportCardErrorState?,
    onFollowTeam: (CountrySelectorSource) -> Unit,
    onGetCustomWallpaper: () -> Unit,
    onRemove: () -> Unit,
    onRefresh: (LiveMatchRefreshSource) -> Unit,
    onMatchClicked: (String?, String?, String?) -> Unit,
): SportsCardPagesResult {
    val championsPageIndices = mutableSetOf<Int>()
    val errorPageIndices = mutableSetOf<Int>()
    val pages = buildList<@Composable (pageNumber: Int, pageCount: Int) -> Unit> {
        if (addCollapsedErrorPage(matchCardStates, errorState, onRefresh, errorPageIndices)) {
            return@buildList
        }
        addPromoPage(isOneWeekToWorldCup, isFollowTeamsCardShown, selectedTeam, matchCardStates, onFollowTeam)

        matchCardStates.forEach { matchCardState ->
            if (shouldDisplayChampionsCard(matchCardState.viewerOutcome)) {
                championsPageIndices.add(size)
                add(championsCardPage(matchCardState, onMatchClicked, onGetCustomWallpaper, onRemove))
            } else {
                add(matchCardPage(matchCardState, errorState, selectedTeam != null, onRefresh, onMatchClicked))
            }
        }
    }
    return SportsCardPagesResult(pages, championsPageIndices, errorPageIndices)
}

/**
 * When [errorState] is set and no live match exists in [matchCardStates], collapses the
 * whole pager into a single [SportsWidgetErrorCard] page and returns `true`. Otherwise
 * returns `false` without modifying the list — when a live match is present, [MatchCard]
 * swaps the error in-line within that one card and the surrounding pages keep their
 * content, so the page list (and the user's pager position) stays stable.
 */
private fun MutableList<@Composable (pageNumber: Int, pageCount: Int) -> Unit>.addCollapsedErrorPage(
    matchCardStates: List<MatchCardState>,
    errorState: SportCardErrorState?,
    onRefresh: (LiveMatchRefreshSource) -> Unit,
    errorPageIndices: MutableSet<Int>,
): Boolean {
    if (errorState == null) return false
    val anyLive = matchCardStates.any { card ->
        (card.matches + card.relatedMatches).any { it.matchStatus.isLive() }
    }
    if (anyLive) return false

    errorPageIndices.add(size)
    add { _, _ ->
        SportsWidgetErrorCard(
            error = errorState,
            onRefresh = { onRefresh(LiveMatchRefreshSource.LIVE_MATCH_ERROR_BUTTON) },
            modifier = Modifier.fillMaxWidth(),
        )
    }
    return true
}

/**
 * Prepends the leading promo card that precedes the match cards: either the "follow
 * your team" / pre-tournament countdown card (if the user hasn't followed a team yet),
 * or the "you're following X" card (if a team is followed but no matches are available).
 * Adds nothing when neither applies.
 */
private fun MutableList<@Composable (pageNumber: Int, pageCount: Int) -> Unit>.addPromoPage(
    isOneWeekToWorldCup: Boolean,
    isFollowTeamsCardShown: Boolean,
    selectedTeam: Team?,
    matchCardStates: List<MatchCardState>,
    onFollowTeam: (CountrySelectorSource) -> Unit,
) {
    when {
        isFollowTeamsCardShown ->
            add(if (isOneWeekToWorldCup) countdownFollowTeamPage(onFollowTeam) else followTeamPromoPage(onFollowTeam))
        selectedTeam != null && matchCardStates.isEmpty() ->
            add(followingPromoPage(selectedTeam))
    }
}

private fun countdownFollowTeamPage(
    onFollowTeam: (CountrySelectorSource) -> Unit,
): @Composable (pageNumber: Int, pageCount: Int) -> Unit = { pageNumber, pageCount ->
    CountdownPromoCard(
        dateInUtc = WORLD_CUP_KICKOFF_UTC,
        actionButtonLabelResId = R.string.sports_widget_country_selector_title,
        onClick = { onFollowTeam(CountrySelectorSource.COUNTDOWN_CARD_FOLLOW_TEAM_BUTTON) },
        onDismiss = null,
        pageNumber = pageNumber,
        pageCount = pageCount,
    )
}

private fun followTeamPromoPage(
    onFollowTeam: (CountrySelectorSource) -> Unit,
): @Composable (pageNumber: Int, pageCount: Int) -> Unit = { pageNumber, pageCount ->
    FollowTeamPromoCard(
        onFollowTeam = onFollowTeam,
        pageNumber = pageNumber,
        pageCount = pageCount,
    )
}

private fun followingPromoPage(
    team: Team,
): @Composable (pageNumber: Int, pageCount: Int) -> Unit = { pageNumber, pageCount ->
    FollowingPromoCard(
        team = team,
        pageNumber = pageNumber,
        pageCount = pageCount,
    )
}

private fun championsCardPage(
    state: MatchCardState,
    onMatchClicked: (String?, String?, String?) -> Unit,
    onGetCustomWallpaper: () -> Unit,
    onRemove: () -> Unit,
): @Composable (pageNumber: Int, pageCount: Int) -> Unit = { pageNumber, pageCount ->
    ChampionsCard(
        state = state,
        onMatchClicked = onMatchClicked,
        onGetCustomWallpaper = onGetCustomWallpaper,
        onRemove = onRemove,
        pageNumber = pageNumber,
        pageCount = pageCount,
    )
}

private fun matchCardPage(
    state: MatchCardState,
    errorState: SportCardErrorState?,
    isTeamSelected: Boolean,
    onRefresh: (LiveMatchRefreshSource) -> Unit,
    onMatchClicked: (String?, String?, String?) -> Unit,
): @Composable (pageNumber: Int, pageCount: Int) -> Unit = { pageNumber, pageCount ->
    MatchCard(
        state = state,
        errorState = errorState,
        isTeamSelected = isTeamSelected,
        onRefresh = onRefresh,
        onMatchClicked = onMatchClicked,
        pageNumber = pageNumber,
        pageCount = pageCount,
    )
}

private fun shouldDisplayChampionsCard(followedTeamOutcome: FollowedTeamOutcome): Boolean =
    when (followedTeamOutcome) {
        is FollowedTeamOutcome.TournamentWinner, is FollowedTeamOutcome.ThirdPlace -> true
        else -> false
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
