/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.applinks

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.feature.app.links.AppLinksUseCases
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.components.appstate.SupportedMenuNotifications
import org.mozilla.fenix.components.menu.MenuItemProvider
import org.mozilla.fenix.components.menu.store.MenuAction

/**
 * [MenuItemProvider] for the menu item allowing to open the current webpage in the app that handles it.
 *
 * The item is always shown, but usable only while there actually is such an app, so that it does not appear and
 * disappear as the user browses.
 *
 * @param browserStore [BrowserStore] used to know which page the item is about.
 * @param appStore [AppStore] used to know whether to draw attention to this item.
 * @param appLinksUseCases [AppLinksUseCases] used to know which app can open the current page.
 * @param scope [CoroutineScope] used to keep the item up to date for as long as it can be shown.
 */
class OpenInAppMenuItemProvider(
    browserStore: BrowserStore,
    appStore: AppStore,
    private val appLinksUseCases: AppLinksUseCases,
    scope: CoroutineScope,
) : MenuItemProvider {
    override val itemFlow: StateFlow<MenuItem?> =
        combine(browserStore.currentUrl(), appStore.isOpenInAppHighlighted()) { url, isHighlighted ->
                openInAppItem(url = url, isHighlighted = isHighlighted)
            }
            .stateIn(
                scope = scope,
                started = SharingStarted.Eagerly,
                initialValue =
                    openInAppItem(
                        url = browserStore.state.selectedTab?.content?.url,
                        isHighlighted = appStore.state.isOpenInAppHighlighted(),
                    ),
            )

    /**
     * The item to show, usable only if an external app can open [url].
     *
     * Which app that is - if any - is asked of the system, which the use case keeps cheap through a short lived cache.
     */
    private fun openInAppItem(
        url: String?,
        isHighlighted: Boolean,
    ): MenuItem {
        val externalApp = url?.let { appLinksUseCases.appLinkRedirect(it) }?.takeIf { it.hasExternalApp() }

        return StandardMenuItem(
            title =
                when (val appName = externalApp?.appName?.takeIf { it.isNotEmpty() }) {
                    null -> Text.Resource(R.string.browser_menu_open_app_link)
                    else -> Text.Resource(R.string.browser_menu_open_in_fenix, listOf(appName))
                },
            icon =
                MenuItemIconRes(
                    iconsR.drawable.mozac_ic_more_grid_24,
                    isHighlighted = isHighlighted && externalApp != null,
                ),
            onClickEvent = MenuAction.OpenInApp,
            state =
                when (externalApp) {
                    null -> MenuItemState.DISABLED
                    else -> MenuItemState.DEFAULT
                },
        )
    }
}

/** The url of the page currently shown, offered anew only when the user navigates to another one. */
private fun BrowserStore.currentUrl() =
    stateFlow.map { state -> state.selectedTab?.content?.url }.distinctUntilChanged()

/** Whether attention should be drawn to opening the current page in an app, offered anew only when it changes. */
private fun AppStore.isOpenInAppHighlighted() =
    stateFlow.map { state -> state.isOpenInAppHighlighted() }.distinctUntilChanged()

private fun AppState.isOpenInAppHighlighted() =
    supportedMenuNotifications.contains(SupportedMenuNotifications.OpenInApp)
