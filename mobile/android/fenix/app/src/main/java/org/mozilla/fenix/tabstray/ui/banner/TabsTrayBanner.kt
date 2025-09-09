/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.banner

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.browser.state.state.ContentState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.compose.base.Divider
import mozilla.components.compose.base.menu.DropdownMenu
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.Banner
import org.mozilla.fenix.tabstray.Page
import org.mozilla.fenix.tabstray.TabsTrayAction
import org.mozilla.fenix.tabstray.TabsTrayState
import org.mozilla.fenix.tabstray.TabsTrayState.Mode
import org.mozilla.fenix.tabstray.TabsTrayStore
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.ext.generateMultiSelectBannerMenuItems
import org.mozilla.fenix.tabstray.ui.tabstray.TabsTray
import org.mozilla.fenix.theme.FirefoxTheme
import kotlin.math.max

private const val TAB_COUNT_SHOW_CFR = 6
private const val ROW_HEIGHT_DP = 48
private const val TAB_INDICATOR_ROUNDED_CORNER_DP = 100

/**
 * Top-level UI for displaying the banner in [TabsTray].
 *
 * @param selectedPage The current page the Tabs Tray is on.
 * @param normalTabCount The total number of open normal tabs.
 * @param privateTabCount The total number of open private tabs.
 * @param syncedTabCount The total number of open synced tabs.
 * @param selectionMode [TabsTrayState.Mode] indicating the current selection mode (e.g., normal, multi-select).
 * @param isInDebugMode True for debug variant or if secret menu is enabled for this session.
 * @param shouldShowTabAutoCloseBanner Whether the tab auto-close banner should be displayed.
 * @param shouldShowLockPbmBanner Whether the lock private browsing mode banner should be displayed.
 * @param onTabPageIndicatorClicked Invoked when the user clicks on a tab page indicator.
 * @param onSaveToCollectionClick Invoked when the user clicks the "Save to Collection" button in multi-select mode.
 * @param onShareSelectedTabsClick Invoked when the user clicks the "Share" button in multi-select mode.
 * @param onDeleteSelectedTabsClick Invoked when the user clicks the "Close Selected Tabs" menu item.
 * @param onBookmarkSelectedTabsClick Invoked when the user clicks the "Bookmark Selected Tabs" menu item.
 * @param onForceSelectedTabsAsInactiveClick Invoked when the user clicks the "Mark Tabs as Inactive" menu item.
 * @param onTabAutoCloseBannerViewOptionsClick Invoked when the user clicks to view auto-close settings from the banner.
 * @param onTabsTrayPbmLockedClick Invoked when the user interacts with the lock private browsing mode banner.
 * @param onTabsTrayPbmLockedDismiss Invoked when the user clicks on either button in the
 * lock private browsing mode banner.
 * @param onTabAutoCloseBannerDismiss Invoked when the user dismisses the auto-close banner.
 * @param onTabAutoCloseBannerShown Invoked when the auto-close banner is shown to the user.
 * @param onExitSelectModeClick Invoked when the user exits multi-select mode.
 */
