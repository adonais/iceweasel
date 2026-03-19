/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import org.mozilla.fenix.compose.BottomSheetHandle
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.data.createTab
import org.mozilla.fenix.tabstray.data.createTabGroup
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState
import org.mozilla.fenix.tabstray.ui.tabitems.LOREM_IPSUM
import org.mozilla.fenix.tabstray.ui.tabitems.TabGroupMenuButton
import org.mozilla.fenix.tabstray.ui.tabpage.TabLayout
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

private const val BOTTOM_SHEET_HANDLER_ALPHA = 0.4F

// todo-bug 2022914: replace these placeholders when strings are ready
private const val PLACEHOLDER_BOTTOM_SHEET_HANDLE_TAB_GROUP_CONTENT_DESCRIPTION = "Close expanded tab group"
private const val PLACEHOLDER_SHARE_TAB_GROUP_CONTENT_DESCRIPTION = "Share tab group"

/**
 * Renders an expanded view of a user's tab group.
 * @param group: [TabsTrayItem.TabGroup] item rendered by the card
 * @param focusedTabId: String id of the tab in focus.  This id may correspond to a tab
 * that is not inside the group.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpandedTabGroup(group: TabsTrayItem.TabGroup, focusedTabId: String?) {
    val sheetState = rememberModalBottomSheetState()
    LaunchedEffect(Unit) {
        if (!sheetState.isVisible) {
            sheetState.show()
        }
    }
    ExpandedTabGroup(group = group, focusedTabId = focusedTabId, sheetState = sheetState)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ExpandedTabGroup(
    group: TabsTrayItem.TabGroup,
    focusedTabId: String?,
    sheetState: SheetState,
) {
    ModalBottomSheet(
        modifier = Modifier.testTag(TabsTrayTestTag.TAB_GROUP_BOTTOM_SHEET_ROOT),
        sheetState = sheetState,
        onDismissRequest = {},
        dragHandle = {
            BottomSheetHandle(
                modifier = Modifier
                    .padding(
                        all = FirefoxTheme.layout.space.static200,
                    )
                    .alpha(BOTTOM_SHEET_HANDLER_ALPHA),
                onRequestDismiss = {
                    // todo: handle navigation
                },
                contentDescription = PLACEHOLDER_BOTTOM_SHEET_HANDLE_TAB_GROUP_CONTENT_DESCRIPTION,
            )
        },
    ) {
        ViewTabGroupContent(group = group, focusedTabId = focusedTabId)
    }
}

@Composable
private fun ViewTabGroupContent(group: TabsTrayItem.TabGroup, focusedTabId: String?) {
    Column(
        modifier = Modifier.padding(
            start = FirefoxTheme.layout.space.dynamic200,
            end = FirefoxTheme.layout.space.dynamic200,
        ),
    ) {
        Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static150))
        ViewTabGroupHeader(group.title, group.theme.primary)
        TabLayout(
            tabs = group.tabs.toList(),
            displayTabsInGrid = true,
            selectedTabId = focusedTabId,
            selectionMode = TabsTrayState.Mode.Normal,
            modifier = Modifier,
            onTabClose = { item -> }, // todo: handle closing tab
            onItemClick = { item -> }, // todo: handle navigation
            onItemLongClick = { item -> }, // Ignore long click
            onMove = { _, _, _ -> }, // Ignore moves
            onTabDragStart = { }, // Ignore drags
            contentPadding = PaddingValues(0.dp), // TabLayout should not have its own content padding inside this view
        )
    }
}

@Composable
private fun ViewTabGroupHeader(title: String, groupColor: Color) {
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
        Box(
            modifier =
                Modifier
                    .size(18.dp)
                    .clip(CircleShape)
                    .background(color = groupColor)
                    .testTag(TabsTrayTestTag.BOTTOM_SHEET_CIRCLE),
        )

        Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

        Text(
            text = title,
            modifier = Modifier
                .weight(1f),
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = FirefoxTheme.typography.headline7,
        )

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
                contentDescription = PLACEHOLDER_SHARE_TAB_GROUP_CONTENT_DESCRIPTION,
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }

        Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

        TabGroupMenuButton(includeCloseOption = true)
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun ExpandedTabGroupPreview(
    @PreviewParameter(ExpandedTabGroupPreviewProvider::class)
    previewState: ExpandedTabGroupPreviewState,
) {
    FirefoxTheme {
        Surface {
            ExpandedTabGroup(
                previewState.group,
                previewState.selectedTabId,
            )
        }
    }
}

private fun generateFakeTabsList(
    tabCount: Int = 10,
): HashSet<TabsTrayItem.Tab> = List(tabCount) { index ->
    createTab(
        id = "tab$index",
        title = "Tab $index",
        url = "www.mozilla.com",
        private = false,
    )
}.toHashSet()

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
