/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu

import kotlinx.coroutines.flow.StateFlow
import mozilla.components.compose.menu.data.MenuItem

/**
 * Provides the configuration of one menu item, owned by the feature that item belongs to.
 *
 * This is meant to be used with [BrowserMenuBuilder] which knows which items exist and in what order to show them while
 * the details for each menu item - what it looks like in each state, and where that state comes from - stay with the
 * code that owns the feature that the menu item relates to.
 */
interface MenuItemProvider {
    /**
     * The item to show, or `null` while it should not be shown at all.
     *
     * Being a [StateFlow] this always has a value for the menu to be assembled from, and offers a new one only when the
     * item actually changed, so that the menu is not needlessly reassembled.
     *
     * A provider that cannot know everything about its item right away - because that means waiting on disk or on the
     * network - should return a default item immediately and offer a new item once it knows more.
     */
    val itemFlow: StateFlow<MenuItem?>
}
