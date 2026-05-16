/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import org.mozilla.fenix.R
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.data.TabGroupTheme
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.data.createTab
import org.mozilla.fenix.tabstray.data.createTabGroup
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState
import org.mozilla.fenix.tabstray.ui.tabitems.LOREM_IPSUM
import org.mozilla.fenix.tabstray.ui.tabitems.TabGroupMenuButton
import org.mozilla.fenix.tabstray.ui.tabpage.TabLayout
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

/**
 * Renders an expanded view of a user's tab group.
 * @param group: [TabsTrayItem.TabGroup] item rendered by the card.
 * @param onItemClick Invoked when the user clicks on a [TabsTrayItem] in the group.
 * @param onTabClose Invoked when the user clicks to close a [TabsTrayItem.Tab] in the group.
 * @param onDeleteTabGroup Invoked when the user clicks on delete tab group.
 * @param editTabGroupClick Invoked when the user clicks to edit the [group].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpandedTabGroup(
    group: TabsTrayItem.TabGroup,
    onItemClick: (TabsTrayItem) -> Unit,
    onTabClose: (TabsTrayItem.Tab) -> Unit,
    onDeleteTabGroup: () -> Unit,
    editTabGroupClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .testTag(TabsTrayTestTag.TAB_GROUP_BOTTOM_SHEET_ROOT)
            .padding(
                start = FirefoxTheme.layout.space.dynamic200,
                end = FirefoxTheme.layout.space.dynamic200,
            ),
    ) {
        Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static150))

        ViewTabGroupHeader(
            title = group.title,
            groupTheme = group.theme,
            groupTabsSize = group.tabs.size,
            onDeleteTabGroup = onDeleteTabGroup,
            editTabGroupClick = editTabGroupClick,
        )

        TabLayout(
            tabs = group.tabs.toList(),
            displayTabsInGrid = true,
            selectedItemIndex = 0, // updating this in Bug 2030474
            selectionMode = TabsTrayState.Mode.Normal,
            modifier = Modifier,
            onTabClose = onTabClose,
            onItemClick = onItemClick,
            onItemLongClick = { item -> }, // Ignore long click
            onMove = { _, _, _ -> }, // Ignore moves
            onTabDragStart = { }, // Ignore drags
            onDeleteTabGroup = { }, // Ignore tab group deletes
            editTabGroupClick = { editTabGroupClick() },
            contentPadding = PaddingValues(0.dp), // TabLayout should not have its own content padding inside this view
        )
    }
}

@Composable
private fun ViewTabGroupHeader(
    title: String,
    groupTabsSize: Int,
    groupTheme: TabGroupTheme,
    onDeleteTabGroup: () -> Unit,
    editTabGroupClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                top = FirefoxTheme.layout.space.static150,
                bottom = FirefoxTheme.layout.space.static200,
            )
            .wrapContentHeight(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val headerContentDescription = pluralStringResource(
            id = R.plurals.expanded_tab_group_header_description,
            count = groupTabsSize,
            title,
            groupTabsSize,
            groupTheme.contentLabel,
        )

        Row(
            modifier = Modifier
                .weight(1f)
                .semantics(mergeDescendants = true) {
                    heading()
                    contentDescription = headerContentDescription
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TabGroupThemeDot(groupTheme)

            Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

            Text(
                text = title,
                modifier = Modifier
                    .weight(1f)
                    .clearAndSetSemantics { },
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = FirefoxTheme.typography.headline7,
            )
        }

        Spacer(
            modifier = Modifier.width(
                FirefoxTheme.layout.space.static200 +
                    FirefoxTheme.layout.space.static25,
            ),
        )

        IconButton(
            modifier = Modifier
                .testTag(TabsTrayTestTag.BOTTOM_SHEET_SHARE_BUTTON),
            onClick = {
            },
        ) {
            Icon(
                painter = painterResource(id = iconsR.drawable.mozac_ic_share_android_24),
                contentDescription = pluralStringResource(
                    id = R.plurals.share_tab_group_button_content_description,
                    count = groupTabsSize,
                    title,
                    groupTabsSize,
                ),
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }

        Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

        TabGroupMenuButton(
            includeCloseOption = true,
            onDeleteTabGroup = onDeleteTabGroup,
            editTabGroupClick = editTabGroupClick,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@FlexibleWindowLightDarkPreview
@Composable
private fun ExpandedTabGroupPreview(
    @PreviewParameter(ExpandedTabGroupPreviewProvider::class)
    previewState: ExpandedTabGroupPreviewState,
) {
    val sheetState = rememberModalBottomSheetState()
    LaunchedEffect(Unit) {
        if (!sheetState.isVisible) {
            sheetState.show()
        }
    }

    FirefoxTheme {
        Surface {
            ModalBottomSheet(
                modifier = Modifier.testTag(TabsTrayTestTag.TAB_GROUP_BOTTOM_SHEET_ROOT),
                sheetState = sheetState,
                onDismissRequest = {},
            ) {
                ExpandedTabGroup(
                    group = previewState.group,
                    onTabClose = {},
                    onItemClick = {},
                    onDeleteTabGroup = {},
                    editTabGroupClick = {},
                )
            }
        }
    }
}

private fun generateFakeTabsList(
    tabCount: Int = 10,
): MutableList<TabsTrayItem.Tab> = MutableList(tabCount) { index ->
    createTab(
        id = "tab$index",
        title = "Tab $index",
        url = "www.mozilla.com",
        private = false,
    )
}

private data class ExpandedTabGroupPreviewState(
    val group: TabsTrayItem.TabGroup,
    val selectedTabId: String? = null,
)

private class ExpandedTabGroupPreviewProvider :
    PreviewParameterProvider<ExpandedTabGroupPreviewState> {
    val data = listOf(
        Pair(
            "1 Tab",
            ExpandedTabGroupPreviewState(
                group = createTabGroup(
                    title = "Tab Group",
                    tabs = generateFakeTabsList(tabCount = 1),
                ),
            ),
        ),
        Pair(
            "2 Tabs",
            ExpandedTabGroupPreviewState(
                group = createTabGroup(
                    title = "Tab Group",
                    tabs = generateFakeTabsList(tabCount = 2),
                ),
            ),
        ),
        Pair(
            "3 Tabs",
            ExpandedTabGroupPreviewState(
                group = createTabGroup(
                    title = "Tab Group",
                    tabs = generateFakeTabsList(tabCount = 3),
                ),
            ),
        ),
        Pair(
            "4 Tabs",
            ExpandedTabGroupPreviewState(
                group = createTabGroup(
                    title = "Tab Group",
                    tabs = generateFakeTabsList(),
                ),
            ),
        ),
        Pair(
            "Selected tab",
            ExpandedTabGroupPreviewState(
                group = createTabGroup(
                    title = "Tab Group",
                    tabs = generateFakeTabsList(),
                ),
                selectedTabId = "tabid0",
            ),
        ),
        Pair(
            "Large title",
            ExpandedTabGroupPreviewState(
                group = createTabGroup(
                    title = LOREM_IPSUM,
                    tabs = generateFakeTabsList(),
                ),
                selectedTabId = "tabid0",
            ),
        ),
    )
    override val values: Sequence<ExpandedTabGroupPreviewState>
        get() = data.map { it.second }.asSequence()

    override fun getDisplayName(index: Int): String {
        return data[index].first
    }
}