@Suppress("LongParameterList", "LongMethod")
@Composable
fun TabsTrayBanner(
    selectedPage: Page,
    normalTabCount: Int,
    privateTabCount: Int,
    syncedTabCount: Int,
    selectionMode: Mode,
    isInDebugMode: Boolean,
    shouldShowTabAutoCloseBanner: Boolean,
    shouldShowLockPbmBanner: Boolean,
    onTabPageIndicatorClicked: (Page) -> Unit,
    onSaveToCollectionClick: () -> Unit,
    onShareSelectedTabsClick: () -> Unit,
    onDeleteSelectedTabsClick: () -> Unit,
    onBookmarkSelectedTabsClick: () -> Unit,
    onForceSelectedTabsAsInactiveClick: () -> Unit,
    onTabAutoCloseBannerViewOptionsClick: () -> Unit,
    onTabsTrayPbmLockedClick: () -> Unit,
    onTabsTrayPbmLockedDismiss: () -> Unit,
    onTabAutoCloseBannerDismiss: () -> Unit,
    onTabAutoCloseBannerShown: () -> Unit,
    onExitSelectModeClick: () -> Unit,
) {
    val isInMultiSelectMode by remember(selectionMode) {
        derivedStateOf {
            selectionMode is Mode.Select
        }
    }
    val showTabAutoCloseBanner by remember(
        shouldShowTabAutoCloseBanner,
        normalTabCount,
        privateTabCount,
    ) {
        derivedStateOf {
            shouldShowTabAutoCloseBanner && max(
                normalTabCount,
                privateTabCount,
            ) >= TAB_COUNT_SHOW_CFR
        }
    }

    var hasAcknowledgedAutoCloseBanner by remember { mutableStateOf(false) }
    var hasAcknowledgedPbmLockBanner by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.testTag(tag = TabsTrayTestTag.BANNER_ROOT),
    ) {
        if (isInMultiSelectMode) {
            MultiSelectBanner(
                selectedTabCount = selectionMode.selectedTabs.size,
                shouldShowInactiveButton = isInDebugMode,
                onExitSelectModeClick = onExitSelectModeClick,
                onSaveToCollectionsClick = onSaveToCollectionClick,
                onShareSelectedTabs = onShareSelectedTabsClick,
                onBookmarkSelectedTabsClick = onBookmarkSelectedTabsClick,
                onCloseSelectedTabsClick = onDeleteSelectedTabsClick,
                onMakeSelectedTabsInactive = onForceSelectedTabsAsInactiveClick,
            )
        } else {
            TabPageBanner(
                selectedPage = selectedPage,
                normalTabCount = normalTabCount,
                privateTabCount = privateTabCount,
                syncedTabCount = syncedTabCount,
                onTabPageIndicatorClicked = onTabPageIndicatorClicked,
            )
        }

        when {
            !hasAcknowledgedAutoCloseBanner && showTabAutoCloseBanner -> {
                onTabAutoCloseBannerShown()

                Divider()

                Banner(
                    message = stringResource(id = R.string.tab_tray_close_tabs_banner_message),
                    button1Text = stringResource(id = R.string.tab_tray_close_tabs_banner_negative_button_text),
                    button2Text = stringResource(id = R.string.tab_tray_close_tabs_banner_positive_button_text),
                    onButton1Click = {
                        hasAcknowledgedAutoCloseBanner = true
                        onTabAutoCloseBannerDismiss()
                    },
                    onButton2Click = {
                        hasAcknowledgedAutoCloseBanner = true
                        onTabAutoCloseBannerViewOptionsClick()
                    },
                )
            }

            !hasAcknowledgedPbmLockBanner && shouldShowLockPbmBanner -> {
                // After this bug: https://bugzilla.mozilla.org/show_bug.cgi?id=1965545
                // is resolved, we should swap the button 1 and button 2 click actions.
                Banner(
                    message = stringResource(id = R.string.private_tab_cfr_title),
                    button1Text = stringResource(id = R.string.private_tab_cfr_negative),
                    button2Text = stringResource(id = R.string.private_tab_cfr_positive),
                    onButton1Click = {
                        hasAcknowledgedPbmLockBanner = true
                        onTabsTrayPbmLockedDismiss()
                    },
                    onButton2Click = {
                        hasAcknowledgedPbmLockBanner = true
                        onTabsTrayPbmLockedClick()
                        onTabsTrayPbmLockedDismiss()
                    },
                )
            }
        }
    }
}

/**
 * Banner displayed when in [Mode.Normal].
 *
 * @param selectedPage The currently-active tab [Page].
 * @param normalTabCount The amount of open Normal tabs.
 * @param privateTabCount The amount of open Private tabs.
 * @param syncedTabCount The amount of synced tabs.
 * @param onTabPageIndicatorClicked Invoked when the user clicks on a tab page button. Passes along the
 * [Page] that was clicked.
 */
