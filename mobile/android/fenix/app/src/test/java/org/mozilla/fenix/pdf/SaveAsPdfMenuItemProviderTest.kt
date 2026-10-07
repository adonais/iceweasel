/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf

import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.ui.icons.R as iconsR
import org.junit.Assert.assertEquals
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction

class SaveAsPdfMenuItemProviderTest {
    @Test
    fun `WHEN building the menu item THEN returned a properly configured one`() {
        val provider = SaveAsPdfMenuItemProvider()
        val expectedItem =
            StandardMenuItem(
                title = Text.Resource(R.string.browser_menu_save_as_pdf_2),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_save_file_24),
                onClickEvent = MenuAction.SaveAsPdfRequested,
            )

        val item = provider.itemFlow.value

        assertEquals(expectedItem, item)
    }
}
