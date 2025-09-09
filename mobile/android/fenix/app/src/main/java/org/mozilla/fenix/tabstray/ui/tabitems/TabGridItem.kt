/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.tabitems

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.state.createTab
import mozilla.components.compose.base.RadioCheckmark
import mozilla.components.compose.base.RadioCheckmarkColors
import mozilla.components.support.base.utils.MAX_URI_LENGTH
import mozilla.components.support.utils.ext.isLandscape
import mozilla.components.ui.colors.PhotonColors
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.SwipeToDismissBox2
import org.mozilla.fenix.compose.SwipeToDismissState2
import org.mozilla.fenix.compose.TabThumbnail
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.ext.toDisplayTitle
import org.mozilla.fenix.theme.FirefoxTheme
import kotlin.math.max

private val ThumbnailPadding = 4.dp

/**
 * Tab grid item used to display a tab that supports clicks,
 * long clicks, multiple selection, and media controls.
 *
 * @param tab The given tab to be render as view a grid item.
 * @param isSelected Indicates if the item should be render as selected.
 * @param multiSelectionEnabled Indicates if the item should be render with multi selection options,
 * enabled.
 * @param multiSelectionSelected Indicates if the item should be render as multi selection selected
 * option.
 * @param shouldClickListen Whether or not the item should stop listening to click events.
 * @param swipeState The swipe state of the item.
 * @param onCloseClick Callback to handle the click event of the close button.
 * @param onClick Callback to handle when item is clicked.
 * @param onLongClick Optional callback to handle when item is long clicked.
 */
