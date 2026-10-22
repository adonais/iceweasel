/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu.home

import mozilla.components.compose.menu.store.MenuAction
import mozilla.components.compose.menu.store.MenuEvent
import mozilla.components.compose.menu.store.MenuState
import mozilla.components.compose.menu.store.MenuStore
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store

/**
 * [MenuEvent] dispatched when the user taps an item of the start/home screen menu.
 *
 * @property item The [HomeMenuItem] the user tapped.
 */
data class HomeMenuItemTapped(val item: HomeMenuItem) : MenuEvent

/**
 * [MenuStore] middleware handling the user interactions with the start/home screen menu, closing the menu afterwards.
 */
class HomeMenuMiddleware(
    private val onItemTapped: (HomeMenuItem) -> Unit,
    private val onDismiss: () -> Unit,
) : Middleware<MenuState, MenuAction> {

    override fun invoke(
        store: Store<MenuState, MenuAction>,
        next: (MenuAction) -> Unit,
        action: MenuAction,
    ) {
        if (action is HomeMenuItemTapped) {
            onItemTapped(action.item)
            onDismiss()
        }

        next(action)
    }
}
