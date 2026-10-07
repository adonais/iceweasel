/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu

import mozilla.components.compose.menu.data.ExpandableMenuItem
import mozilla.components.compose.menu.data.StandardMenuItem

/**
 * [MenuItemProvider] of a menu item that expands to show others, which every item configured to do so must have.
 *
 * What it expands to is not known by the provider - the menu configuration decides that, and each of those items is
 * configured by a provider of its own - so they are only brought together once the menu is assembled.
 */
interface ExpandableMenuItemProvider : MenuItemProvider {
    /**
     * The item to show expanding to [subMenuItems], or `null` to not show it at all.
     *
     * Only worth overriding to configure the item based on what it ended up expanding to, like drawing attention to it
     * on behalf of one of those items.
     *
     * @param item The header captured alongside the children in the menu builder's snapshot.
     * @param subMenuItems The items to show when this one is expanded, as their own providers currently offer them.
     */
    fun updateWithSubMenuItems(
        item: ExpandableMenuItem,
        subMenuItems: List<StandardMenuItem>,
    ): ExpandableMenuItem? = item.copy(subMenuItems = subMenuItems)
}
