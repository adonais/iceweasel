/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
package mozilla.components.compose.menu.data

import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.ui.MenuItemIcon

/**
 * Attribution details for the current menu.
 *
 * @param title The text shown to user so show attribution.
 * @param icon Optional icon to show before [title].
 * @param showAtTop Whether this should be shown at the top or the bottom of the menu.
 */
data class MenuAttribution(
    val title: Text,
    val icon: MenuItemIcon?,
    val showAtTop: Boolean,
)
