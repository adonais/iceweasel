/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu.middleware

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import mozilla.components.compose.menu.store.MenuAction
import mozilla.components.compose.menu.store.MenuAction.Init
import mozilla.components.compose.menu.store.MenuAction.Update
import mozilla.components.compose.menu.store.MenuEvent
import mozilla.components.compose.menu.store.MenuState
import mozilla.components.compose.menu.store.MenuStore
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.components.menu.MenuBuilder
import org.mozilla.fenix.components.menu.MenuItemEventRouter

/**
 * [MenuStore] middleware keeping the menu up to date and letting the providers of its items handle all user
 * interactions with them.
 *
 * @param menuBuilder [MenuBuilder] providing the menu to show, kept up to date.
 * @param eventRouter [MenuItemEventRouter] for handling interactions with the menu items shown.
 * @param scope [CoroutineScope] tied to the lifetime of the menu, on which to keep it up to date.
 */
class MenuMiddleware(
    private val menuBuilder: MenuBuilder,
    private val eventRouter: MenuItemEventRouter,
    private val scope: CoroutineScope,
) : Middleware<MenuState, MenuAction> {
    private val logger = Logger("MenuMiddleware")

    override fun invoke(
        store: Store<MenuState, MenuAction>,
        next: (MenuAction) -> Unit,
        action: MenuAction,
    ) {
        when (action) {
            is Init -> observeMenuStructureUpdates(store)
            is MenuEvent -> if (!eventRouter.route(action)) logger.warn("No menu item handles $action")
            else -> Unit
        }

        next(action)
    }

    private fun observeMenuStructureUpdates(store: Store<MenuState, MenuAction>) = scope.launch {
        menuBuilder.menuStructure.collect { store.dispatch(Update(it)) }
    }
}
