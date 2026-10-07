/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.MenuItemProvider
import org.mozilla.fenix.components.menu.store.MenuAction

/**
 * [MenuItemProvider] for the menu item allowing to refresh or stop loading the current page.
 *
 * @param browserStore [BrowserStore] used to know if the current page is loading.
 * @param scope [CoroutineScope] used to keep the item up to date for as long as it can be shown.
 */
class RefreshMenuItemProvider(
    browserStore: BrowserStore,
    scope: CoroutineScope,
) : MenuItemProvider {
    override val itemFlow: StateFlow<MenuItem?> =
        browserStore.stateFlow
            .distinctUntilChangedBy { it.selectedTab?.content?.loading }
            .map { it.refreshItem() }
            .stateIn(
                scope = scope,
                started = SharingStarted.Eagerly,
                initialValue = browserStore.state.refreshItem(),
            )

    private fun BrowserState.refreshItem(): MenuItem? =
        selectedTab?.content?.let { content ->
            if (content.loading) {
                StandardMenuItem(
                    title = Text.Resource(R.string.browser_menu_stop),
                    icon = MenuItemIconRes(iconsR.drawable.mozac_ic_cross_24),
                    onClickEvent = MenuAction.Navigate.Stop,
                )
            } else {
                StandardMenuItem(
                    title = Text.Resource(R.string.browser_menu_refresh),
                    icon = MenuItemIconRes(iconsR.drawable.mozac_ic_arrow_clockwise_24),
                    onClickEvent = MenuAction.Navigate.Reload(bypassCache = false),
                    onLongClickEvent = MenuAction.Navigate.Reload(bypassCache = true),
                )
            }
        }
}
