/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalMaterial3Api::class)

package org.mozilla.fenix.tabstray.ui.bottomappbar

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.BottomAppBarDefaults
import androidx.compose.material3.BottomAppBarScrollBehavior
import androidx.compose.material3.ExperimentalMaterial3Api
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
import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.text.Text
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.tabstray.Page
import org.mozilla.fenix.tabstray.TabsTrayAction
import org.mozilla.fenix.tabstray.TabsTrayState
import org.mozilla.fenix.tabstray.TabsTrayState.Mode
import org.mozilla.fenix.tabstray.TabsTrayStore
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

/**
 * [BottomAppBar] for the Tab Manager.
 *
 * @param tabsTrayStore [TabsTrayStore] used to listen for changes to [TabsTrayState].
 * @param scrollBehavior Defines how the [BottomAppBar] should behave when the content under it is scrolled.
 * @param onTabSettingsClick Invoked when the user clicks on the tab settings banner menu item.
 * @param onRecentlyClosedClick Invoked when the user clicks on the recently closed banner menu item.
 * @param onAccountSettingsClick Invoked when the user clicks on the account settings banner menu item.
 * @param onDeleteAllTabsClick Invoked when the user clicks on the close all tabs banner menu item.
 * @param modifier The [Modifier] to be applied to this FAB.
 * @param pbmLocked Whether the private browsing mode is currently locked.
 */
@Composable
internal fun TabManagerBottomAppBar(
    tabsTrayStore: TabsTrayStore,
    scrollBehavior: BottomAppBarScrollBehavior,
    onTabSettingsClick: () -> Unit,
    onRecentlyClosedClick: () -> Unit,
    onAccountSettingsClick: () -> Unit,
    onDeleteAllTabsClick: () -> Unit,
    modifier: Modifier = Modifier,
    pbmLocked: Boolean = false,
) {
    val state by tabsTrayStore.observeAsState(initialValue = tabsTrayStore.state) { it }
    val privateTabsLocked = pbmLocked && state.selectedPage == Page.PrivateTabs

    AnimatedVisibility(
        visible = state.mode is Mode.Normal && !privateTabsLocked,
    ) {
        val menuItems = generateMenuItems(
            selectedPage = state.selectedPage,
            normalTabCount = state.normalTabs.size,
            privateTabCount = state.privateTabs.size,
            onAccountSettingsClick = onAccountSettingsClick,
            onTabSettingsClick = onTabSettingsClick,
            onRecentlyClosedClick = onRecentlyClosedClick,
            onEnterMultiselectModeClick = {
                tabsTrayStore.dispatch(TabsTrayAction.EnterSelectMode)
            },
            onDeleteAllTabsClick = onDeleteAllTabsClick,
        )
        var showBottomAppBarMenu by remember { mutableStateOf(false) }

        BottomAppBar(
            actions = {
                IconButton(
                    onClick = {
                        tabsTrayStore.dispatch(TabsTrayAction.ThreeDotMenuShown)
                        showBottomAppBarMenu = true
                    },
                    modifier = Modifier.testTag(TabsTrayTestTag.THREE_DOT_BUTTON),
                ) {
                    Icon(
                        painter = painterResource(iconsR.drawable.mozac_ic_ellipsis_vertical_24),
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
            scrollBehavior = scrollBehavior,
        )
    }
}

@Suppress("LongParameterList")
private fun generateMenuItems(
    selectedPage: Page,
    normalTabCount: Int,
    privateTabCount: Int,
    onTabSettingsClick: () -> Unit,
    onRecentlyClosedClick: () -> Unit,
    onEnterMultiselectModeClick: () -> Unit,
    onDeleteAllTabsClick: () -> Unit,
    onAccountSettingsClick: () -> Unit,
): List<MenuItem> {
    val enterSelectModeItem = MenuItem.IconItem(
        text = Text.Resource(R.string.tabs_tray_select_tabs),
        drawableRes = iconsR.drawable.mozac_ic_checkmark_24,
        testTag = TabsTrayTestTag.SELECT_TABS,
        onClick = onEnterMultiselectModeClick,
    )
    val recentlyClosedTabsItem = MenuItem.IconItem(
        text = Text.Resource(R.string.tab_tray_menu_recently_closed),
        drawableRes = iconsR.drawable.mozac_ic_history_24,
        testTag = TabsTrayTestTag.RECENTLY_CLOSED_TABS,
        onClick = onRecentlyClosedClick,
    )
    val tabSettingsItem = MenuItem.IconItem(
        text = Text.Resource(R.string.tab_tray_menu_tab_settings),
        drawableRes = iconsR.drawable.mozac_ic_settings_24,
        testTag = TabsTrayTestTag.TAB_SETTINGS,
        onClick = onTabSettingsClick,
    )
    val deleteAllTabsItem = MenuItem.IconItem(
        text = Text.Resource(R.string.tab_tray_menu_item_close),
        drawableRes = iconsR.drawable.mozac_ic_delete_24,
        testTag = TabsTrayTestTag.CLOSE_ALL_TABS,
        onClick = onDeleteAllTabsClick,
    )
    val accountSettingsItem = MenuItem.IconItem(
        text = Text.Resource(R.string.tab_tray_menu_account_settings),
        drawableRes = iconsR.drawable.mozac_ic_avatar_circle_24,
        testTag = TabsTrayTestTag.ACCOUNT_SETTINGS,
        onClick = onAccountSettingsClick,
    )
    return when {
        selectedPage == Page.NormalTabs && normalTabCount == 0 ||
            selectedPage == Page.PrivateTabs && privateTabCount == 0 -> listOf(
            recentlyClosedTabsItem,
            tabSettingsItem,
        )

        selectedPage == Page.NormalTabs -> listOf(
            enterSelectModeItem,
            recentlyClosedTabsItem,
            tabSettingsItem,
            deleteAllTabsItem,
        )

        selectedPage == Page.PrivateTabs -> listOf(
            recentlyClosedTabsItem,
            tabSettingsItem,
            deleteAllTabsItem,
        )

        selectedPage == Page.SyncedTabs -> listOf(
            accountSettingsItem,
            recentlyClosedTabsItem,
        )

        else -> emptyList()
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
                pbmLocked = false,
                scrollBehavior = BottomAppBarDefaults.exitAlwaysScrollBehavior(),
                onTabSettingsClick = {},
                onRecentlyClosedClick = {},
                onAccountSettingsClick = {},
                onDeleteAllTabsClick = {},
            )
        }
    }
}
