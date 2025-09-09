/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.bottomappbar

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import mozilla.components.compose.base.menu.DropdownMenu
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.tabstray.Page
import org.mozilla.fenix.tabstray.TabsTrayAction
import org.mozilla.fenix.tabstray.TabsTrayState
import org.mozilla.fenix.tabstray.TabsTrayState.Mode
import org.mozilla.fenix.tabstray.TabsTrayStore
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.ext.generateMenuItems
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * [BottomAppBar] for the Tab Manager.
 *
 * @param tabsTrayStore [TabsTrayStore] used to listen for changes to [TabsTrayState].
 * @param modifier The [Modifier] to be applied to this FAB.
 * @param onShareAllTabsClick Invoked when the user clicks on the share all tabs banner menu item.
 * @param onTabSettingsClick Invoked when the user clicks on the tab settings banner menu item.
 * @param onRecentlyClosedClick Invoked when the user clicks on the recently closed banner menu item.
 * @param onAccountSettingsClick Invoked when the user clicks on the account settings banner menu item.
 * @param onDeleteAllTabsClick Invoked when the user clicks on the close all tabs banner menu item.
 */
@Composable
internal fun TabManagerBottomAppBar(
    tabsTrayStore: TabsTrayStore,
    modifier: Modifier = Modifier,
    onShareAllTabsClick: () -> Unit,
    onTabSettingsClick: () -> Unit,
    onRecentlyClosedClick: () -> Unit,
    onAccountSettingsClick: () -> Unit,
    onDeleteAllTabsClick: () -> Unit,
) {
    val state by tabsTrayStore.observeAsState(initialValue = tabsTrayStore.state) { it }

    AnimatedVisibility(
        visible = state.mode is Mode.Normal,
    ) {
        val menuItems = state.generateMenuItems(
            onAccountSettingsClick = onAccountSettingsClick,
            onTabSettingsClick = onTabSettingsClick,
            onRecentlyClosedClick = onRecentlyClosedClick,
            onEnterMultiselectModeClick = {
                tabsTrayStore.dispatch(TabsTrayAction.EnterSelectMode)
            },
            onShareAllTabsClick = onShareAllTabsClick,
            onDeleteAllTabsClick = onDeleteAllTabsClick,
        )
        var showBottomAppBarMenu by remember { mutableStateOf(false) }

        BottomAppBar(
            actions = {
                IconButton(
                    onClick = { showBottomAppBarMenu = true },
                    modifier = Modifier.testTag(TabsTrayTestTag.THREE_DOT_BUTTON),
                ) {
                    Icon(
                        painter = painterResource(R.drawable.mozac_ic_ellipsis_vertical_24),
                        contentDescription = stringResource(id = R.string.open_tabs_menu),
                    )

                    DropdownMenu(
                        menuItems = menuItems,
                        expanded = showBottomAppBarMenu,
                        onDismissRequest = { showBottomAppBarMenu = false },
                    )
                }
            },
            modifier = modifier,
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = MaterialTheme.colorScheme.secondary,
        )
    }
}

private class TabManagerBottomAppBarParameterProvider : PreviewParameterProvider<TabsTrayState> {
    override val values: Sequence<TabsTrayState>
        get() = sequenceOf(
            TabsTrayState(),
            TabsTrayState(selectedPage = Page.PrivateTabs),
            TabsTrayState(selectedPage = Page.SyncedTabs),
        )
}

@PreviewLightDark
@Composable
private fun TabManagerBottomAppBarPreview(
    @PreviewParameter(TabManagerBottomAppBarParameterProvider::class) state: TabsTrayState,
) {
    FirefoxTheme {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(color = MaterialTheme.colorScheme.surface),
            contentAlignment = Alignment.BottomStart,
        ) {
            TabManagerBottomAppBar(
                tabsTrayStore = remember { TabsTrayStore(initialState = state) },
                onShareAllTabsClick = {},
                onTabSettingsClick = {},
                onRecentlyClosedClick = {},
                onAccountSettingsClick = {},
                onDeleteAllTabsClick = {},
            )
        }
    }
}
