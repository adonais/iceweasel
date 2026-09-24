/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.store

import mozilla.components.compose.menu.store.MenuAction.Update
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store

/** MVI [Store] for backing up the state of the menu state and functionality. */
class MenuStore(
    initialState: MenuState = MenuState(emptyList()),
    middleware: List<Middleware<MenuState, MenuAction>> = emptyList(),
) :
    Store<MenuState, MenuAction>(
        initialState = initialState,
        reducer = ::reduce,
        middleware = middleware,
    )

private fun reduce(state: MenuState, action: MenuAction): MenuState =
    when (action) {
        is Update -> state.copy(menuGroups = action.items)
        is MenuEvent -> state
    }
