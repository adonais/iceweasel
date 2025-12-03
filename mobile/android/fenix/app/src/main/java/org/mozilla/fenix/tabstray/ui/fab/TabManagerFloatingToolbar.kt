/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.fab

import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.ExtendedFloatingActionButton
import mozilla.components.compose.base.button.FloatingActionButtonDefaults
import mozilla.components.compose.base.menu.DropdownMenu
import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.modifier.animateRotation
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
import androidx.compose.material3.FloatingActionButtonDefaults as M3FloatingActionButtonDefaults
import mozilla.components.ui.icons.R as iconsR

/**
 * Floating Toolbar for the Tab Manager.
 *
 * @param tabsTrayStore [TabsTrayStore] used to listen for changes to [TabsTrayState].
 * @param isSignedIn Whether the user is signed into their Firefox account.
 * @param modifier The [Modifier] to be applied to this FAB.
 * @param expanded Controls the expansion state of this FAB. In an expanded state, the FAB will
 * show both the icon and text. In a collapsed state, the FAB will show only the icon.
 * @param pbmLocked Whether the private browsing mode is currently locked.
 * @param onOpenNewNormalTabClicked Invoked when the fab is clicked in [Page.NormalTabs].
 * @param onOpenNewPrivateTabClicked Invoked when the fab is clicked in [Page.PrivateTabs].
 * @param onSyncedTabsFabClicked Invoked when the fab is clicked in [Page.SyncedTabs].
 * @param onTabSettingsClick Invoked when the user clicks on the tab settings banner menu item.
 * @param onRecentlyClosedClick Invoked when the user clicks on the recently closed banner menu item.
 * @param onAccountSettingsClick Invoked when the user clicks on the account settings banner menu item.
 * @param onDeleteAllTabsClick Invoked when the user clicks on the close all tabs banner menu item.
 */
@Suppress("LongParameterList")
@Composable
internal fun TabManagerFloatingToolbar(
    tabsTrayStore: TabsTrayStore,
    isSignedIn: Boolean,
    modifier: Modifier = Modifier,
    expanded: Boolean = true,
    pbmLocked: Boolean = false,
    onOpenNewNormalTabClicked: () -> Unit,
    onOpenNewPrivateTabClicked: () -> Unit,
    onSyncedTabsFabClicked: () -> Unit,
    onTabSettingsClick: () -> Unit,
    onRecentlyClosedClick: () -> Unit,
    onAccountSettingsClick: () -> Unit,
    onDeleteAllTabsClick: () -> Unit,
) {
    val state by tabsTrayStore.observeAsState(initialValue = tabsTrayStore.state) { it }
    val privateTabsLocked = pbmLocked && state.selectedPage == Page.PrivateTabs

    AnimatedVisibility(
        visible = state.mode is Mode.Normal && !privateTabsLocked,
        modifier = modifier,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.weight(1f),
                contentAlignment = Alignment.CenterEnd,
            ) {
                FloatingToolbarActions(
                    state = state,
                    onMenuShown = {
                        tabsTrayStore.dispatch(TabsTrayAction.ThreeDotMenuShown)
                    },
                    onEnterMultiselectModeClick = {
                        tabsTrayStore.dispatch(TabsTrayAction.EnterSelectMode)
                    },
                    onTabSettingsClick = onTabSettingsClick,
                    onRecentlyClosedClick = onRecentlyClosedClick,
                    onAccountSettingsClick = onAccountSettingsClick,
                    onDeleteAllTabsClick = onDeleteAllTabsClick,
                )
            }

            Spacer(modifier = Modifier.width(FirefoxTheme.layout.space.static100))

            Box(
                modifier = Modifier.weight(1f),
                contentAlignment = Alignment.CenterStart,
            ) {
                FloatingToolbarFAB(
                    state = state,
                    expanded = expanded,
                    isSignedIn = isSignedIn,
                    onOpenNewNormalTabClicked = onOpenNewNormalTabClicked,
                    onOpenNewPrivateTabClicked = onOpenNewPrivateTabClicked,
                    onSyncedTabsFabClicked = onSyncedTabsFabClicked,
                )
            }
        }
    }
}

@Composable
private fun FloatingToolbarActions(
    state: TabsTrayState,
    onMenuShown: () -> Unit,
    onEnterMultiselectModeClick: () -> Unit,
    onTabSettingsClick: () -> Unit,
    onRecentlyClosedClick: () -> Unit,
    onAccountSettingsClick: () -> Unit,
    onDeleteAllTabsClick: () -> Unit,
) {
    var showBottomAppBarMenu by remember { mutableStateOf(false) }
    val menuItems = generateMenuItems(
        selectedPage = state.selectedPage,
        normalTabCount = state.normalTabs.size,
        privateTabCount = state.privateTabs.size,
        onAccountSettingsClick = onAccountSettingsClick,
        onTabSettingsClick = onTabSettingsClick,
        onRecentlyClosedClick = onRecentlyClosedClick,
        onEnterMultiselectModeClick = onEnterMultiselectModeClick,
        onDeleteAllTabsClick = onDeleteAllTabsClick,
    )

    Card(
        modifier = Modifier,
        shape = CircleShape,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 6.dp),
    ) {
        Row(
            modifier = Modifier.padding(all = FirefoxTheme.layout.space.static100),
            horizontalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static50),
        ) {
            IconButton(
                onClick = {
                    onMenuShown()
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
        }
    }
}

