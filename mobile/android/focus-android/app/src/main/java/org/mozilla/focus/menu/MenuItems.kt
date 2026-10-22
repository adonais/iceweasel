/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu

import kotlinx.coroutines.flow.Flow
import mozilla.components.compose.menu.data.MenuItemsGroup

/** The items of a menu, for whichever screen it is shown on. */
interface MenuItems {
    /** The groups of items to show, re-emitted whenever any of them changes. */
    val menuGroups: Flow<List<MenuItemsGroup>>

    /** The groups of items to show, for the current state of the browser. */
    fun currentMenuGroups(): List<MenuItemsGroup>
}
