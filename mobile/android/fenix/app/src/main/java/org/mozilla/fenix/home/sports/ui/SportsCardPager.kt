/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.PagerIndicator
import mozilla.components.compose.base.button.IconButton
import org.mozilla.fenix.R
import org.mozilla.fenix.home.sports.CountrySelectorSource
import org.mozilla.fenix.home.sports.Group
import org.mozilla.fenix.home.sports.Match
import org.mozilla.fenix.home.sports.MatchStatus
import org.mozilla.fenix.home.sports.Team
import org.mozilla.fenix.home.sports.TournamentRound
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.home.sports.MatchCard as MatchCardState

private const val PAGER_SIZE_ANIMATION_DURATION_MS = 180
private val PAGER_SIZE_ANIMATION_EASING = CubicBezierEasing(0.2f, 0.0f, 0.0f, 1.0f)

/**
 * Exposes the active [PagerState] to descendants so that the [ChampionsCard]
 * can render its own [PagerIndicator] in place of the shared one. `null` when no pager is active.
 */
internal val LocalSportsPagerState = compositionLocalOf<PagerState?> { null }

/**
 * Returns [baseText] with a "page X of Y" suffix appended for TalkBack, using
 * [R.string.sports_widget_page_position_content_description]. Returns [baseText] unchanged when
 * [pageNumber] is null, [pageCount] is null, or [pageCount] is 1.
 */
@Composable
internal fun pagerHeadingContentDescription(
    baseText: String,
    pageNumber: Int?,
    pageCount: Int?,
): String = if (pageNumber != null && pageCount != null && pageCount > 1) {
    stringResource(
        R.string.sports_widget_page_position_content_description,
        baseText,
        pageNumber,
        pageCount,
    )
} else {
    baseText
}

/**
 * A horizontally-swipeable pager that accepts arbitrary card composables, with a page indicator
 * overlaid at the bottom of the card and a shared overflow menu at the top end. The indicator is
 * hidden when there is only one page.
 *
 * Each page receives its 1-based position and the total page count so it can annotate its primary
 * heading for assistive technology (e.g. "Group D, page 1 of 2"). The pager itself is not a single
 * TalkBack focus stop — children inside each page remain individually focusable.
 *
 * @param pages Composables to display as pages; the order determines swipe order. Each is invoked
 * with `(pageNumber, pageCount)` where `pageNumber` is 1-based.
 * @param onChangeTeam Invoked when "Change team" is selected from the overflow menu.
 * @param onGetCustomWallpaper Invoked when "Get custom wallpaper" is selected from the overflow menu.
 * @param onRemove Invoked when "Remove" is selected from the overflow menu.
 * @param modifier [Modifier] to apply to the outer container.
 * @param championsPageIndices 0-based indices of pages for the Champion cards.
 * When the pager settles on one of these pages, the shared background, padding, and overflow menu
 * are suppressed so the page fills the full container.
 */
@Composable
fun SportsCardPager(
    pages: List<@Composable (pageNumber: Int, pageCount: Int) -> Unit>,
    onChangeTeam: (CountrySelectorSource) -> Unit,
    onGetCustomWallpaper: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
    championsPageIndices: Set<Int> = emptySet(),
) {
    val pagerState = rememberPagerState { pages.size }
    val isChampionsPage = pagerState.currentPage in championsPageIndices
    val showIndicator = pages.size > 1 && !isChampionsPage

    Column(
        modifier = modifier.sportsCardPagerContainer(
            isChampionsPage = isChampionsPage,
            showIndicator = showIndicator,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .animateContentSize(
                    animationSpec = tween(
                        durationMillis = PAGER_SIZE_ANIMATION_DURATION_MS,
                        easing = PAGER_SIZE_ANIMATION_EASING,
                    ),
                ),
        ) {
            SportsCardPagerContent(
                pagerState = pagerState,
                pages = pages,
                isChampionsPage = isChampionsPage,
            )
            if (!isChampionsPage) {
                SportsCardPagerOverflowMenu(
                    onChangeTeam = onChangeTeam,
                    onGetCustomWallpaper = onGetCustomWallpaper,
                    onRemove = onRemove,
                    modifier = Modifier.align(Alignment.TopEnd),
                )
            }
        }

        if (showIndicator) {
            PagerIndicator(
                pagerState = pagerState,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .clearAndSetSemantics {},
                inactiveColor = MaterialTheme.colorScheme.surfaceTint,
            )
        }
    }
}

