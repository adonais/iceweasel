/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups

import androidx.compose.animation.rememberSplineBasedDecay
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.browser.state.state.createTab
import mozilla.components.compose.base.RadioCheckmarkColors
import mozilla.components.compose.base.theme.surfaceDimVariant
import mozilla.components.support.base.utils.MAX_URI_LENGTH
import mozilla.components.support.utils.ext.isLandscape
import mozilla.components.ui.colors.PhotonColors
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.SwipeToDismissState2
import org.mozilla.fenix.compose.TabThumbnail
import org.mozilla.fenix.compose.TabThumbnailImageData
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.TabsTrayTestTag.TAB_GROUP_TITLE
import org.mozilla.fenix.tabstray.data.TabGroupTheme
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.ui.tabitems.LOREM_IPSUM
import org.mozilla.fenix.tabstray.ui.tabitems.MultiSelectTabButton
import org.mozilla.fenix.tabstray.ui.tabitems.TabContentCardShape
import org.mozilla.fenix.tabstray.ui.tabitems.TabGridTabItem
import org.mozilla.fenix.tabstray.ui.tabitems.TabHeaderIconTouchTargetSize
import org.mozilla.fenix.tabstray.ui.tabitems.TabsTrayItemClickHandler
import org.mozilla.fenix.tabstray.ui.tabitems.TabsTrayItemSelectionState
import org.mozilla.fenix.tabstray.ui.tabitems.ThumbnailShape
import org.mozilla.fenix.tabstray.ui.tabitems.gridItemAspectRatio
import org.mozilla.fenix.tabstray.ui.tabitems.tabItemClickable
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.R as iconsR

const val TOP_START_THUMBNAIL_INDEX = 0
const val TOP_END_THUMBNAIL_INDEX = 1
const val BOTTOM_START_THUMBNAIL_INDEX = 2
const val BOTTOM_END_THUMBNAIL_INDEX = 3

/**
 * A Tab Group presented as a clickable item in a grid.
 * @param group: The data of the [TabsTrayItem.TabGroup].
 * @param selectionState: The tab selection state.
 * @param clickHandler: Handler for all click-handling inputs (long click, click, etc)
 * @param modifier: The Modifier
 * @param thumbnailSizePx: The size of each thumbnail in px.
 */
@Composable
fun TabGroupCard(
    group: TabsTrayItem.TabGroup,
    selectionState: TabsTrayItemSelectionState,
    clickHandler: TabsTrayItemClickHandler,
    modifier: Modifier = Modifier,
    thumbnailSizePx: Int,
) {
    Box(
        modifier = modifier
            .wrapContentSize()
            .testTag(TabsTrayTestTag.TAB_ITEM_ROOT),
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clip(TabContentCardShape)
                .tabItemClickable(
                    clickHandler = clickHandler,
                    clickedItem = group,
                ),
            shape = TabContentCardShape,
            border = if (selectionState.isFocused) {
                BorderStroke(width = 4.dp, color = MaterialTheme.colorScheme.tertiary)
            } else {
                null
            },
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
            ),
        ) {
            Column {
                // Title Row
                Row(
                    modifier = Modifier
                        .background(color = group.theme.primary)
                        .fillMaxWidth()
                        .wrapContentHeight(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Spacer(
                        modifier = Modifier
                            .width(FirefoxTheme.layout.space.static100),
                    )

                    Text(
                        text = group.title.take(MAX_URI_LENGTH),
                        modifier = Modifier
                            .weight(1f)
                            .testTag(TAB_GROUP_TITLE),
                        color = group.theme.onPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = FirefoxTheme.typography.caption,
                    )

                    Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static50))

                    TabGroupOptionButton(groupTheme = group.theme, selectionState = selectionState)
                }

                Spacer(
                    modifier = Modifier
                        .height(FirefoxTheme.layout.space.static25),
                )

                // 4x4 Thumbnail Grid
                Card(
                    modifier = Modifier
                        .aspectRatio(gridItemAspectRatio)
                        .padding(horizontal = FirefoxTheme.layout.space.static50),
                    shape = ThumbnailShape,
                ) {
                    ThumbnailsGridView(
                        thumbnails = group.thumbnails,
                        thumbnailSizePx = thumbnailSizePx,
                    )
                }

                Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static50))
            }
        }
    }
}

