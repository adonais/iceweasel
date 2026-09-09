/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.search

import android.content.Context
import io.mockk.mockk
import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.InitAction
import mozilla.components.browser.state.action.SearchAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.lib.state.Store
import org.junit.Assert.assertEquals
import org.junit.Test

class SearchWidgetMiddlewareTest {

    private val context: Context = mockk(relaxed = true)
    private val store: Store<BrowserState, BrowserAction> = mockk(relaxed = true)

    @Test
    fun `GIVEN the middleware WHEN a SelectSearchEngineAction is received THEN the widget is refreshed`() {
        var updateCount = 0
        val middleware = SearchWidgetMiddleware(context) { updateCount++ }

        middleware.invoke(
            store,
            { _ -> },
            SearchAction.SelectSearchEngineAction("engine-id", "Google"),
        )

        assertEquals(1, updateCount)
    }

    @Test
    fun `GIVEN the middleware WHEN a private engine is selected THEN the widget is not refreshed`() {
        var updateCount = 0
        val middleware = SearchWidgetMiddleware(context) { updateCount++ }

        middleware.invoke(
            store,
            { _ -> },
            SearchAction.SelectPrivateSearchEngineAction("engine-id", "Google"),
        )

        assertEquals(0, updateCount)
    }

    @Test
    fun `GIVEN the middleware WHEN an unrelated action is received THEN the widget is not refreshed`() {
        var updateCount = 0
        val middleware = SearchWidgetMiddleware(context) { updateCount++ }

        middleware.invoke(store, { _ -> }, InitAction)

        assertEquals(0, updateCount)
    }

    @Test
    fun `GIVEN the middleware WHEN any action is received THEN it is passed to the next middleware`() {
        val middleware = SearchWidgetMiddleware(context) {}
        var forwarded: BrowserAction? = null

        val action = SearchAction.SelectSearchEngineAction("engine-id", "Google")
        middleware.invoke(store, { forwarded = it }, action)

        assertEquals(action, forwarded)
    }
}
