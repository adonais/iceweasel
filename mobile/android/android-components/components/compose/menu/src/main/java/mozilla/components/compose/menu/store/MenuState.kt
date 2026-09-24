/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.store

import mozilla.components.compose.menu.data.MenuItemsGroup
import mozilla.components.lib.state.State

/**
 * The state of the menu.
 *
 * @property menuGroups The list of menu groups shown in the menu.
 */
data class MenuState(val menuGroups: List<MenuItemsGroup>) : State
