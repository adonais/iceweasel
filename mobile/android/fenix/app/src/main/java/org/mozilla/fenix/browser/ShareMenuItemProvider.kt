/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser

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

/** [MenuItemProvider] for the menu item allowing to share the current page. */
class ShareMenuItemProvider : MenuItemProvider {
    override val itemFlow: StateFlow<MenuItem?> =
        MutableStateFlow(
            StandardMenuItem(
                title = Text.Resource(R.string.browser_menu_share),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_share_android_24),
                onClickEvent = MenuAction.Navigate.Share,
            )
        )
}
