/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu.compose

import android.app.PendingIntent
import androidx.compose.foundation.Image
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.unit.dp
import mozilla.components.browser.state.state.CustomTabMenuItem
import mozilla.components.compose.base.theme.PreviewThemeProvider
import mozilla.components.compose.base.theme.Theme
import mozilla.components.feature.addons.Addon
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.MenuAccessPoint
import org.mozilla.fenix.components.menu.MenuDialogTestTag.DESKTOP_SITE_OFF
import org.mozilla.fenix.components.menu.MenuDialogTestTag.DESKTOP_SITE_ON
import org.mozilla.fenix.components.menu.store.SummarizationMenuState
import org.mozilla.fenix.components.menu.store.TranslationInfo
import org.mozilla.fenix.components.menu.store.WebExtensionMenuItem
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Wrapper column containing the main menu items.
 *
 * @param canGoBack Whether or not the back button is enabled.
 * @param canGoForward Whether or not the forward button is enabled.
 * @param isBottomToolbar Whether or not the browser toolbar is at the bottom.
 * @param isSiteLoading Whether or not the custom tab is currently loading.
 * @param isPdf Whether or not the current custom tab is a PDF.
 * @param isDesktopMode Whether or not the current site is in desktop mode.
 * @param isSandboxCustomTab Whether or not the current custom tab is sandboxed.
 * @param isBookmarked Whether or not the current custom tab is bookmarked.
 * @param isExtensionsExpanded Whether or not the extensions submenu is expanded.
 * @param isExtensionsProcessDisabled Whether or not the extensions process is disabled due to extension errors.
 * @param isAllWebExtensionsDisabled Whether or not all web extensions are disabled.
 * @param shouldShowExtensionsMenu Whether or not the extensions menu item should be shown.
 * @param webExtensionMenuCount The number of web extensions.
 * @param extensionsMenuDescription The description to be shown below the extensions menu item.
 * @param customTabMenuItems Additional [CustomTabMenuItem]s to be displayed to the custom tab menu.
 * @param onCustomMenuItemClick Invoked when the user clicks on [CustomTabMenuItem]s.
 * @param scrollState The [ScrollState] used for vertical scrolling.
 * @param onSwitchToDesktopSiteMenuClick Invoked when the user clicks on the switch to desktop site menu toggle.
 * @param onBookmarkPageMenuClick Invoked when the user clicks on the bookmark page menu item.
 * @param onEditBookmarkMenuClick Invoked when the user clicks on the edit bookmark menu item.
 * @param onFindInPageMenuClick Invoked when the user clicks on the find in page menu item.
 * @param onOpenInFirefoxMenuClick Invoked when the user clicks on the open in browser menu item.
 * @param onBackButtonClick Invoked when the user clicks on the back button.
 * @param onForwardButtonClick Invoked when the user clicks on the forward button.
 * @param onRefreshButtonClick Invoked when the user clicks on the refresh button.
 * @param onStopButtonClick Invoked when the user clicks on the stop button.
 * @param onShareButtonClick Invoked when the user clicks on the share button.
 * @param onExtensionsMenuClick Invoked when the user clicks on the extensions menu item.
 * @param extensionSubmenu The submenu content to be shown when the extensions menu item is expanded
 * @param translationInfo Translation information and configuration.
 * @param isReaderViewActive Whether the reader view is active.
 * @param summarizationMenuState The state of the summarization menu.
 * @param onSummarizePageMenuExposed Invoked when the user sees the summarization dialog.
 * @param onSummarizePageClick Invoked when the user clicks on the summarize page menu item.
 */
