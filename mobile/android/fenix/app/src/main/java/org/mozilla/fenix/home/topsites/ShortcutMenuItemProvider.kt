/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import mozilla.components.browser.state.ext.getUrl
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.feature.top.sites.PinnedSiteStorage
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.MenuItemProvider
import org.mozilla.fenix.components.menu.store.MenuAction

/**
 * [MenuItemProvider] for the menu item allowing to add or remove the current webpage from home shortcuts.
 *
 * @param browserStore [BrowserStore] used to know which page the item is about.
 * @param pinnedSiteStorage [PinnedSiteStorage] used to check whether that page already is a shortcut.
 * @param areShortcutsEnabled Whether the user allows shortcuts to be shown at all.
 * @param scope [CoroutineScope] tied to the lifetime of the menu, on which to query the shortcuts.
 */
class ShortcutMenuItemProvider(
    private val browserStore: BrowserStore,
    private val pinnedSiteStorage: PinnedSiteStorage,
    areShortcutsEnabled: Boolean,
    scope: CoroutineScope,
) : MenuItemProvider {
    // Without a page shown there is nothing to add to shortcuts. Knowing whether the shown page already is one means
    // reading from disk, which the menu should not wait for, so it starts out offered as not being a shortcut.
    private val mutableItem =
        MutableStateFlow<MenuItem?>(
            ADD_SHORTCUT_ITEM.takeIf { areShortcutsEnabled && browserStore.state.selectedTab != null }
        )

    override val itemFlow: StateFlow<MenuItem?> = mutableItem.asStateFlow()

    init {
        if (mutableItem.value != null) {
            scope.launch { resolveShortcut() }
        }
    }

    private suspend fun resolveShortcut() {
        val url = browserStore.state.selectedTab?.getUrl() ?: return
        pinnedSiteStorage.getPinnedSites().firstOrNull { it.url == url } ?: return

        mutableItem.value = REMOVE_SHORTCUT_ITEM
    }
}

private val ADD_SHORTCUT_ITEM =
    StandardMenuItem(
        title = Text.Resource(R.string.browser_menu_add_to_shortcuts),
        icon = MenuItemIconRes(iconsR.drawable.mozac_ic_pin_24),
        onClickEvent = MenuAction.AddShortcut,
    )

private val REMOVE_SHORTCUT_ITEM =
    StandardMenuItem(
        title = Text.Resource(R.string.browser_menu_remove_from_shortcuts),
        icon = MenuItemIconRes(iconsR.drawable.mozac_ic_pin_fill_24),
        onClickEvent = MenuAction.RemoveShortcut,
        state = MenuItemState.ACTIVE,
    )
