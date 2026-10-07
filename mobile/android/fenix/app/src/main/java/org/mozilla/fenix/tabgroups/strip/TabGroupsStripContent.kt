/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups.strip

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.tooling.preview.PreviewLightDark
import org.mozilla.fenix.compose.Favicon
import org.mozilla.fenix.tabgroups.TabGroupsTestTag
import org.mozilla.fenix.tabgroups.strip.redux.TabGroupsStripAction
import org.mozilla.fenix.tabgroups.strip.redux.TabGroupsStripState
import org.mozilla.fenix.tabgroups.strip.redux.TabGroupsStripStore
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * A horizontal strip of the active group's tabs, each shown as a favicon circle.
 *
 * @param state The [TabGroupsStripState] to render.
 * @param onTabClick Invoked with a tab's ID when its favicon is tapped.
 * @param modifier The [Modifier] to be applied to the strip.
 */
@Composable
internal fun TabGroupsStripContent(
    state: TabGroupsStripState,
    onTabClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier.fillMaxWidth().testTag(TabGroupsTestTag.TAB_GROUPS_STRIP),
        horizontalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static100),
        contentPadding = PaddingValues(horizontal = FirefoxTheme.layout.space.static100),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items(items = state.tabs, key = { it.id }) { tab ->
            TabFaviconCircle(tab = tab, onClick = { onTabClick(tab.id) })
        }
    }
}

@Composable
private fun TabFaviconCircle(
    tab: TabGroupsStripState.Tab,
    onClick: () -> Unit,
) {
    val selectionBorder =
        if (tab.isFocused) {
            Modifier.border(FirefoxTheme.layout.border.heavy, MaterialTheme.colorScheme.primary, CircleShape)
        } else {
            Modifier
        }

    Box(
        modifier =
            Modifier.size(FirefoxTheme.layout.size.static400)
                .clip(CircleShape)
                .then(selectionBorder)
                .clickable(onClick = onClick, onClickLabel = tab.title, role = Role.Button)
                .testTag(TabGroupsTestTag.TAB_GROUPS_STRIP_TAB),
        contentAlignment = Alignment.Center,
    ) {
        Favicon(url = tab.url, size = FirefoxTheme.layout.size.static300, shape = CircleShape)
    }
}

@PreviewLightDark
@Composable
private fun TabGroupsStripContentPreview() {
    val store = remember { TabGroupsStripStore(initialState = previewState) }
    val state by store.stateFlow.collectAsState()

    FirefoxTheme {
        TabGroupsStripContent(
            state = state,
            onTabClick = { store.dispatch(TabGroupsStripAction.TabClicked(it)) },
        )
    }
}

private val previewState =
    TabGroupsStripState(
        tabs =
            listOf(
                TabGroupsStripState.Tab(
                    id = "1",
                    url = "https://mozilla.org",
                    title = "Mozilla",
                    isFocused = true,
                ),
                TabGroupsStripState.Tab(
                    id = "2",
                    url = "https://github.com",
                    title = "GitHub",
                    isFocused = false,
                ),
                TabGroupsStripState.Tab(
                    id = "3",
                    url = "https://wikipedia.org",
                    title = "Wikipedia",
                    isFocused = false,
                ),
            )
    )
