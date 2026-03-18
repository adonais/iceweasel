/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import mozilla.components.browser.state.state.createTab
import mozilla.components.compose.base.theme.surfaceDimVariant
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.TabThumbnailImageData
import org.mozilla.fenix.tabstray.data.TabGroupTheme
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.theme.FirefoxTheme

private val ROUNDED_CORNER_SHAPE = RoundedCornerShape(4.dp)
private val THUMBNAIL_WIDTH = 78.dp
private val THUMBNAIL_HEIGHT = 68.dp
private val GRID_THUMBNAIL_WIDTH = 37.dp
private val TAB_GROUP_LIST_ASPECT_RATIO = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT

/**
 * A Tab Group presented as a clickable item in a row or list.
 *
 * @param tabGroup The tab group to display.
 * @param onClick The action to be performed when the tab group item is clicked.
 * @param modifier The Modifier
 */
@Composable
fun TabGroupRow(
    tabGroup: TabsTrayItem.TabGroup,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static200),
    ) {
        TabGroupListThumbnail(
            thumbnails = tabGroup.thumbnails,
            modifier = Modifier
                .size(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
                .border(
                        width = 1.dp,
                        color = MaterialTheme.colorScheme.surfaceDimVariant,
                        shape = ROUNDED_CORNER_SHAPE,
                ),
        )

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(18.dp)
                        .background(
                            color = tabGroup.theme.primary,
                            shape = CircleShape,
                        ),
                )

                Spacer(modifier = Modifier.width(4.dp))

                Text(
                    text = tabGroup.title,
                    style = FirefoxTheme.typography.body1,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = pluralStringResource(
                    id = R.plurals.tab_group_tabs_count_subtitle,
                    count = tabGroup.tabs.size,
                    tabGroup.tabs.size,
                ),
                style = FirefoxTheme.typography.caption,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun TabGroupListThumbnail(
    thumbnails: List<TabThumbnailImageData>,
    modifier: Modifier = Modifier,
) {
    val thumbnailSizePx = LocalDensity.current.run { GRID_THUMBNAIL_WIDTH.roundToPx() }

    Card(
        modifier = modifier,
        shape = ROUNDED_CORNER_SHAPE,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
        ),
    ) {
        ThumbnailsGridView(
            thumbnails = thumbnails,
            thumbnailSizePx = thumbnailSizePx,
            aspectRatio = TAB_GROUP_LIST_ASPECT_RATIO,
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun TabGroupRowPreview() {
    val tab = TabsTrayItem.Tab(createTab("test1"))
    val tab2 = TabsTrayItem.Tab(createTab("test2"))
    val tab3 = TabsTrayItem.Tab(createTab("test3"))
    val tab4 = TabsTrayItem.Tab(createTab("test4"))

    TabGroupRow(
        tabGroup = TabsTrayItem.TabGroup(
            title = "Tab Group",
            theme = TabGroupTheme.default,
            tabs = hashSetOf(tab, tab2, tab3, tab4),
            closed = false,
        ),
        onClick = {},
    )
}
