/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu.home

import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItemsGroup
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.focus.R

private const val HOME_GROUP_ID = "home"

/** The items to show in the menu of the start/home screen, none of which depend on the state of the application. */
fun homeMenuGroups(): List<MenuItemsGroup> {
    val help =
        StandardMenuItem(
            title = Text.Resource(R.string.menu_help),
            icon = MenuItemIconRes(iconsR.drawable.mozac_ic_help_circle_24),
            onClickEvent = HomeMenuItemTapped(HomeMenuItem.Help),
        )

    val settings =
        StandardMenuItem(
            title = Text.Resource(R.string.menu_settings),
            icon = MenuItemIconRes(iconsR.drawable.mozac_ic_settings_24),
            onClickEvent = HomeMenuItemTapped(HomeMenuItem.Settings),
        )

    return listOf(MenuItemsGroup.Row(HOME_GROUP_ID, listOf(help, settings)))
}
