/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.ui

/**
 * The current state of an individual menu item and it's children.
 *
 * @see DEFAULT,
 * @see ACTIVE,
 * @see DISABLED,
 * @see WARNING
 */
enum class MenuItemState {

    /** The default state. */
    DEFAULT,

    /** The current item is active / selected. */
    ACTIVE,

    /** The current item is disabled. */
    DISABLED,

    /** The current item has a warning that requires user's attention. */
    WARNING,
}
