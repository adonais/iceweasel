/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.webcompat

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.support.ktx.kotlin.isAboutUrl
import mozilla.components.support.ktx.kotlin.isContentUrl
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.MenuItemProvider
import org.mozilla.fenix.components.menu.store.MenuAction

/**
 * [MenuItemProvider] for the menu item allowing to report the current page as broken.
 *
 * @param browserStore [BrowserStore] used to know which page the item is about.
 * @param scope [CoroutineScope] used to keep the item up to date for as long as it can be shown.
 */
class ReportBrokenSiteMenuItemProvider(
    browserStore: BrowserStore,
    scope: CoroutineScope,
) : MenuItemProvider {
    override val itemFlow: StateFlow<MenuItem?> =
        browserStore.stateFlow
            .map { state -> state.reportBrokenSiteItem() }
            .stateIn(
                scope = scope,
                started = SharingStarted.Eagerly,
                initialValue = browserStore.state.reportBrokenSiteItem(),
            )
}

private fun BrowserState.reportBrokenSiteItem(): MenuItem? {
    val url = selectedTab?.content?.url ?: return null

    return StandardMenuItem(
        title = Text.Resource(R.string.browser_menu_webcompat_reporter_2),
        icon = MenuItemIconRes(iconsR.drawable.mozac_ic_lightbulb_24),
        onClickEvent = MenuAction.Navigate.WebCompatReporter,
        // There is nothing to report about the pages the browser itself shows.
        state =
            when (url.isAboutUrl() || url.isContentUrl()) {
                true -> MenuItemState.DISABLED
                else -> MenuItemState.DEFAULT
            },
    )
}
