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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
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
import kotlinx.coroutines.flow.collectIndexed
import kotlinx.coroutines.flow.distinctUntilChanged
import mozilla.components.compose.base.button.IconButton
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.PagerIndicator
import org.mozilla.fenix.home.sports.CountrySelectorSource
import org.mozilla.fenix.home.sports.Group
import org.mozilla.fenix.home.sports.Match
import org.mozilla.fenix.home.sports.MatchStatus
import org.mozilla.fenix.home.sports.SportsCardImpressionSource
import org.mozilla.fenix.home.sports.SportsCardType
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
 * Pairs a [SportsCardType] with its rendering composable so the pager can identify which card is
 * settled on each page without a parallel list that could drift from [pages].
 */
data class SportsPage(
    val type: SportsCardType,
    val content: @Composable (pageNumber: Int, pageCount: Int) -> Unit,
)

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
 * @param isTeamSelected Used to indicate that the user has selected a team.
 * @param pages Pages to display, paired with their [SportsCardType] so the pager can emit
 * card-typed telemetry without a parallel structure. Order determines swipe order. Each
 * [SportsPage.content] is invoked with `(pageNumber, pageCount)` where `pageNumber` is 1-based.
 * @param onChangeTeam Invoked when "Change team" is selected from the overflow menu.
 * @param onGetCustomWallpaper Invoked when "Get custom wallpaper" is selected from the overflow menu.
 * @param onRemove Invoked when "Remove" is selected from the overflow menu.
 * @param modifier [Modifier] to apply to the outer container.
 * @param onCardShown Invoked once per pages-list mount for the initially-visible card
 * ([SportsCardImpressionSource.IMPRESSION]) and once per subsequent settle on a different page
 * ([SportsCardImpressionSource.SWIPE]). With a single page only the impression fires.
 * @param championsPageIndices 0-based indices of pages for the Champion cards.
 * When the pager settles on one of these pages, the shared background, padding, and overflow menu
 * are suppressed so the page fills the full container.
 * @param errorPageIndices 0-based indices of pages that render an error card alone. When the
 * pager settles on one of these, the overflow menu is suppressed since "Change team" /
 * "Get custom wallpaper" aren't actionable while the widget is in a failure state.
 */
@Composable
fun SportsCardPager(
    isTeamSelected: Boolean,
    pages: List<SportsPage>,
    onChangeTeam: (CountrySelectorSource) -> Unit,
    onGetCustomWallpaper: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
    onCardShown: (SportsCardType, SportsCardImpressionSource) -> Unit = { _, _ -> },
    championsPageIndices: Set<Int> = emptySet(),
    errorPageIndices: Set<Int> = emptySet(),
) {
    val pagerState = rememberPagerState { pages.size }
    val isChampionsPage = pagerState.currentPage in championsPageIndices
    val isErrorPage = pagerState.currentPage in errorPageIndices
    val showIndicator = pages.size > 1 && !isChampionsPage

    LaunchedEffect(pages) {
        snapshotFlow { pagerState.settledPage }
            .distinctUntilChanged()
            .collectIndexed { emissionIndex, settledPage ->
                val source = if (emissionIndex == 0) {
                    SportsCardImpressionSource.IMPRESSION
                } else {
                    SportsCardImpressionSource.SWIPE
                }
                pages.getOrNull(settledPage)?.let { page ->
                    onCardShown(page.type, source)
                }
            }
    }

    Column(
        modifier = modifier.sportsCardPagerContainer(
            isChampionsPage = isChampionsPage,
            isErrorPage = isErrorPage,
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
                isErrorPage = isErrorPage,
            )
            if (!isChampionsPage && !isErrorPage) {
                SportsCardPagerOverflowMenu(
                    isTeamSelected = isTeamSelected,
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
    isErrorPage: Boolean,
    showIndicator: Boolean,
): Modifier {
    val topPadding = if (isChampionsPage || isErrorPage) 0.dp else FirefoxTheme.layout.space.static150
    val bottomPadding = if (showIndicator) FirefoxTheme.layout.space.static200 else 0.dp
    val backgroundColor = if (isChampionsPage) {
        Color.Transparent
    } else if (isErrorPage) {
        MaterialTheme.colorScheme.primaryContainer
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
    pages: List<SportsPage>,
    isChampionsPage: Boolean,
    isErrorPage: Boolean,
) {
    val pagerBottomPadding = if (isChampionsPage || isErrorPage) 0.dp else FirefoxTheme.layout.space.static150
    CompositionLocalProvider(LocalSportsPagerState provides pagerState) {
        HorizontalPager(
            state = pagerState,
            verticalAlignment = Alignment.Top,
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = pagerBottomPadding)
                .clipToBounds(),
        ) { page ->
            pages[page].content(page + 1, pages.size)
        }
    }
}

@Composable
private fun SportsCardPagerOverflowMenu(
    isTeamSelected: Boolean,
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
            isTeamSelected = isTeamSelected,
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
                isTeamSelected = true,
                pages = listOf(
                    SportsPage(type = SportsCardType.COUNTDOWN_PROMO) { pageNumber, pageCount ->
                        CountdownPromoCard(
                            dateInUtc = "2026-06-11T00:00:00Z",
                            actionButtonLabelResId = R.string.sports_widget_country_selector_title,
                            onClick = {},
                            onDismiss = null,
                            pageNumber = pageNumber,
                            pageCount = pageCount,
                        )
                    },
                    SportsPage(type = SportsCardType.MATCH_GROUP_STAGE) { pageNumber, pageCount ->
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
