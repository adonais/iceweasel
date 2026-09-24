/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.store

import mozilla.components.compose.menu.data.MenuItemsGroup
import mozilla.components.lib.state.Action

/**
 * [Action]s for updating the [MenuState] via [MenuStore].
 *
 * Menu items dispatch their own [MenuInteraction.MenuEvent]s here, which the application observes to react to the user
 * interacting with the menu.
 */
sealed interface MenuAction : Action {

    /** Update the menu items that should be shown. */
    data class Update(val items: List<MenuItemsGroup>) : MenuAction
}
