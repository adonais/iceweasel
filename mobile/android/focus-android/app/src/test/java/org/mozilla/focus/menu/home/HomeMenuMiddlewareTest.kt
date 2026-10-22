/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu.home

import mozilla.components.compose.menu.store.MenuAction
import mozilla.components.compose.menu.store.MenuState
import mozilla.components.compose.menu.store.MenuStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeMenuMiddlewareTest {
    @Test
    fun `WHEN home menu items are tapped THEN handle Help and Settings and dismiss each time`() {
        val handledItems = mutableListOf<HomeMenuItem>()
        var dismissCount = 0
        val store =
            MenuStore(
                initialState = MenuState(homeMenuGroups()),
                middleware = listOf(HomeMenuMiddleware({ handledItems.add(it) }, { dismissCount++ })),
            )
        val items = store.state.menuGroups.flatMap { it.items }

        store.dispatch(items[0].onClickEvent)

        assertEquals(listOf(HomeMenuItem.Help), handledItems)
        assertEquals(1, dismissCount)

        store.dispatch(items[1].onClickEvent)

        assertEquals(listOf(HomeMenuItem.Help, HomeMenuItem.Settings), handledItems)
        assertEquals(2, dismissCount)
    }

    @Test
    fun `WHEN initialized or updated THEN reduce the action without handling a tap or dismissing`() {
        val handledItems = mutableListOf<HomeMenuItem>()
        var dismissCount = 0
        val store = MenuStore(middleware = listOf(HomeMenuMiddleware({ handledItems.add(it) }, { dismissCount++ })))

        assertTrue(handledItems.isEmpty())
        assertEquals(0, dismissCount)

        val groups = homeMenuGroups()
        store.dispatch(MenuAction.Update(groups))

        assertEquals(groups, store.state.menuGroups)
        assertTrue(handledItems.isEmpty())
        assertEquals(0, dismissCount)
    }
}
