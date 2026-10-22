/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu.browser

import android.content.Context
import android.graphics.drawable.Drawable
import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.MenuItemBadge
import mozilla.components.compose.menu.data.MenuItemsGroup
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconDrawable
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.lib.state.ext.flow
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.focus.R
import org.mozilla.focus.menu.MenuItemTapped
import org.mozilla.focus.menu.MenuItems
import org.mozilla.focus.menu.ToolbarMenu
import org.mozilla.focus.state.AppStore
import org.mozilla.focus.topsites.DefaultTopSitesStorage.Companion.TOP_SITES_MAX_LIMIT

private const val NAVIGATION_GROUP_ID = "navigation"
private const val SHORTCUTS_GROUP_ID = "shortcuts"
private const val WEBPAGE_GROUP_ID = "webpage"
private const val MOVE_OUTSIDE_GROUP_ID = "move_outside"
private const val SETTINGS_GROUP_ID = "settings"

/** The menu shown in the BrowserFragment containing page actions like "Refresh", "Share" etc. */
class BrowserMenu(
    private val browserStore: BrowserStore,
    private val appStore: AppStore,
    context: Context,
) : MenuItems {
    private val reporterIcon = WebCompatReporterIcon(context, browserStore) { webCompatReporterAction() }

    override val menuGroups: Flow<List<MenuItemsGroup>> =
        combine(browserStore.flow(), reporterIcon.flow()) { state, icon -> menuGroupsFor(state, icon) }
            .distinctUntilChanged()

    override fun currentMenuGroups(): List<MenuItemsGroup> = menuGroupsFor(browserStore.state, reporterIcon.current)

    private fun menuGroupsFor(
        browserState: BrowserState,
        reportSiteIssueIcon: Drawable?,
    ): List<MenuItemsGroup> {
        val tab = browserState.selectedTab
        val url = tab?.content?.url
        val appState = appStore.state
        val isShortcut = appState.topSites.any { it.url == url }

        return MenuStatus(
                canGoBack = tab?.content?.canGoBack == true,
                canGoForward = tab?.content?.canGoForward == true,
                isLoading = tab?.content?.loading == true,
                isDesktopMode = tab?.content?.desktopMode == true,
                isPdf = tab?.content?.isPdf == true,
                isShortcut = isShortcut,
                canAddShortcut = !isShortcut && url != null && appState.topSites.size < TOP_SITES_MAX_LIMIT,
                canAddToHomeScreen = tab != null && appState.isPinningSupported == true,
                reportSiteIssueTitle = browserState.webCompatReporterAction()?.title,
                reportSiteIssueIcon = reportSiteIssueIcon,
            )
            .toMenuGroups()
    }
}

/** All properties based on which the browser menu can be built. */
private data class MenuStatus(
    val canGoBack: Boolean,
    val canGoForward: Boolean,
    val isLoading: Boolean,
    val isDesktopMode: Boolean,
    val isPdf: Boolean,
    val isShortcut: Boolean,
    val canAddShortcut: Boolean,
    val canAddToHomeScreen: Boolean,
    val reportSiteIssueTitle: String?,
    val reportSiteIssueIcon: Drawable?,
)

private fun MenuStatus.toMenuGroups(): List<MenuItemsGroup> =
    listOf(
            MenuItemsGroup.Grid(id = NAVIGATION_GROUP_ID, items = navigationItems(), isSticky = true),
            MenuItemsGroup.Row(id = SHORTCUTS_GROUP_ID, items = listOfNotNull(shortcutItem())),
            MenuItemsGroup.Row(
                id = WEBPAGE_GROUP_ID,
                items = listOfNotNull(findInPageItem(), desktopSiteItem(), reportSiteIssueItem()),
            ),
            MenuItemsGroup.Row(
                id = MOVE_OUTSIDE_GROUP_ID,
                items = listOfNotNull(addToHomeScreenItem(), openInAppItem()),
            ),
            MenuItemsGroup.Row(id = SETTINGS_GROUP_ID, items = listOf(settingsItem())),
        )
        .filter { it.items.isNotEmpty() }

