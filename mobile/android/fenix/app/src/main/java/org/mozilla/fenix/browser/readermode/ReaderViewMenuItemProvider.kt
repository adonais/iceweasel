/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.readermode

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
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.MenuItemProvider
import org.mozilla.fenix.components.menu.store.MenuAction

/**
 * [MenuItemProvider] for the menu item allowing to customize the reader view, shown only while reader view is active.
 *
 * @param browserStore [BrowserStore] used to know whether reader view is active for the current tab.
 * @param scope [CoroutineScope] used to keep the item up to date for as long as it can be shown.
 */
class ReaderViewMenuItemProvider(
    browserStore: BrowserStore,
    scope: CoroutineScope,
) : MenuItemProvider {
    override val itemFlow: StateFlow<MenuItem?> =
        browserStore.stateFlow
            .map { it.customizeReaderViewItem() }
            .stateIn(
                scope = scope,
                started = SharingStarted.Eagerly,
                initialValue = browserStore.state.customizeReaderViewItem(),
            )

    /** Customizing the reader view is only offered while the current page is shown in reader view. */
    private fun BrowserState.customizeReaderViewItem() =
        when (selectedTab?.readerState?.active) {
            true -> CUSTOMIZE_READER_VIEW_ITEM
            else -> null
        }

    private companion object {
        val CUSTOMIZE_READER_VIEW_ITEM =
            StandardMenuItem(
                title = Text.Resource(R.string.browser_menu_customize_reader_view_2),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_tool_24),
                onClickEvent = MenuAction.CustomizeReaderView,
            )
    }
}
