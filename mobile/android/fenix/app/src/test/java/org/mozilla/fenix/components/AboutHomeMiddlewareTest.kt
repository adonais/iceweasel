/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.utils.ABOUT_HOME_URL
import mozilla.components.support.test.ext.joinBlocking
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AboutHomeMiddlewareTest {
    private lateinit var middleware: AboutHomeMiddleware
    private lateinit var captureActionsMiddleware: CaptureActionsMiddleware<BrowserState, BrowserAction>

    private val homepageTitle = "Mozilla Firefox"

    @Before
    fun setup() {
        captureActionsMiddleware = CaptureActionsMiddleware()
        middleware = AboutHomeMiddleware(
            homepageTitle = homepageTitle,
        )
    }

    @Test
    fun `GIVEN ABOUT_HOME tab WHEN update title action is dispatched THEN intercept the action and update the title`() {
        val tab = createTab(url = ABOUT_HOME_URL, id = "test-tab1")
        val store = createStore(
            initialState = BrowserState(tabs = listOf(tab)),
        )

        store.dispatch(
            ContentAction.UpdateTitleAction(sessionId = tab.id, title = ""),
        ).joinBlocking()

        assertEquals(
            homepageTitle,
            captureActionsMiddleware.findLastAction(ContentAction.UpdateTitleAction::class).title,
        )
    }

    @Test
    fun `GIVEN a URL that is not WHEN update title action is dispatched THEN let the action pass through`() {
        val tab = createTab("https://www.mozilla.org", id = "test-tab1")
        val store = createStore(
            initialState = BrowserState(tabs = listOf(tab)),
        )
        val title = "Mozilla"

        store.dispatch(
            ContentAction.UpdateTitleAction(sessionId = tab.id, title = title),
        ).joinBlocking()

        assertEquals(
            title,
            captureActionsMiddleware.findLastAction(ContentAction.UpdateTitleAction::class).title,
        )
    }

    private fun createStore(
        initialState: BrowserState = BrowserState(),
    ) = BrowserStore(
        initialState = initialState,
        middleware = listOf(middleware, captureActionsMiddleware),
    )
}