@Composable
private fun FloatingToolbarFAB(
    state: TabsTrayState,
    expanded: Boolean,
    isSignedIn: Boolean,
    onOpenNewNormalTabClicked: () -> Unit,
    onOpenNewPrivateTabClicked: () -> Unit,
    onSyncedTabsFabClicked: () -> Unit,
) {
    @DrawableRes val icon: Int
    val contentDescription: String
    val label: String
    var colors = FloatingActionButtonDefaults.colorsPrimary()
    var elevation = M3FloatingActionButtonDefaults.elevation()
    val onClick: () -> Unit
    var iconModifier: Modifier = Modifier
    when (state.selectedPage) {
        Page.NormalTabs -> {
            icon = iconsR.drawable.mozac_ic_plus_24
            contentDescription = stringResource(id = R.string.add_tab)
            label = stringResource(id = R.string.tab_manager_floating_action_button_new_normal_tab)
            onClick = onOpenNewNormalTabClicked
        }

        Page.PrivateTabs -> {
            icon = iconsR.drawable.mozac_ic_plus_24
            contentDescription = stringResource(id = R.string.add_private_tab)
            label = stringResource(id = R.string.tab_manager_floating_action_button_new_private_tab)
            onClick = onOpenNewPrivateTabClicked
        }

        Page.SyncedTabs -> {
            icon = iconsR.drawable.mozac_ic_sync_24
            contentDescription = stringResource(id = R.string.resync_button_content_description)
            label = if (state.syncing) {
                stringResource(id = R.string.sync_syncing_in_progress)
            } else {
                stringResource(id = R.string.tab_manager_floating_action_button_sync_tabs)
            }
            onClick = {
                if (isSignedIn) {
                    onSyncedTabsFabClicked()
                }
            }
            if (!isSignedIn) {
                colors = FloatingActionButtonDefaults.colorsDisabled()
                elevation = M3FloatingActionButtonDefaults.elevation(
                    defaultElevation = 0.dp,
                    pressedElevation = 0.dp,
                    focusedElevation = 0.dp,
                    hoveredElevation = 0.dp,
                )
            }
            iconModifier = Modifier.animateRotation(animate = state.syncing)
        }
    }

    ExtendedFloatingActionButton(
        label = label,
        onClick = onClick,
        modifier = Modifier.testTag(TabsTrayTestTag.FAB),
        expanded = expanded,
        colors = colors,
        elevation = elevation,
    ) {
        Icon(
            painter = painterResource(id = icon),
            contentDescription = contentDescription,
            modifier = iconModifier,
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

private data class TabManagerFloatingToolbarPreviewModel(
    val state: TabsTrayState,
    val expanded: Boolean,
    val isSignedIn: Boolean = true,
)

private class TabManagerFloatingToolbarParameterProvider :
    PreviewParameterProvider<TabManagerFloatingToolbarPreviewModel> {
    override val values: Sequence<TabManagerFloatingToolbarPreviewModel>
        get() = sequenceOf(
            TabManagerFloatingToolbarPreviewModel(
                state = TabsTrayState(selectedPage = Page.NormalTabs),
                expanded = false,
            ),
            TabManagerFloatingToolbarPreviewModel(
                state = TabsTrayState(selectedPage = Page.NormalTabs),
                expanded = true,
            ),
            TabManagerFloatingToolbarPreviewModel(
                state = TabsTrayState(selectedPage = Page.PrivateTabs),
                expanded = false,
            ),
            TabManagerFloatingToolbarPreviewModel(
                state = TabsTrayState(selectedPage = Page.PrivateTabs),
                expanded = true,
            ),
            TabManagerFloatingToolbarPreviewModel(
                state = TabsTrayState(selectedPage = Page.SyncedTabs),
                expanded = false,
            ),
            TabManagerFloatingToolbarPreviewModel(
                state = TabsTrayState(selectedPage = Page.SyncedTabs),
                expanded = true,
            ),
            TabManagerFloatingToolbarPreviewModel(
                state = TabsTrayState(selectedPage = Page.SyncedTabs),
                expanded = false,
                isSignedIn = false,
            ),
            TabManagerFloatingToolbarPreviewModel(
                state = TabsTrayState(selectedPage = Page.SyncedTabs),
                expanded = true,
                isSignedIn = false,
            ),
        )
}

@Preview
@Composable
private fun TabManagerFloatingToolbarPreview(
    @PreviewParameter(TabManagerFloatingToolbarParameterProvider::class)
    previewDataModel: TabManagerFloatingToolbarPreviewModel,
) {
    FirefoxTheme {
        TabManagerFloatingToolbar(
            tabsTrayStore = remember { TabsTrayStore(initialState = previewDataModel.state) },
            expanded = previewDataModel.expanded,
            isSignedIn = previewDataModel.isSignedIn,
            pbmLocked = false,
            modifier = Modifier
                .background(color = MaterialTheme.colorScheme.surface)
                .padding(all = 16.dp),
            onOpenNewNormalTabClicked = {},
            onOpenNewPrivateTabClicked = {},
            onSyncedTabsFabClicked = {},
            onTabSettingsClick = {},
            onAccountSettingsClick = {},
            onDeleteAllTabsClick = {},
            onRecentlyClosedClick = {},
        )
    }
}
