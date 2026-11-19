/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.customtabs

import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import mozilla.components.browser.state.state.CustomTabMenuItem
import mozilla.components.browser.state.state.CustomTabSessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.MenuItemTitle
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.store.MenuEvent
import org.mozilla.fenix.components.menu.MenuHost
import org.mozilla.fenix.components.menu.MenuItemProvider
import org.mozilla.fenix.components.menu.MenuTarget

/**
 * [MenuItemProvider] for the menu items added by the app that opened the current custom tab.
 *
 * @param browserStore [BrowserStore] allowing to integrate with the current open tabs.
 * @param target [MenuTarget] for which these menu items would be shown for.
 * @param context [Context] used to send that app the current page when one of its menu items is clicked.
 */
class CustomTabAppMenuItemProvider(
    browserStore: BrowserStore,
    target: MenuTarget,
    private val context: Context,
) : MenuItemProvider {
    private val customTab = target.browserSessionFrom(browserStore.state) as? CustomTabSessionState

    override val itemsFlow: StateFlow<List<MenuItem>> =
        MutableStateFlow(
            customTab?.config?.menuItems.orEmpty().map {
                StandardMenuItem(
                    title = MenuItemTitle(Text.String(it.name)),
                    onClickEvent = AppMenuItemClicked(it),
                )
            }
        )

    override fun handles(event: MenuEvent) = event is AppMenuItemClicked

    override fun onEvent(event: MenuEvent, menu: MenuHost) {
        val appMenuItem = (event as? AppMenuItemClicked)?.appMenuItem ?: return
        val url = customTab?.content?.url ?: return
        appMenuItem.pendingIntent.send(context, 0, Intent(null, url.toUri()))
        menu.dismiss()
    }
}

/** [MenuEvent] for when [appMenuItem], added by the app that opened the current custom tab, is clicked. */
private data class AppMenuItemClicked(val appMenuItem: CustomTabMenuItem) : MenuEvent