@Composable
private fun Modifier.sportsCardPagerContainer(
    isChampionsPage: Boolean,
    showIndicator: Boolean,
): Modifier {
    val topPadding = if (isChampionsPage) 0.dp else FirefoxTheme.layout.space.static150
    val bottomPadding = if (showIndicator) FirefoxTheme.layout.space.static200 else 0.dp
    val backgroundColor = if (isChampionsPage) {
        Color.Transparent
    } else {
        MaterialTheme.colorScheme.surfaceContainerLowest
    }
    return this
        .semantics { isTraversalGroup = true }
        .background(color = backgroundColor, shape = MaterialTheme.shapes.large)
        .padding(top = topPadding, bottom = bottomPadding)
}

@Composable
private fun SportsCardPagerContent(
    pagerState: PagerState,
    pages: List<@Composable (pageNumber: Int, pageCount: Int) -> Unit>,
    isChampionsPage: Boolean,
) {
    val pagerBottomPadding = if (isChampionsPage) 0.dp else FirefoxTheme.layout.space.static150
    CompositionLocalProvider(LocalSportsPagerState provides pagerState) {
        HorizontalPager(
            state = pagerState,
            verticalAlignment = Alignment.Top,
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = pagerBottomPadding)
                .clipToBounds(),
        ) { page ->
            pages[page](page + 1, pages.size)
        }
    }
}

@Composable
private fun SportsCardPagerOverflowMenu(
    onChangeTeam: (CountrySelectorSource) -> Unit,
    onGetCustomWallpaper: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showMenu by remember { mutableStateOf(false) }
    val contentDescription = stringResource(R.string.sports_widget_more_options_content_description)
    Box(modifier = modifier) {
        IconButton(
            onClick = { showMenu = true },
            contentDescription = contentDescription,
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_ellipsis_vertical_24),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
        SportsWidgetMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            onChangeTeam = onChangeTeam,
            onGetCustomWallpaper = onGetCustomWallpaper,
            onRemove = onRemove,
        )
    }
}

@PreviewLightDark
@Composable
private fun SportsCardPagerPreview() {
    val usa = Team(key = "USA", flagResId = R.drawable.flag_us, group = Group.D)
    val par = Team(key = "PAR", flagResId = R.drawable.flag_py, group = Group.D)

    FirefoxTheme {
        Surface {
            SportsCardPager(
                pages = listOf(
                    { pageNumber, pageCount ->
                        CountdownPromoCard(
                            dateInUtc = "2026-06-11T00:00:00Z",
                            actionButtonLabelResId = R.string.sports_widget_country_selector_title,
                            onClick = {},
                            onDismiss = null,
                            pageNumber = pageNumber,
                            pageCount = pageCount,
                        )
                    },
                    { pageNumber, pageCount ->
                        MatchCard(
                            state = MatchCardState(
                                matches = listOf(
                                    Match(
                                        date = "Jun 22",
                                        time = "6:00 PM",
                                        home = usa,
                                        away = par,
                                        homeScore = 1,
                                        awayScore = 2,
                                        matchStatus = MatchStatus.Live(period = "1", clock = "29"),
                                    ),
                                ),
                                round = TournamentRound.GROUP_STAGE,
                                relatedMatches = emptyList(),
                            ),
                            errorState = null,
                            isTeamSelected = true,
                            modifier = Modifier.fillMaxWidth(),
                            onRefresh = {},
                            onMatchClicked = { _, _, _ -> },
                            pageNumber = pageNumber,
                            pageCount = pageCount,
                        )
                    },
                ),
                onChangeTeam = {},
                onGetCustomWallpaper = {},
                onRemove = {},
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