@Suppress("LongParameterList", "LongMethod", "CyclomaticComplexMethod", "CognitiveComplexMethod")
@Composable
internal fun CustomTabMenu(
    canGoBack: Boolean,
    canGoForward: Boolean,
    isBottomToolbar: Boolean,
    isSiteLoading: Boolean,
    isPdf: Boolean,
    isDesktopMode: Boolean,
    isSandboxCustomTab: Boolean,
    isBookmarked: Boolean,
    isExtensionsExpanded: Boolean,
    isExtensionsProcessDisabled: Boolean,
    isAllWebExtensionsDisabled: Boolean,
    shouldShowExtensionsMenu: Boolean,
    webExtensionMenuCount: Int,
    extensionsMenuDescription: String?,
    customTabMenuItems: List<CustomTabMenuItem>?,
    onCustomMenuItemClick: (PendingIntent) -> Unit,
    scrollState: ScrollState,
    onSwitchToDesktopSiteMenuClick: () -> Unit,
    onBookmarkPageMenuClick: () -> Unit,
    onEditBookmarkMenuClick: () -> Unit,
    onFindInPageMenuClick: () -> Unit,
    onOpenInFirefoxMenuClick: () -> Unit,
    onBackButtonClick: (longPress: Boolean) -> Unit,
    onForwardButtonClick: (longPress: Boolean) -> Unit,
    onRefreshButtonClick: (longPress: Boolean) -> Unit,
    onStopButtonClick: () -> Unit,
    onShareButtonClick: () -> Unit,
    onExtensionsMenuClick: () -> Unit,
    extensionSubmenu: @Composable () -> Unit,
    translationInfo: TranslationInfo,
    isReaderViewActive: Boolean,
    summarizationMenuState: SummarizationMenuState,
    onSummarizePageMenuExposed: () -> Unit,
    onSummarizePageClick: () -> Unit,
) {
    MenuFrame(
        contentModifier =
            Modifier.padding(
                start = 8.dp,
                top = if (isBottomToolbar) 0.dp else 8.dp,
                end = 8.dp,
                bottom = if (isBottomToolbar) 84.dp else 16.dp,
            ),
        scrollState = scrollState,
        header = {
            if (!isBottomToolbar) {
                MenuNavigation(
                    isSiteLoading = isSiteLoading,
                    isExtensionsExpanded = false,
                    isMoreMenuExpanded = false,
                    onBackButtonClick = onBackButtonClick,
                    onForwardButtonClick = onForwardButtonClick,
                    onRefreshButtonClick = onRefreshButtonClick,
                    onStopButtonClick = onStopButtonClick,
                    onShareButtonClick = onShareButtonClick,
                    goBackState = if (canGoBack) MenuItemState.ENABLED else MenuItemState.DISABLED,
                    goForwardState = if (canGoForward) MenuItemState.ENABLED else MenuItemState.DISABLED,
                )

                if (scrollState.canScrollBackward) {
                    HorizontalDivider()
                }
            }
        },
        footer = {
            if (isBottomToolbar) {
                if (scrollState.canScrollBackward) {
                    HorizontalDivider()
                }

                MenuNavigation(
                    isSiteLoading = isSiteLoading,
                    isExtensionsExpanded = false,
                    isMoreMenuExpanded = false,
                    onBackButtonClick = onBackButtonClick,
                    onForwardButtonClick = onForwardButtonClick,
                    onRefreshButtonClick = onRefreshButtonClick,
                    onStopButtonClick = onStopButtonClick,
                    onShareButtonClick = onShareButtonClick,
                    goBackState = if (canGoBack) MenuItemState.ENABLED else MenuItemState.DISABLED,
                    goForwardState = if (canGoForward) MenuItemState.ENABLED else MenuItemState.DISABLED,
                )
            }
        },
    ) {
        if (isBottomToolbar) {
            PoweredByFirefoxItem(modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
        }

        MenuGroup {
            val badgeText: String
            val menuItemState: MenuItemState

            if (isDesktopMode) {
                badgeText = stringResource(id = R.string.browser_feature_desktop_site_on)
                menuItemState = if (isPdf) MenuItemState.DISABLED else MenuItemState.ACTIVE
            } else {
                badgeText = stringResource(id = R.string.browser_feature_desktop_site_off)
                menuItemState = if (isPdf) MenuItemState.DISABLED else MenuItemState.ENABLED
            }

            MenuItem(
                label =
                    stringResource(
                        id = R.string.browser_menu_open_in_fenix,
                        stringResource(id = R.string.app_name),
                    ),
                beforeIconPainter = painterResource(id = iconsR.drawable.mozac_ic_external_link_24),
                onClick = onOpenInFirefoxMenuClick,
                state =
                    if (isSandboxCustomTab) {
                        MenuItemState.DISABLED
                    } else {
                        MenuItemState.ENABLED
                    },
            )

            if (isBookmarked) {
                MenuItem(
                    label = stringResource(id = R.string.browser_menu_edit_bookmark),
                    modifier = Modifier.testTag(CustomTabMenuTestTags.EDIT_BOOKMARK_PAGE_ITEM),
                    beforeIconPainter = painterResource(id = iconsR.drawable.mozac_ic_bookmark_fill_24),
                    state = MenuItemState.ACTIVE,
                    onClick = onEditBookmarkMenuClick,
                )
            } else {
                MenuItem(
                    label = stringResource(id = R.string.browser_menu_bookmark_this_page_2),
                    modifier = Modifier.testTag(CustomTabMenuTestTags.BOOKMARK_PAGE_ITEM),
                    beforeIconPainter = painterResource(id = iconsR.drawable.mozac_ic_bookmark_24),
                    onClick = onBookmarkPageMenuClick,
                )
            }

            MenuItem(
                label = stringResource(id = R.string.browser_menu_find_in_page),
                beforeIconPainter = painterResource(id = iconsR.drawable.mozac_ic_search_24),
                onClick = onFindInPageMenuClick,
            )

            MenuItem(
                modifier =
                    Modifier.semantics {
                        testTagsAsResourceId = true
                        testTag =
                            when (menuItemState) {
                                MenuItemState.ACTIVE -> DESKTOP_SITE_ON
                                else -> DESKTOP_SITE_OFF
                            }
                    },
                label = stringResource(id = R.string.browser_menu_desktop_site),
                beforeIconPainter = painterResource(id = iconsR.drawable.mozac_ic_device_desktop_24),
                state = menuItemState,
                onClick = onSwitchToDesktopSiteMenuClick,
            ) {
                if (menuItemState == MenuItemState.DISABLED) {
                    return@MenuItem
                }

                Badge(
                    badgeText = badgeText,
                    state = menuItemState,
                )
            }

            if (shouldShowExtensionsMenu) {
                ExtensionsMenuItem(
                    inCustomTab = true,
                    isExtensionsProcessDisabled = isExtensionsProcessDisabled,
                    isExtensionsExpanded = isExtensionsExpanded,
                    isAllWebExtensionsDisabled = isAllWebExtensionsDisabled,
                    webExtensionMenuCount = webExtensionMenuCount,
                    extensionsMenuItemDescription = extensionsMenuDescription,
                    onExtensionsMenuClick = onExtensionsMenuClick,
                    extensionSubmenu = extensionSubmenu,
                )
            }

            TranslationMenuItem(
                translationInfo = translationInfo,
                isReaderViewActive = isReaderViewActive,
            )

            SummarizationMenuItem(
                summarizationMenuState = summarizationMenuState,
                onSummarizePageMenuExposed = onSummarizePageMenuExposed,
                onSummarizePageClick = onSummarizePageClick,
            )
        }

        if (!customTabMenuItems.isNullOrEmpty()) {
            MenuGroup {
                customTabMenuItems.forEach { customTabMenuItem ->
                    MenuTextItem(
                        label = customTabMenuItem.name,
                        onClick = { onCustomMenuItemClick(customTabMenuItem.pendingIntent) },
                    )
                }
            }
        }

        if (!isBottomToolbar) {
            PoweredByFirefoxItem(modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
internal fun CustomTabAddons(
    webExtensionMenuItems: Map<WebExtensionMenuItem, Addon?>,
    onWebExtensionMenuItemClick: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        if (webExtensionMenuItems.isNotEmpty()) {
            WebExtensionMenuItems(
                accessPoint = MenuAccessPoint.External,
                webExtensionMenuItems = webExtensionMenuItems,
                onWebExtensionMenuItemClick = onWebExtensionMenuItemClick,
                onWebExtensionMenuItemSettingsClick = {},
            )
        }
    }
}

/**
 * A menu item that shows the "Powered by Firefox" text and logo.
 *
 * @param modifier [Modifier] to be applied to the layout.
 */
@Composable
private fun PoweredByFirefoxItem(modifier: Modifier = Modifier) {
    Row(
        horizontalArrangement = Arrangement.Center,
        modifier = modifier.fillMaxWidth(),
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_firefox),
            contentDescription = null,
            modifier = Modifier.size(16.dp).align(Alignment.CenterVertically),
        )

        Spacer(Modifier.width(4.dp))

        Text(
            text =
                stringResource(
                    id = R.string.browser_menu_powered_by2,
                    stringResource(id = R.string.app_name),
                ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = FirefoxTheme.typography.caption,
        )
    }
}

@Preview
@Composable
private fun CustomTabMenuPreview(@PreviewParameter(PreviewThemeProvider::class) theme: Theme) {
    FirefoxTheme(theme) {
        Column(
            modifier =
                Modifier.background(color = MaterialTheme.colorScheme.surface)
                    .padding(all = FirefoxTheme.layout.space.static200)
        ) {
            CustomTabMenu(
                canGoBack = true,
                canGoForward = true,
                isBottomToolbar = false,
                isSiteLoading = true,
                isPdf = false,
                isDesktopMode = false,
                isSandboxCustomTab = false,
                isBookmarked = true,
                isExtensionsExpanded = false,
                isExtensionsProcessDisabled = false,
                isAllWebExtensionsDisabled = false,
                shouldShowExtensionsMenu = true,
                webExtensionMenuCount = 2,
                extensionsMenuDescription = "Extension 1, Extension 2",
                customTabMenuItems = null,
                onCustomMenuItemClick = { _: PendingIntent -> },
                scrollState = rememberScrollState(),
                onSwitchToDesktopSiteMenuClick = {},
                onBookmarkPageMenuClick = {},
                onEditBookmarkMenuClick = {},
                onFindInPageMenuClick = {},
                onOpenInFirefoxMenuClick = {},
                onBackButtonClick = {},
                onForwardButtonClick = {},
                onRefreshButtonClick = {},
                onStopButtonClick = {},
                onShareButtonClick = {},
                onExtensionsMenuClick = {},
                extensionSubmenu = {},
                translationInfo = TranslationInfo(false, false, false, "") {},
                isReaderViewActive = false,
                summarizationMenuState = SummarizationMenuState.Default,
                onSummarizePageMenuExposed = {},
                onSummarizePageClick = {},
            )
        }
    }
}

@Preview
@Composable
private fun CustomTabMenuDisabledButtonsPreview(@PreviewParameter(PreviewThemeProvider::class) theme: Theme) {
    FirefoxTheme(theme) {
        Column(
            modifier =
                Modifier.background(color = MaterialTheme.colorScheme.surface)
                    .padding(all = FirefoxTheme.layout.space.static200)
        ) {
            CustomTabMenu(
                canGoBack = false,
                canGoForward = false,
                isBookmarked = false,
                isBottomToolbar = true,
                isSiteLoading = false,
                isPdf = true,
                isDesktopMode = false,
                isSandboxCustomTab = false,
                isExtensionsExpanded = true,
                isExtensionsProcessDisabled = true,
                isAllWebExtensionsDisabled = true,
                shouldShowExtensionsMenu = true,
                webExtensionMenuCount = 0,
                extensionsMenuDescription = "Temporarily disabled",
                customTabMenuItems = null,
                onCustomMenuItemClick = { _: PendingIntent -> },
                scrollState = rememberScrollState(),
                onSwitchToDesktopSiteMenuClick = {},
                onBookmarkPageMenuClick = {},
                onEditBookmarkMenuClick = {},
                onFindInPageMenuClick = {},
                onOpenInFirefoxMenuClick = {},
                onBackButtonClick = {},
                onForwardButtonClick = {},
                onRefreshButtonClick = {},
                onStopButtonClick = {},
                onShareButtonClick = {},
                onExtensionsMenuClick = {},
                extensionSubmenu = {},
                translationInfo = TranslationInfo(false, false, false, "") {},
                isReaderViewActive = false,
                summarizationMenuState = SummarizationMenuState.Default,
                onSummarizePageMenuExposed = {},
                onSummarizePageClick = {},
            )
        }
    }
}