/**
 * Renders the button in the top-right corner of the TabGroupCard.
 */
@Composable
private fun TabGroupOptionButton(groupTheme: TabGroupTheme, selectionState: TabsTrayItemSelectionState) {
    if (selectionState.multiSelectEnabled) {
        MultiSelectTabButton(
            isSelected = selectionState.isSelected,
            isActive = selectionState.isFocused,
            activeColors = RadioCheckmarkColors.default(),
            uncheckedBorderColor = groupTheme.onPrimary,
        )
    } else {
        IconButton(
            modifier = Modifier
                .size(TabHeaderIconTouchTargetSize)
                .testTag(TabsTrayTestTag.TAB_GROUP_THREE_DOT_BUTTON),
            onClick = {
            },
        ) {
            Icon(
                painter = painterResource(id = iconsR.drawable.ic_menu),
                contentDescription = stringResource(R.string.content_description_menu),
                tint = groupTheme.onPrimary,
            )
        }
    }
}

/**
 * * Renders up to 4 Tab thumbnails in a 2x2 grid.
 * @param thumbnails: List of thumbnails.  May be empty, or up to size 4.
 * @param thumbnailSizePx: The size of each thumbnail in px.
 * @param modifier: Modifier parameter
 */
@Composable
private fun ThumbnailsGridView(
    thumbnails: List<TabThumbnailImageData>,
    thumbnailSizePx: Int,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(color = MaterialTheme.colorScheme.surfaceContainerHighest),
        verticalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static25),
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static25),
        ) {
            TabGroupThumbnail(
                tabThumbnailImageData = thumbnails.getOrNull(TOP_START_THUMBNAIL_INDEX),
                thumbnailSizePx = thumbnailSizePx,
                modifier = Modifier
                    .weight(1f)
                    .testTag(TabsTrayTestTag.TAB_GROUP_THUMBNAIL_FIRST),
            )
            TabGroupThumbnail(
                tabThumbnailImageData = thumbnails.getOrNull(TOP_END_THUMBNAIL_INDEX),
                thumbnailSizePx = thumbnailSizePx,
                modifier = Modifier
                    .weight(1f)
                    .testTag(TabsTrayTestTag.TAB_GROUP_THUMBNAIL_SECOND),
            )
        }
        Row(
            modifier =
                Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static25),
        ) {
            TabGroupThumbnail(
                tabThumbnailImageData = thumbnails.getOrNull(BOTTOM_START_THUMBNAIL_INDEX),
                thumbnailSizePx = thumbnailSizePx,
                modifier = Modifier
                    .weight(1f)
                    .testTag(TabsTrayTestTag.TAB_GROUP_THUMBNAIL_THIRD),
            )
            TabGroupThumbnail(
                tabThumbnailImageData = thumbnails.getOrNull(BOTTOM_END_THUMBNAIL_INDEX),
                thumbnailSizePx = thumbnailSizePx,
                modifier = Modifier
                    .weight(1f)
                    .testTag(TabsTrayTestTag.TAB_GROUP_THUMBNAIL_FOURTH),
            )
        }
    }
}

/**
 * A TabGroup has anywhere from 0 to 4 thumbnail images.
 * Renders a thumbnail image if thumbnail image data is available,
 * or an empty box if the thumbnail image data is null.
 *
 * @param tabThumbnailImageData: thumbnail image data (may be null)
 * @param thumbnailSizePx: the size of each thumbnail in px
 * @param modifier: The modifier
 */
@Composable
private fun TabGroupThumbnail(
    tabThumbnailImageData: TabThumbnailImageData?,
    thumbnailSizePx: Int,
    modifier: Modifier = Modifier,
) {
    if (tabThumbnailImageData != null) {
        TabThumbnail(
            tabThumbnailImageData = tabThumbnailImageData,
            thumbnailSizePx = thumbnailSizePx,
            shape = RectangleShape,
            modifier = modifier
                .aspectRatio(groupThumbnailItemAspectRatio),
        )
    } else {
        Box(
            modifier = modifier
                .background(color = MaterialTheme.colorScheme.surfaceDimVariant)
                .aspectRatio(groupThumbnailItemAspectRatio),
        )
    }
}

