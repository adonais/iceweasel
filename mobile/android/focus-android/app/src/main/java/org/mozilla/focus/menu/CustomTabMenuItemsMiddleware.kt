/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu

import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
import mozilla.components.browser.state.selector.findCustomTab
import mozilla.components.browser.state.state.CustomTabMenuItem
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.menu.store.MenuAction
import mozilla.components.compose.menu.store.MenuEvent
import mozilla.components.compose.menu.store.MenuState
import mozilla.components.compose.menu.store.MenuStore
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store

/**
 * [MenuEvent] dispatched when the user taps a menu item provided by the application which opened the custom tab.
 *
 * @property item The [CustomTabMenuItem] the user tapped.
 */
data class CustomTabMenuItemTapped(val item: CustomTabMenuItem) : MenuEvent

/**
 * [MenuStore] middleware informing the application which opened a custom tab about the user tapping one of the menu
 * items it provided, closing the menu afterwards.
 *
 * The current page is sent along with the intent, which may have changed since the menu was built.
 */
class CustomTabMenuItemsMiddleware(
    private val context: Context,
    private val browserStore: BrowserStore,
    private val customTabId: String,
    private val onDismiss: () -> Unit,
) : Middleware<MenuState, MenuAction> {

    override fun invoke(
        store: Store<MenuState, MenuAction>,
        next: (MenuAction) -> Unit,
        action: MenuAction,
    ) {
        if (action is CustomTabMenuItemTapped) {
            sendPendingIntent(action.item)
            onDismiss()
        }

        next(action)
    }

    private fun sendPendingIntent(item: CustomTabMenuItem) {
        val url = browserStore.state.findCustomTab(customTabId)?.content?.url ?: return

        item.pendingIntent.send(context, 0, Intent(null, url.toUri()))
    }
}
