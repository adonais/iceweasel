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
import mozilla.components.browser.state.selector.findCustomTab
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.CustomTabMenuItem
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuAttribution
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
import org.mozilla.focus.menu.CustomTabMenuItemTapped
import org.mozilla.focus.menu.MenuItemTapped
import org.mozilla.focus.menu.MenuItems
import org.mozilla.focus.menu.ToolbarMenu

private const val NAVIGATION_GROUP_ID = "navigation"
private const val WEBPAGE_GROUP_ID = "webpage"
private const val MOVE_OUTSIDE_GROUP_ID = "move_outside"
private const val CUSTOM_ITEMS_GROUP_ID = "custom_items"

/**
 * The menu shown while browsing in a custom tab.
 *
 * @param context [Context] used to know in which size and color to show the icon the WebCompat Reporter extension
 *   provides.
 * @param browserStore [BrowserStore] used to know the state of the current page.
 * @param customTabId Id of the custom tab this menu is shown for.
 * @param appName Name of this application, shown in the item for opening the current page in it.
 * @param isOnboardingTab Whether this is an onboarding custom tab, from which the current page cannot be opened
 *   somewhere else.
 */
class CustomTabMenu(
    context: Context,
    private val browserStore: BrowserStore,
    private val customTabId: String,
    private val appName: String,
    private val isOnboardingTab: Boolean,
) : MenuItems {
    private val reporterIcon =
        WebCompatReporterIcon(context, browserStore) { webCompatReporterAction(findCustomTab(customTabId)) }

    /** Attributes the menu to this application, which opened the custom tab of another one. */
    val attribution =
        MenuAttribution(
            title = Text.Resource(R.string.menu_custom_tab_branding, listOf(appName)),
            showAtTop = false,
            icon = MenuItemIconRes(R.drawable.onboarding_logo),
        )

    override val menuGroups: Flow<List<MenuItemsGroup>> =
        combine(browserStore.flow(), reporterIcon.flow()) { state, icon -> menuGroupsFor(state, icon) }
            .distinctUntilChanged()

    override fun currentMenuGroups(): List<MenuItemsGroup> = menuGroupsFor(browserStore.state, reporterIcon.current)

    private fun menuGroupsFor(
        browserState: BrowserState,
        reportSiteIssueIcon: Drawable?,
    ): List<MenuItemsGroup> {
        val customTab = browserState.findCustomTab(customTabId)
        val reportSiteIssueAction = browserState.webCompatReporterAction(customTab)

        return CustomTabMenuStatus(
                canGoBack = customTab?.content?.canGoBack == true,
                canGoForward = customTab?.content?.canGoForward == true,
                isLoading = customTab?.content?.loading == true,
                isDesktopMode = customTab?.content?.desktopMode == true,
                isPdf = customTab?.content?.isPdf == true,
                canOpenSomewhereElse = !isOnboardingTab,
                appName = appName,
                reportSiteIssueTitle = reportSiteIssueAction?.title,
                reportSiteIssueIcon = reportSiteIssueIcon,
                customItems = customTab?.config?.menuItems.orEmpty(),
            )
            .toMenuGroups()
    }
}

/** All properties based on which the menu of a custom tab can be built. */
private data class CustomTabMenuStatus(
    val canGoBack: Boolean,
    val canGoForward: Boolean,
    val isLoading: Boolean,
    val isDesktopMode: Boolean,
    val isPdf: Boolean,
    val canOpenSomewhereElse: Boolean,
    val appName: String,
    val reportSiteIssueTitle: String?,
    val reportSiteIssueIcon: Drawable?,
    val customItems: List<CustomTabMenuItem>,
)

private fun CustomTabMenuStatus.toMenuGroups(): List<MenuItemsGroup> =
    listOf(
            MenuItemsGroup.Grid(id = NAVIGATION_GROUP_ID, items = navigationItems(), isSticky = true),
            MenuItemsGroup.Row(
                id = WEBPAGE_GROUP_ID,
                items = listOfNotNull(findInPageItem(), desktopSiteItem(), reportSiteIssueItem()),
            ),
            MenuItemsGroup.Row(id = MOVE_OUTSIDE_GROUP_ID, items = openItems()),
            MenuItemsGroup.Row(id = CUSTOM_ITEMS_GROUP_ID, items = customMenuItems()),
        )
        .filter { it.items.isNotEmpty() }

