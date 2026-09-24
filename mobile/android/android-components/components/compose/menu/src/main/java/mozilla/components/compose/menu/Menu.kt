/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.unit.Dp
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.menu.data.MenuItemsGroup
import mozilla.components.compose.menu.store.MenuEvent
import mozilla.components.compose.menu.store.MenuState
import mozilla.components.compose.menu.store.MenuStore
import mozilla.components.compose.menu.ui.ListMenuItemsGroup
import mozilla.components.compose.menu.ui.MenuGridContainer
import mozilla.components.compose.menu.ui.utils.MenuPreviewParameterProvider

/**
 * A vertically scrollable container for menu items.
 *
 * @param store The [MenuStore] backing this menu.
 * @param modifier [Modifier] to be applied to the menu container.
 */
@Composable
fun Menu(
    store: MenuStore,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        val onInteraction: (MenuEvent) -> Unit = remember(store) { { store.dispatch(it) } }
        val menuGroups = store.state.menuGroups

        val headerGroup =
            remember(menuGroups) {
                menuGroups.firstOrNull()?.takeIf { it.isSticky }
            }
        val footerGroup =
            remember(menuGroups) {
                if (menuGroups.size > 1) {
                    menuGroups.lastOrNull()?.takeIf { it.isSticky }
                } else {
                    null
                }
            }
        val scrollableGroups =
            remember(menuGroups, headerGroup, footerGroup) {
                menuGroups.filter { it != headerGroup && it != footerGroup }
            }

        val listState = rememberLazyListState()
        var footerHeight by remember { mutableIntStateOf(0) }
        val density = LocalDensity.current
        val footerHeightDp = remember(footerHeight) { with(density) { footerHeight.toDp() } }

        val isScrollable = listState.canScrollForward || listState.canScrollBackward
        val stickyBackgroundColor =
            if (isScrollable) {
                MaterialTheme.colorScheme.surfaceContainerHigh
            } else {
                MaterialTheme.colorScheme.surfaceContainer
            }

        Box {
            MenuContent(
                listState = listState,
                footerHeightDp = footerHeightDp,
                headerGroup = headerGroup,
                scrollableGroups = scrollableGroups,
                onInteraction = onInteraction,
                stickyBackgroundColor = stickyBackgroundColor,
            )

            if (footerGroup != null) {
                MenuFooter(
                    footerGroup = footerGroup,
                    listState = listState,
                    onInteraction = onInteraction,
                    onHeightMeasured = { footerHeight = it },
                    backgroundColor = stickyBackgroundColor,
                )
            }
        }
    }
}

@Composable
private fun MenuContent(
    listState: LazyListState,
    footerHeightDp: Dp,
    headerGroup: MenuItemsGroup?,
    scrollableGroups: List<MenuItemsGroup>,
    onInteraction: (MenuEvent) -> Unit,
    stickyBackgroundColor: Color,
) {
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxWidth(),
        contentPadding =
            PaddingValues(
                start = AcornTheme.layout.space.static100,
                top = AcornTheme.layout.space.static100,
                end = AcornTheme.layout.space.static100,
                bottom = AcornTheme.layout.space.static100 + footerHeightDp,
            ),
        verticalArrangement = Arrangement.spacedBy(AcornTheme.layout.space.static150),
    ) {
        if (headerGroup != null) {
            stickyHeader(key = headerGroup.id) {
                Column(modifier = Modifier.background(stickyBackgroundColor)) {
                    MenuGroupContent(
                        headerGroup,
                        onInteraction,
                        isSticky = true,
                        backgroundColor = stickyBackgroundColor,
                    )

                    if (listState.canScrollBackward) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
        }

        scrollableGroups.forEach { group ->
            item(key = group.id) {
                MenuGroupContent(group, onInteraction, isSticky = false, backgroundColor = Color.Transparent)
            }
        }
    }
}

@Composable
private fun MenuGroupContent(
    group: MenuItemsGroup,
    onInteraction: (MenuEvent) -> Unit,
    isSticky: Boolean,
    backgroundColor: Color,
) {
    when (group) {
        is MenuItemsGroup.Grid -> {
            MenuGridContainer(
                items = group.items,
                onInteraction = onInteraction,
                isSticky = isSticky,
                backgroundColor = backgroundColor,
            )
        }

        is MenuItemsGroup.Row -> {
            ListMenuItemsGroup(group.items, onInteraction)
        }
    }
}

@Composable
private fun BoxScope.MenuFooter(
    footerGroup: MenuItemsGroup,
    listState: LazyListState,
    onInteraction: (MenuEvent) -> Unit,
    onHeightMeasured: (Int) -> Unit,
    backgroundColor: Color,
) {
    Column(
        modifier =
            Modifier.align(Alignment.BottomCenter)
                .onGloballyPositioned { onHeightMeasured(it.size.height) }
                .background(backgroundColor)
    ) {
        if (listState.canScrollForward) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }

        MenuGroupContent(footerGroup, onInteraction, isSticky = true, backgroundColor = backgroundColor)
    }
}

@PreviewLightDark
@Composable
private fun MenuPreview(@PreviewParameter(MenuPreviewParameterProvider::class) menuGroups: List<MenuItemsGroup>) {
    AcornTheme {
        Menu(store = MenuStore(initialState = MenuState(menuGroups)))
    }
}
