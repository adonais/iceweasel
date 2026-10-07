/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.MenuItemProvider
import org.mozilla.fenix.components.menu.store.MenuAction
import org.mozilla.fenix.ext.canGoBackInHistoryOrToStories

/**
 * [MenuItemProvider] for the menu item allowing to navigate back.
 *
 * @param browserStore [BrowserStore] used to know if the current page can navigate back.
 * @param scope [CoroutineScope] used to keep the item up to date for as long as it can be shown.
 */
class BackMenuItemProvider(
    browserStore: BrowserStore,
    scope: CoroutineScope,
) : MenuItemProvider {
    override val itemFlow: StateFlow<MenuItem?> =
        browserStore.stateFlow
            .map { state ->
                state.canGoBackInHistoryOrToStories()
            }
            .map { it.toMenuItem() }
            .stateIn(
                scope = scope,
                started = SharingStarted.Eagerly,
                initialValue = browserStore.state.canGoBackInHistoryOrToStories().toMenuItem(),
            )
}

private fun Boolean.toMenuItem(): MenuItem {
    val state = if (this) MenuItemState.DEFAULT else MenuItemState.DISABLED

    return StandardMenuItem(
        title = Text.Resource(R.string.browser_menu_back),
        icon = MenuItemIconRes(iconsR.drawable.mozac_ic_back_24),
        onClickEvent = MenuAction.Navigate.Back(viewHistory = false),
        onLongClickEvent = MenuAction.Navigate.Back(viewHistory = true),
        state = state,
    )
}