@Composable
fun TabGridItem(
    tab: TabSessionState,
    isSelected: Boolean = false,
    multiSelectionEnabled: Boolean = false,
    multiSelectionSelected: Boolean = false,
    shouldClickListen: Boolean = true,
    swipeState: SwipeToDismissState2,
    onCloseClick: (tab: TabSessionState) -> Unit,
    onClick: (tab: TabSessionState) -> Unit,
    onLongClick: ((tab: TabSessionState) -> Unit)? = null,
) {
    BoxWithConstraints {
        val density = LocalDensity.current
        val thumbnailWidth = this.constraints.minWidth - with(density) { 2 * ThumbnailPadding.roundToPx() }
        val thumbnailHeight = (thumbnailWidth / gridItemAspectRatio).toInt()
        val thumbnailSize = max(thumbnailWidth, thumbnailHeight)

        SwipeToDismissBox2(
            state = swipeState,
            backgroundContent = {},
            onItemDismiss = {
                onCloseClick(tab)
            },
        ) {
            TabContent(
                tab = tab,
                thumbnailSize = thumbnailSize,
                isSelected = isSelected,
                multiSelectionEnabled = multiSelectionEnabled,
                multiSelectionSelected = multiSelectionSelected,
                shouldClickListen = shouldClickListen,
                onCloseClick = onCloseClick,
                onClick = onClick,
                onLongClick = onLongClick,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Suppress("LongMethod")
@Composable
private fun TabContent(
    tab: TabSessionState,
    thumbnailSize: Int,
    isSelected: Boolean = false,
    multiSelectionEnabled: Boolean = false,
    multiSelectionSelected: Boolean = false,
    shouldClickListen: Boolean = true,
    onCloseClick: (tab: TabSessionState) -> Unit,
    onClick: (tab: TabSessionState) -> Unit,
    onLongClick: ((tab: TabSessionState) -> Unit)? = null,
) {
    // Used to propagate the ripple effect to the whole tab
    val interactionSource = remember { MutableInteractionSource() }

    Box(
        modifier = Modifier
            .wrapContentSize()
            .testTag(TabsTrayTestTag.TAB_ITEM_ROOT),
    ) {
        val clickableModifier = if (onLongClick == null) {
            Modifier.clickable(
                enabled = shouldClickListen,
                interactionSource = interactionSource,
                indication = ripple(
                    color = clickableColor(),
                ),
                onClick = { onClick(tab) },
            )
        } else {
            Modifier.combinedClickable(
                enabled = shouldClickListen,
                interactionSource = interactionSource,
                indication = ripple(
                    color = clickableColor(),
                ),
                onLongClick = { onLongClick(tab) },
                onClick = { onClick(tab) },
            )
        }

        val tabContentCardShape = RoundedCornerShape(16.dp)

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(gridItemAspectRatio)
                .clip(tabContentCardShape)
                .then(clickableModifier)
                .semantics {
                    selected = isSelected
                },
            shape = tabContentCardShape,
            colors = CardDefaults.cardColors(
                containerColor = if (isSelected) {
                    MaterialTheme.colorScheme.primary
                } else if (multiSelectionSelected) {
                    MaterialTheme.colorScheme.primaryContainer
                } else {
                    MaterialTheme.colorScheme.surfaceContainerHighest
                },
            ),
        ) {
            Column(
                modifier = Modifier.padding(ThumbnailPadding),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(all = FirefoxTheme.layout.space.static50)
                        .wrapContentHeight(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val icon = tab.content.icon
                    if (icon != null) {
                        icon.prepareToDraw()
                        Image(
                            bitmap = icon.asImageBitmap(),
                            contentDescription = null,
                            modifier = Modifier.size(12.dp),
                        )

                        Spacer(modifier = Modifier.width(4.dp))
                    } else {
                        Box(
                            modifier = Modifier.size(24.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                painter = painterResource(id = R.drawable.mozac_ic_globe_24),
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                                tint = if (isSelected) {
                                    MaterialTheme.colorScheme.onPrimary
                                } else {
                                    MaterialTheme.colorScheme.onSurface
                                },
                            )
                        }
                    }

                    Text(
                        text = tab.toDisplayTitle().take(MAX_URI_LENGTH),
                        modifier = Modifier.weight(1f),
                        color = if (isSelected) {
                            MaterialTheme.colorScheme.onPrimary
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = FirefoxTheme.typography.caption,
                    )

                    if (!multiSelectionEnabled) {
                        IconButton(
                            modifier = Modifier
                                .size(20.dp)
                                .testTag(TabsTrayTestTag.TAB_ITEM_CLOSE),
                            onClick = {
                                onCloseClick(tab)
                            },
                        ) {
                            Icon(
                                painter = painterResource(id = R.drawable.mozac_ic_cross_20),
                                contentDescription = stringResource(
                                    id = R.string.close_tab_title,
                                    tab.toDisplayTitle(),
                                ),
                                tint = if (isSelected) {
                                    MaterialTheme.colorScheme.onPrimary
                                } else {
                                    MaterialTheme.colorScheme.onSurface
                                },
                            )
                        }
                    } else {
                        RadioCheckmark(
                            isSelected = multiSelectionSelected,
                            colors = if (isSelected) {
                                RadioCheckmarkColors.default(
                                    backgroundColor = MaterialTheme.colorScheme.onPrimary,
                                    checkmarkColor = MaterialTheme.colorScheme.primary,
                                    borderColor = MaterialTheme.colorScheme.onPrimary,
                                )
                            } else {
                                RadioCheckmarkColors.default()
                            },
                        )
                    }
                }

                val thumbnailShape = RoundedCornerShape(
                    topStart = 4.dp,
                    topEnd = 4.dp,
                    bottomStart = 12.dp,
                    bottomEnd = 12.dp,
                )
                Card(
                    shape = thumbnailShape,
                ) {
                    Thumbnail(
                        tab = tab,
                        size = thumbnailSize,
                        shape = thumbnailShape,
                    )
                }
            }
        }
    }
}

/**
 * The width to height ratio of the tab grid item. In landscape mode, the width to height ratio is
 * 2:1 and in portrait mode, the width to height ratio is 4:5.
 */
private val gridItemAspectRatio: Float
    @Composable
    @ReadOnlyComposable
    get() = if (LocalContext.current.isLandscape()) {
        2f
    } else {
        0.8f
    }

@Composable
private fun clickableColor() = when (isSystemInDarkTheme()) {
    true -> PhotonColors.White
    false -> PhotonColors.Black
}

/**
 * Thumbnail specific for the [TabGridItem], which can be selected.
 *
 * @param tab Tab, containing the thumbnail to be displayed.
 * @param size Size of the thumbnail.
 * @param shape Shape of the thumbnail card.
 */
@Composable
private fun Thumbnail(
    tab: TabSessionState,
    size: Int,
    shape: Shape,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(FirefoxTheme.colors.layer2)
            .semantics(mergeDescendants = true) {
                testTag = TabsTrayTestTag.TAB_ITEM_THUMBNAIL
            },
    ) {
        TabThumbnail(
            tab = tab,
            size = size,
            modifier = Modifier.fillMaxSize(),
            shape = shape,
        )
    }
}

private data class TabGridItemPreviewState(
    val isSelected: Boolean,
    val multiSelectionEnabled: Boolean,
    val multiSelectionSelected: Boolean,
    val url: String = "www.mozilla.org",
    val title: String = "Mozilla Domain",
)

private class TabGridItemParameterProvider : PreviewParameterProvider<TabGridItemPreviewState> {
    override val values: Sequence<TabGridItemPreviewState>
        get() = sequenceOf(
            TabGridItemPreviewState(
                isSelected = false,
                multiSelectionEnabled = false,
                multiSelectionSelected = false,
            ),
            TabGridItemPreviewState(
                isSelected = true,
                multiSelectionEnabled = false,
                multiSelectionSelected = false,
            ),
            TabGridItemPreviewState(
                isSelected = false,
                multiSelectionEnabled = true,
                multiSelectionSelected = false,
            ),
            TabGridItemPreviewState(
                isSelected = true,
                multiSelectionEnabled = true,
                multiSelectionSelected = false,
            ),
            TabGridItemPreviewState(
                isSelected = false,
                multiSelectionEnabled = true,
                multiSelectionSelected = true,
            ),
            TabGridItemPreviewState(
                isSelected = true,
                multiSelectionEnabled = true,
                multiSelectionSelected = true,
            ),
            TabGridItemPreviewState(
                isSelected = false,
                multiSelectionEnabled = false,
                multiSelectionSelected = false,
                url = "www.google.com/superlongurl",
                title = "Super super super super super super super super long title",
            ),
        )
}

@Composable
@PreviewLightDark
private fun TabGridItemPreview(
    @PreviewParameter(TabGridItemParameterProvider::class) tabGridItemState: TabGridItemPreviewState,
) {
    FirefoxTheme {
        TabContent(
            tab = createTab(
                url = tabGridItemState.url,
                title = tabGridItemState.title,
            ),
            thumbnailSize = 108,
            isSelected = tabGridItemState.isSelected,
            onCloseClick = {},
            onClick = {},
            multiSelectionEnabled = tabGridItemState.multiSelectionEnabled,
            multiSelectionSelected = tabGridItemState.multiSelectionSelected,
        )
    }
}