private fun MenuStatus.navigationItems(): List<MenuItem> =
    listOf(
        menuItem(
            title = R.string.content_description_back,
            icon = iconsR.drawable.mozac_ic_back_24,
            item = ToolbarMenu.Item.Back,
            state = if (canGoBack) MenuItemState.DEFAULT else MenuItemState.DISABLED,
        ),
        menuItem(
            title = R.string.content_description_forward,
            icon = iconsR.drawable.mozac_ic_forward_24,
            item = ToolbarMenu.Item.Forward,
            state = if (canGoForward) MenuItemState.DEFAULT else MenuItemState.DISABLED,
        ),
        menuItem(
            title = R.string.menu_share,
            icon = iconsR.drawable.mozac_ic_share_android_24,
            item = ToolbarMenu.Item.Share,
        ),
        if (isLoading) {
            menuItem(
                title = R.string.content_description_stop,
                icon = iconsR.drawable.mozac_ic_cross_24,
                item = ToolbarMenu.Item.Stop,
            )
        } else {
            menuItem(
                title = R.string.content_description_reload,
                icon = iconsR.drawable.mozac_ic_arrow_clockwise_24,
                item = ToolbarMenu.Item.Reload,
            )
        },
    )

private fun MenuStatus.shortcutItem(): MenuItem? =
    when {
        isShortcut ->
            menuItem(
                title = R.string.menu_remove_from_shortcuts,
                icon = iconsR.drawable.mozac_ic_pin_slash_24,
                item = ToolbarMenu.Item.RemoveFromShortcuts,
            )

        canAddShortcut ->
            menuItem(
                title = R.string.menu_add_to_shortcuts,
                icon = iconsR.drawable.mozac_ic_pin_24,
                item = ToolbarMenu.Item.AddToShortcuts,
            )

        else -> null
    }

private fun findInPageItem(): MenuItem =
    menuItem(
        title = R.string.find_in_page,
        icon = iconsR.drawable.mozac_ic_search_24,
        item = ToolbarMenu.Item.FindInPage,
    )

private fun MenuStatus.desktopSiteItem(): MenuItem? {
    if (isPdf) return null

    val state = if (isDesktopMode) MenuItemState.ACTIVE else MenuItemState.DEFAULT

    return menuItem(
        title = R.string.preference_performance_request_desktop_site2,
        icon = iconsR.drawable.mozac_ic_device_desktop_24,
        item = ToolbarMenu.Item.RequestDesktop(isChecked = !isDesktopMode),
        state = state,
        badge =
            MenuItemBadge(
                text =
                    Text.Resource(if (isDesktopMode) R.string.preference_state_on else R.string.preference_state_off),
                state = state,
            ),
    )
}

private fun MenuStatus.reportSiteIssueItem(): MenuItem? = reportSiteIssueTitle?.let { title ->
    StandardMenuItem(
        title = Text.String(title),
        icon = reportSiteIssueIcon?.let { MenuItemIconDrawable(it) },
        onClickEvent = MenuItemTapped(ToolbarMenu.Item.ReportSiteIssue),
    )
}

private fun MenuStatus.addToHomeScreenItem(): MenuItem? =
    if (canAddToHomeScreen) {
        menuItem(
            title = R.string.menu_add_to_home_screen,
            icon = iconsR.drawable.mozac_ic_add_to_homescreen_24,
            item = ToolbarMenu.Item.AddToHomeScreen,
        )
    } else {
        null
    }

private fun openInAppItem(): MenuItem =
    menuItem(
        title = R.string.menu_open_with_a_browser2,
        icon = iconsR.drawable.mozac_ic_external_link_24,
        item = ToolbarMenu.Item.OpenInApp,
    )

private fun settingsItem(): MenuItem =
    menuItem(
        title = R.string.menu_settings,
        icon = iconsR.drawable.mozac_ic_settings_24,
        item = ToolbarMenu.Item.Settings,
    )

private fun menuItem(
    @StringRes title: Int,
    @DrawableRes icon: Int,
    item: ToolbarMenu.Item,
    state: MenuItemState = MenuItemState.DEFAULT,
    badge: MenuItemBadge? = null,
): MenuItem =
    StandardMenuItem(
        title = Text.Resource(title),
        icon = MenuItemIconRes(iconRes = icon),
        onClickEvent = MenuItemTapped(item),
        badge = badge,
        state = state,
    )