private data class TabGroupCardPreviewState(
    val group: TabsTrayItem.TabGroup = TabsTrayItem.TabGroup(
        title = "Tab Group Item",
        theme = TabGroupTheme.default,
        tabs = hashSetOf(),
        closed = false,
    ),
    val title: String = "Group 1",
    val color: Color = PhotonColors.Pink70,
    val selectionState: TabsTrayItemSelectionState =
        TabsTrayItemSelectionState(
            isSelected = false,
            isFocused = false,
            multiSelectEnabled = false,
        ),
    val groupSize: Int,
)

private class TabGroupCardPreviewProvider : PreviewParameterProvider<TabGroupCardPreviewState> {
    val data = listOf(
        Pair("Empty", TabGroupCardPreviewState(groupSize = 4)),
        Pair("1 Tab", TabGroupCardPreviewState(groupSize = 1)),
        Pair("2 Tabs", TabGroupCardPreviewState(groupSize = 2)),
        Pair("3 Tabs", TabGroupCardPreviewState(groupSize = 3)),
        Pair("4 Tabs", TabGroupCardPreviewState(groupSize = 4)),
        Pair(
            "No Title",
            TabGroupCardPreviewState(title = "", groupSize = 4),
        ),
        Pair(
            "Long Title",
            TabGroupCardPreviewState(title = LOREM_IPSUM, groupSize = 4),
        ),
        Pair(
            "Active",
            TabGroupCardPreviewState(
                selectionState =
                    TabsTrayItemSelectionState(
                        isFocused = true,
                        isSelected = false,
                        multiSelectEnabled = false,
                    ),
                groupSize = 4,
            ),
        ),
        Pair(
            "Select mode",
            TabGroupCardPreviewState(
                selectionState =
                    TabsTrayItemSelectionState(
                        isFocused = false,
                        isSelected = false,
                        multiSelectEnabled = true,
                    ),
                groupSize = 4,
            ),
        ),
        Pair(
            "Selected",
            TabGroupCardPreviewState(
                selectionState =
                    TabsTrayItemSelectionState(
                        isFocused = false,
                        isSelected = true,
                        multiSelectEnabled = true,
                    ),
                groupSize = 4,
            ),
        ),
        Pair(
            "Active selected",
            TabGroupCardPreviewState(
                selectionState =
                    TabsTrayItemSelectionState(
                        isFocused = true,
                        isSelected = true,
                        multiSelectEnabled = true,
                    ),
                groupSize = 4,
            ),
        ),
    )

    override val values: Sequence<TabGroupCardPreviewState>
        get() = data.map { it.second }.asSequence()

    override fun getDisplayName(index: Int): String {
        return data[index].first
    }
}

private class ThumbnailsGridViewPreviewProvider :
    PreviewParameterProvider<List<TabThumbnailImageData>> {
    val data = listOf(
        Pair("Empty", emptyList()),
        Pair("1 Tab", fakeThumbnails(1)),
        Pair("2 Tabs", fakeThumbnails(2)),
        Pair("3 Tabs", fakeThumbnails(3)),
        Pair("4 Tabs", fakeThumbnails(4)),
    )
    override val values: Sequence<List<TabThumbnailImageData>>
        get() = data.map { it.second }.asSequence()

    override fun getDisplayName(index: Int): String {
        return data[index].first
    }
}

@PreviewLightDark
@Composable
private fun ThumbnailsGridViewPreview(
    @PreviewParameter(ThumbnailsGridViewPreviewProvider::class)
    thumbnails: List<TabThumbnailImageData>,
) {
    FirefoxTheme {
        ThumbnailsGridView(thumbnails = thumbnails, thumbnailSizePx = 12)
    }
}

