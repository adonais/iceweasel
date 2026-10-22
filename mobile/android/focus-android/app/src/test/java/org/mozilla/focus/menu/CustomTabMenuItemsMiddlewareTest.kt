/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.CustomTabConfig
import mozilla.components.browser.state.state.CustomTabMenuItem
import mozilla.components.browser.state.state.createCustomTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.menu.store.MenuAction
import mozilla.components.compose.menu.store.MenuState
import mozilla.components.compose.menu.store.MenuStore
import mozilla.components.support.test.any
import mozilla.components.support.test.argumentCaptor
import mozilla.components.support.test.eq
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CustomTabMenuItemsMiddlewareTest {
    private val pendingIntent: PendingIntent = mock()
    private val callerItem = CustomTabMenuItem(name = "Open in caller", pendingIntent = pendingIntent)
    private val customTab =
        createCustomTab(
            "https://mozilla.org",
            id = "customTab",
            config = CustomTabConfig(menuItems = listOf(callerItem)),
        )

    @Test
    fun `WHEN a caller item is tapped THEN send its intent with the page shown at that moment`() {
        val store = BrowserStore(BrowserState(customTabs = listOf(customTab)))
        var dismissCount = 0
        val menuStore = menuStore(store) { dismissCount++ }

        store.dispatch(ContentAction.UpdateUrlAction(customTab.id, "https://mozilla.org/second"))
        menuStore.dispatch(CustomTabMenuItemTapped(callerItem))

        // Intents are compared by identity, so the one that was sent is inspected instead.
        val intent = argumentCaptor<Intent>()
        verify(pendingIntent).send(eq(testContext), eq(0), intent.capture())

        assertEquals("https://mozilla.org/second".toUri(), intent.value.data)
        assertEquals(1, dismissCount)
    }

    @Test
    fun `GIVEN the custom tab is gone WHEN a caller item is tapped THEN do not send its intent`() {
        val menuStore = menuStore(BrowserStore(BrowserState())) {}

        menuStore.dispatch(CustomTabMenuItemTapped(callerItem))

        verify(pendingIntent, never()).send(any<Context>(), anyInt(), any<Intent>())
    }

    @Test
    fun `WHEN the menu is updated THEN neither send an intent nor dismiss`() {
        var dismissCount = 0
        val menuStore = menuStore(BrowserStore(BrowserState(customTabs = listOf(customTab)))) { dismissCount++ }

        menuStore.dispatch(MenuAction.Update(emptyList()))

        verify(pendingIntent, never()).send(any<Context>(), anyInt(), any<Intent>())
        assertEquals(0, dismissCount)
    }

    private fun menuStore(
        browserStore: BrowserStore,
        onDismiss: () -> Unit,
    ) =
        MenuStore(
            initialState = MenuState(emptyList()),
            middleware =
                listOf(
                    CustomTabMenuItemsMiddleware(
                        context = testContext,
                        browserStore = browserStore,
                        customTabId = customTab.id,
                        onDismiss = onDismiss,
                    )
                ),
        )
}
