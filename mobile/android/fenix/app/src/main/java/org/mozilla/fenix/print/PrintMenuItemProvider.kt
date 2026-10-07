/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.print

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.MenuItemProvider
import org.mozilla.fenix.components.menu.store.MenuAction

/**
 * [MenuItemProvider] for the menu item allowing to print the current webpage
 *
 * @param isAndroidAutomotiveAvailable Whether the device is running on Android Automotive.
 */
class PrintMenuItemProvider(isAndroidAutomotiveAvailable: Boolean) : MenuItemProvider {
    override val itemFlow: StateFlow<MenuItem?> =
        MutableStateFlow(
            if (isAndroidAutomotiveAvailable) {
                null
            } else {
                StandardMenuItem(
                    title = Text.Resource(R.string.browser_menu_print_2),
                    icon = MenuItemIconRes(iconsR.drawable.mozac_ic_print_24),
                    onClickEvent = MenuAction.PrintRequested,
                )
            }
        )
}