@Preview(device = "id:pixel_tablet")
@Composable
private fun TabGroupCardTablet() {
    FirefoxTheme {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.Top,
        ) {
            TabGridTabItem(
                tab = TabsTrayItem.Tab(
                    createTab(
                        url = "about:home",
                        title = "Tab Item",
                    ),
                ),
                modifier = Modifier.weight(1f),
                thumbnailSizePx = 50,
                selectionState = TabsTrayItemSelectionState(
                    isSelected = false,
                    isFocused = false,
                    multiSelectEnabled = false,
                ),
                swipeState = SwipeToDismissState2(
                    density = LocalDensity.current,
                    isRtl = false,
                    decayAnimationSpec = rememberSplineBasedDecay(),
                ),
                onClick = {},
                onCloseClick = {},
            )
            TabGroupCard(
                group = TabsTrayItem.TabGroup(
                    title = "Tab Group Item",
                    theme = TabGroupTheme.default,
                    tabs = hashSetOf(),
                    closed = false,
                ),
                selectionState = TabsTrayItemSelectionState(
                    isSelected = false,
                    isFocused = false,
                    multiSelectEnabled = false,
                ),
                thumbnailSizePx = 12,
                clickHandler = TabsTrayItemClickHandler(
                    enabled = true,
                    onClick = { item: TabsTrayItem -> {} },
                    onCloseClick = { item: TabsTrayItem -> {} },
                    onLongClick = { item: TabsTrayItem -> {} },
                ),
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun TabGroupCardPreview(
    @PreviewParameter(TabGroupCardPreviewProvider::class) tabGroupCardState: TabGroupCardPreviewState,
) {
    FirefoxTheme {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.Top,
        ) {
            TabGridTabItem(
                tab = TabsTrayItem.Tab(
                    createTab(
                        url = "about:home",
                        title = "Kit's Blog",
                    ),
                ),
                thumbnailSizePx = 50,
                selectionState = tabGroupCardState.selectionState,
                modifier = Modifier.weight(1f),
                swipeState = SwipeToDismissState2(
                    density = LocalDensity.current,
                    isRtl = false,
                    decayAnimationSpec = rememberSplineBasedDecay(),
                    enabled = false,
                ),
                onCloseClick = {},
                onClick = {},
            )

            TabGroupCard(
                group = tabGroupCardState.group,
                selectionState = tabGroupCardState.selectionState,
                thumbnailSizePx = 12,
                clickHandler = TabsTrayItemClickHandler(
                    enabled = true,
                    onClick = { item: TabsTrayItem -> {} },
                    onCloseClick = { item: TabsTrayItem -> {} },
                    onLongClick = { item: TabsTrayItem -> {} },
                ),
                modifier = Modifier.weight(1f),
            )
        }
    }
}

internal fun fakeThumbnails(limit: Int = 4): List<TabThumbnailImageData> {
    return listOf(
        TabThumbnailImageData(
            tabId = "1",
            isPrivate = false,
            tabUrl = "mozilla.org",
            tabIcon = null,
        ),
        TabThumbnailImageData(
            tabId = "1",
            isPrivate = false,
            tabUrl = "mozilla.org",
            tabIcon = null,
        ),
        TabThumbnailImageData(
            tabId = "1",
            isPrivate = false,
            tabUrl = "mozilla.org",
            tabIcon = null,
        ),
        TabThumbnailImageData(
            tabId = "1",
            isPrivate = false,
            tabUrl = "mozilla.org",
            tabIcon = null,
        ),
    ).subList(0, limit)
}

/**
 * The width to height ratio of each group thumbnail item.
 * In landscape mode, the width to height ratio is 2:1
 * and in portrait mode, the width to height ratio is approximately 13:17.
 * This differs from the single 4:5 thumbnail in order to arrange the
 * four thumbnail grid as a unit into an approximate 4:5 ratio.
 */
private val groupThumbnailItemAspectRatio: Float
    @Composable
    @ReadOnlyComposable
    get() = if (LocalContext.current.isLandscape()) {
        1.98f
    } else {
        0.76f
    }