@Composable
private fun TabPageBanner(
    selectedPage: Page,
    normalTabCount: Int,
    privateTabCount: Int,
    syncedTabCount: Int,
    onTabPageIndicatorClicked: (Page) -> Unit,
) {
    val inactiveColor = MaterialTheme.colorScheme.onSurfaceVariant

    TabRow(
        selectedTabIndex = Page.pageToPosition(selectedPage),
        modifier = Modifier
            .fillMaxWidth()
            .height(ROW_HEIGHT_DP.dp),
        contentColor = MaterialTheme.colorScheme.primary,
        divider = {},
        indicator = { tabPositions ->
            val selectedTabIndex = Page.pageToPosition(selectedPage)
            TabRowDefaults.PrimaryIndicator(
                modifier = Modifier
                    .tabIndicatorOffset(tabPositions[selectedTabIndex]),
                shape = RoundedCornerShape(
                    topStart = TAB_INDICATOR_ROUNDED_CORNER_DP.dp,
                    topEnd = TAB_INDICATOR_ROUNDED_CORNER_DP.dp,
                ),
            )
        },
    ) {
        val privateTabDescription = stringResource(
            id = R.string.tabs_header_private_tabs_counter_title,
            privateTabCount.toString(),
        )
        val normalTabDescription = stringResource(
            id = R.string.tabs_header_normal_tabs_counter_title,
            normalTabCount.toString(),
        )
        val syncedTabDescription = stringResource(
            id = R.string.tabs_header_synced_tabs_counter_title,
            syncedTabCount.toString(),
        )

        Tab(
            selected = selectedPage == Page.PrivateTabs,
            onClick = { onTabPageIndicatorClicked(Page.PrivateTabs) },
            modifier = Modifier
                .testTag(TabsTrayTestTag.PRIVATE_TABS_PAGE_BUTTON)
                .semantics {
                    contentDescription = privateTabDescription
                }
                .height(ROW_HEIGHT_DP.dp),
            unselectedContentColor = inactiveColor,
        ) {
            Text(text = stringResource(id = R.string.tabs_header_private_tabs_title))
        }

        Tab(
            selected = selectedPage == Page.NormalTabs,
            onClick = { onTabPageIndicatorClicked(Page.NormalTabs) },
            modifier = Modifier
                .testTag(TabsTrayTestTag.NORMAL_TABS_PAGE_BUTTON)
                .semantics {
                    contentDescription = normalTabDescription
                }
                .height(ROW_HEIGHT_DP.dp),
            unselectedContentColor = inactiveColor,
        ) {
            Text(text = stringResource(R.string.tabs_header_normal_tabs_title))
        }

        Tab(
            selected = selectedPage == Page.SyncedTabs,
            onClick = { onTabPageIndicatorClicked(Page.SyncedTabs) },
            modifier = Modifier
                .testTag(TabsTrayTestTag.SYNCED_TABS_PAGE_BUTTON)
                .semantics {
                    contentDescription = syncedTabDescription
                }
                .height(ROW_HEIGHT_DP.dp),
            unselectedContentColor = inactiveColor,
        ) {
            Text(text = stringResource(id = R.string.tabs_header_synced_tabs_title))
        }
    }
}

