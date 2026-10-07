/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser

import kotlin.test.assertEquals
import kotlinx.coroutines.test.runTest
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction

class ShareMenuItemProviderTest {
    @Test
    fun `WHEN building the share menu item THEN return correct configuration`() = runTest {
        val provider = ShareMenuItemProvider()

        assertEquals(
            StandardMenuItem(
                title = Text.Resource(R.string.browser_menu_share),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_share_android_24),
                onClickEvent = MenuAction.Navigate.Share,
            ),
            provider.itemFlow.value,
        )
    }
}
