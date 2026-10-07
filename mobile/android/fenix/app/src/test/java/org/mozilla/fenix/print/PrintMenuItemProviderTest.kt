/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.print

import kotlin.test.assertEquals
import kotlin.test.assertNull
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction

class PrintMenuItemProviderTest {
    @Test
    fun `GIVEN the app runs on Android Automotive WHEN building the menu item THEN return null`() {
        assertNull(PrintMenuItemProvider(isAndroidAutomotiveAvailable = true).itemFlow.value)
    }

    @Test
    fun `GIVEN a non Automotive device WHEN building the menu item THEN return a properly configured menu button`() {
        assertEquals(
            StandardMenuItem(
                title = Text.Resource(R.string.browser_menu_print_2),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_print_24),
                onClickEvent = MenuAction.PrintRequested,
            ),
            PrintMenuItemProvider(isAndroidAutomotiveAvailable = false).itemFlow.value,
        )
    }
}