/**
 * Banner displayed when in [Mode.Select].
 *
 * @param selectedTabCount The amount of selected tabs.
 * @param shouldShowInactiveButton Whether to show the inactive tabs menu item.
 * @param onExitSelectModeClick Invoked when the user clicks to exit selection mode.
 * @param onSaveToCollectionsClick Invoked when the user clicks on the save to collection button.
 * @param onShareSelectedTabs Invoked when the user clicks on the share tabs button.
 * @param onBookmarkSelectedTabsClick Invoked when the user clicks the menu item to bookmark the selected tabs.
 * @param onCloseSelectedTabsClick Invoked when the user clicks the menu item to close the selected tabs.
 * @param onMakeSelectedTabsInactive Invoked when the user clicks the menu item to set the
 * selected tabs as inactive.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Suppress("LongMethod", "LongParameterList")
@Composable
private fun MultiSelectBanner(
    selectedTabCount: Int,
    shouldShowInactiveButton: Boolean,
    onExitSelectModeClick: () -> Unit,
    onSaveToCollectionsClick: () -> Unit,
    onShareSelectedTabs: () -> Unit,
    onBookmarkSelectedTabsClick: () -> Unit,
    onCloseSelectedTabsClick: () -> Unit,
    onMakeSelectedTabsInactive: () -> Unit,
) {
    val buttonsEnabled by remember(selectedTabCount) {
        derivedStateOf {
            selectedTabCount > 0
        }
    }
    val buttonTint = if (buttonsEnabled) {
        MaterialTheme.colorScheme.onSurface
    } else {
        MaterialTheme.colorScheme.secondary
    }
    var showMenu by remember { mutableStateOf(false) }
    val menuItems = generateMultiSelectBannerMenuItems(
        shouldShowInactiveButton = shouldShowInactiveButton,
        onBookmarkSelectedTabsClick = onBookmarkSelectedTabsClick,
        onCloseSelectedTabsClick = onCloseSelectedTabsClick,
        onMakeSelectedTabsInactive = onMakeSelectedTabsInactive,
    )

    TopAppBar(
        title = {
            Text(
                text = if (selectedTabCount == 0) {
                    stringResource(R.string.tab_tray_multi_select_title_empty)
                } else {
                    stringResource(R.string.tab_tray_multi_select_title, selectedTabCount)
                },
                modifier = Modifier.testTag(TabsTrayTestTag.SELECTION_COUNTER),
                style = FirefoxTheme.typography.headline6,
            )
        },
        navigationIcon = {
            IconButton(onClick = onExitSelectModeClick) {
                Icon(
                    painter = painterResource(id = R.drawable.mozac_ic_back_24),
                    contentDescription = stringResource(id = R.string.tab_tray_close_multiselect_content_description),
                )
            }
        },
        actions = {
            IconButton(
                onClick = onSaveToCollectionsClick,
                modifier = Modifier.testTag(TabsTrayTestTag.COLLECTIONS_BUTTON),
                enabled = buttonsEnabled,
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_tab_collection),
                    contentDescription = stringResource(
                        id = R.string.tab_tray_collection_button_multiselect_content_description,
                    ),
                )
            }

            IconButton(
                onClick = onShareSelectedTabs,
                enabled = buttonsEnabled,
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_share),
                    contentDescription = stringResource(
                        id = R.string.tab_tray_multiselect_share_content_description,
                    ),
                )
            }

            IconButton(
                onClick = { showMenu = true },
                enabled = buttonsEnabled,
            ) {
                DropdownMenu(
                    menuItems = menuItems,
                    expanded = showMenu,
                    onDismissRequest = { showMenu = false },
                )

                Icon(
                    painter = painterResource(R.drawable.mozac_ic_ellipsis_vertical_24),
                    contentDescription = stringResource(id = R.string.tab_tray_multiselect_menu_content_description),
                )
            }
        },
        expandedHeight = ROW_HEIGHT_DP.dp,
        colors = TopAppBarDefaults.topAppBarColors(
            actionIconContentColor = buttonTint,
        ),
    )
}

@PreviewLightDark
@Composable
private fun TabsTrayBannerPreview() {
    TabsTrayBannerPreviewRoot(
        selectedPage = Page.PrivateTabs,
        normalTabCount = 5,
    )
}

@PreviewLightDark
@Composable
private fun TabsTrayBannerInfinityPreview() {
    TabsTrayBannerPreviewRoot(
        normalTabCount = 200,
    )
}

@PreviewLightDark
@Composable
private fun TabsTrayBannerAutoClosePreview() {
    TabsTrayBannerPreviewRoot(
        shouldShowTabAutoCloseBanner = true,
    )
}

@PreviewLightDark
@Composable
private fun TabsTrayBannerMultiselectPreview() {
    TabsTrayBannerPreviewRoot(
        selectMode = Mode.Select(
            setOf(
                TabSessionState(
                    id = "1",
                    content = ContentState(
                        url = "www.mozilla.com",
                    ),
                ),
                TabSessionState(
                    id = "2",
                    content = ContentState(
                        url = "www.mozilla.com",
                    ),
                ),
            ),
        ),
    )
}

@PreviewLightDark
@Composable
private fun TabsTrayBannerMultiselectNoTabsSelectedPreview() {
    TabsTrayBannerPreviewRoot(
        selectMode = Mode.Select(selectedTabs = setOf()),
    )
}

@Composable
private fun TabsTrayBannerPreviewRoot(
    selectMode: Mode = Mode.Normal,
    selectedPage: Page = Page.NormalTabs,
    normalTabCount: Int = 10,
    privateTabCount: Int = 10,
    syncedTabCount: Int = 10,
    shouldShowTabAutoCloseBanner: Boolean = false,
    shouldShowLockPbmBanner: Boolean = false,
) {
    val normalTabs = generateFakeTabsList(normalTabCount)
    val privateTabs = generateFakeTabsList(privateTabCount)

    val tabsTrayStore = remember {
        TabsTrayStore(
            initialState = TabsTrayState(
                selectedPage = selectedPage,
                mode = selectMode,
                normalTabs = normalTabs,
                privateTabs = privateTabs,
            ),
        )
    }

    FirefoxTheme {
        Box(modifier = Modifier.size(400.dp)) {
            TabsTrayBanner(
                selectedPage = selectedPage,
                normalTabCount = normalTabCount,
                privateTabCount = privateTabCount,
                syncedTabCount = syncedTabCount,
                selectionMode = selectMode,
                isInDebugMode = false,
                shouldShowTabAutoCloseBanner = shouldShowTabAutoCloseBanner,
                shouldShowLockPbmBanner = shouldShowLockPbmBanner,
                onTabPageIndicatorClicked = { page ->
                    tabsTrayStore.dispatch(TabsTrayAction.PageSelected(page))
                },
                onSaveToCollectionClick = {},
                onShareSelectedTabsClick = {},
                onBookmarkSelectedTabsClick = {},
                onDeleteSelectedTabsClick = {},
                onForceSelectedTabsAsInactiveClick = {},
                onTabAutoCloseBannerViewOptionsClick = {},
                onTabsTrayPbmLockedClick = {},
                onTabsTrayPbmLockedDismiss = {},
                onTabAutoCloseBannerDismiss = {},
                onTabAutoCloseBannerShown = {},
                onExitSelectModeClick = {
                    tabsTrayStore.dispatch(TabsTrayAction.ExitSelectMode)
                },
            )
        }
    }
}

private fun generateFakeTabsList(
    tabCount: Int = 10,
    isPrivate: Boolean = false,
): List<TabSessionState> =
    List(tabCount) { index ->
        TabSessionState(
            id = "tabId$index-$isPrivate",
            content = ContentState(
                url = "www.mozilla.com",
                private = isPrivate,
            ),
        )
    }
