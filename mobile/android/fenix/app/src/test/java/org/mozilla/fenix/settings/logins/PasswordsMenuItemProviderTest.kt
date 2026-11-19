/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.logins

import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItemTitle
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.MenuFragmentDirections
import org.mozilla.fenix.components.menu.MenuTarget
import org.mozilla.fenix.components.menu.fake.FakeMenuHost
import org.mozilla.fenix.components.menu.fake.reachableEvents
import org.mozilla.fenix.components.menu.store.MenuAction

class PasswordsMenuItemProviderTest {
    @Test
    fun `GIVEN autofill is supported WHEN building the menu item THEN provide the item for opening the saved passwords`() {
        val provider = PasswordsMenuItemProvider(isAutofillSupported = true, target = MenuTarget.BrowserTab)

        assertEquals(
            StandardMenuItem(
                title = MenuItemTitle(Text.Resource(R.string.browser_menu_passwords)),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_login_24),
                onClickEvent = MenuAction.Navigate.Passwords,
            ),
            provider.itemsFlow.value.single(),
        )
    }

    @Test
    fun `GIVEN target is CustomizeMenu WHEN building the menu item THEN provide item without click event`() {
        val provider = PasswordsMenuItemProvider(isAutofillSupported = false, target = MenuTarget.CustomizeMenu)

        assertEquals(
            StandardMenuItem(
                title = MenuItemTitle(Text.Resource(R.string.browser_menu_passwords)),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_login_24),
                onClickEvent = null,
                state = MenuItemState.DEFAULT,
            ),
            provider.itemsFlow.value.single(),
        )
    }

    @Test
    fun `GIVEN autofill is not supported WHEN building the menu item THEN hide it`() {
        val provider = PasswordsMenuItemProvider(isAutofillSupported = false, target = MenuTarget.BrowserTab)

        assertTrue(provider.itemsFlow.value.isEmpty())
    }

    @Test
    fun `WHEN clicking the item THEN show the saved passwords in place of the menu`() {
        val menu = FakeMenuHost()

        PasswordsMenuItemProvider(isAutofillSupported = true, target = MenuTarget.BrowserTab)
            .onEvent(MenuAction.Navigate.Passwords, menu)

        assertEquals(MenuFragmentDirections.actionMenuFragmentToLoginsListFragment(), menu.directions)
    }

    @Test
    fun `WHEN building the item THEN handle all events it can dispatch and no others`() {
        val provider = PasswordsMenuItemProvider(isAutofillSupported = true, target = MenuTarget.BrowserTab)

        val events = provider.itemsFlow.value.single().reachableEvents()

        assertTrue(events.all { provider.handles(it) }, "Not all of $events are handled")
        assertFalse(provider.handles(MenuAction.Navigate.Settings))
    }
}