private fun CustomTabMenuStatus.navigationItems(): List<MenuItem> =
    listOf(
        menuItem(
            title = R.string.content_description_back,
            icon = iconsR.drawable.mozac_ic_back_24,
            item = ToolbarMenu.CustomTabItem.Back,
            state = if (canGoBack) MenuItemState.DEFAULT else MenuItemState.DISABLED,
            showText = false,
        ),
        menuItem(
            title = R.string.content_description_forward,
            icon = iconsR.drawable.mozac_ic_forward_24,
            item = ToolbarMenu.CustomTabItem.Forward,
            state = if (canGoForward) MenuItemState.DEFAULT else MenuItemState.DISABLED,
            showText = false,
        ),
        if (isLoading) {
            menuItem(
                title = R.string.content_description_stop,
                icon = iconsR.drawable.mozac_ic_cross_24,
                item = ToolbarMenu.CustomTabItem.Stop,
                showText = false,
            )
        } else {
            menuItem(
                title = R.string.content_description_reload,
                icon = iconsR.drawable.mozac_ic_arrow_clockwise_24,
                item = ToolbarMenu.CustomTabItem.Reload,
                showText = false,
            )
        },
    )

private fun findInPageItem(): MenuItem =
    menuItem(
        title = R.string.find_in_page,
        icon = iconsR.drawable.mozac_ic_search_24,
        item = ToolbarMenu.CustomTabItem.FindInPage,
    )

private fun CustomTabMenuStatus.desktopSiteItem(): MenuItem? {
    if (isPdf) return null

    val state = if (isDesktopMode) MenuItemState.ACTIVE else MenuItemState.DEFAULT

    return menuItem(
        title = R.string.preference_performance_request_desktop_site2,
        icon = iconsR.drawable.mozac_ic_device_desktop_24,
        item = ToolbarMenu.CustomTabItem.RequestDesktop(isChecked = !isDesktopMode),
        state = state,
        badge =
            MenuItemBadge(
                text =
                    Text.Resource(if (isDesktopMode) R.string.preference_state_on else R.string.preference_state_off),
                state = state,
            ),
    )
}

private fun CustomTabMenuStatus.reportSiteIssueItem(): MenuItem? = reportSiteIssueTitle?.let { title ->
    StandardMenuItem(
        title = Text.String(title),
        icon = reportSiteIssueIcon?.let { MenuItemIconDrawable(it) },
        onClickEvent = MenuItemTapped(ToolbarMenu.CustomTabItem.ReportSiteIssue),
    )
}

private fun CustomTabMenuStatus.openItems(): List<MenuItem> =
    listOfNotNull(
        menuItem(
            title = R.string.menu_add_to_home_screen,
            icon = iconsR.drawable.mozac_ic_add_to_homescreen_24,
            item = ToolbarMenu.CustomTabItem.AddToHomeScreen,
        ),
        if (canOpenSomewhereElse) {
            StandardMenuItem(
                title = Text.Resource(R.string.menu_open_with_default_browser2, listOf(appName)),
                onClickEvent = MenuItemTapped(ToolbarMenu.CustomTabItem.OpenInBrowser),
            )
        } else {
            null
        },
        if (canOpenSomewhereElse) {
            StandardMenuItem(
                title = Text.Resource(R.string.menu_open_with_a_browser2),
                onClickEvent = MenuItemTapped(ToolbarMenu.CustomTabItem.OpenInApp),
            )
        } else {
            null
        },
    )

/** The items the application which opened this custom tab asked to be shown in its menu. */
private fun CustomTabMenuStatus.customMenuItems(): List<MenuItem> = customItems.map { item ->
    StandardMenuItem(
        title = Text.String(item.name),
        onClickEvent = CustomTabMenuItemTapped(item),
    )
}

private fun menuItem(
    @StringRes title: Int,
    @DrawableRes icon: Int,
    item: ToolbarMenu.CustomTabItem,
    state: MenuItemState = MenuItemState.DEFAULT,
    badge: MenuItemBadge? = null,
    showText: Boolean = true,
): MenuItem =
    StandardMenuItem(
        title = if (showText) Text.Resource(title) else Text.String(""),
        contentDescription = if (showText) null else Text.Resource(title),
        icon = MenuItemIconRes(iconRes = icon),
        onClickEvent = MenuItemTapped(item),
        badge = badge,
        state = state,
    )
