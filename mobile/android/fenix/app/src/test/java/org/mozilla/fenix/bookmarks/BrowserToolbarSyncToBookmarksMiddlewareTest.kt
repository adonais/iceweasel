/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bookmarks

import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.ToggleEditMode
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarState
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.compose.browser.toolbar.store.Mode
import mozilla.components.support.test.rule.MainCoroutineRule
import mozilla.components.support.test.rule.runTestOnMain
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BrowserToolbarSyncToBookmarksMiddlewareTest {
    @get:Rule
    val mainCoroutineRule = MainCoroutineRule()

    @Test
    fun `GIVEN in the process of searching in bookmarks WHEN the toolbar exits search mode THEN the search is dismissed`() = runTestOnMain {
        val toolbarStore = BrowserToolbarStore(BrowserToolbarState(Mode.EDIT))
        val middleware = BrowserToolbarSyncToBookmarksMiddleware(toolbarStore, backgroundScope)
        val bookmarksStore = BookmarksStore(
            initialState = BookmarksState.default.copy(isSearching = true),
            middleware = listOf(middleware),
        )

        toolbarStore.dispatch(ToggleEditMode(false))

        assertFalse(bookmarksStore.state.isSearching)
    }

    @Test
    fun `GIVEN not in the process of searching in bookmarks WHEN the toolbar exits search mode THEN the search mode is not changed`() = runTestOnMain {
        val toolbarStore = BrowserToolbarStore(BrowserToolbarState(Mode.EDIT))
        val middleware = BrowserToolbarSyncToBookmarksMiddleware(toolbarStore, backgroundScope)
        val bookmarksStore = BookmarksStore(
            initialState = BookmarksState.default.copy(isSearching = false),
            middleware = listOf(middleware),
        )

        toolbarStore.dispatch(ToggleEditMode(false))

        assertFalse(bookmarksStore.state.isSearching)
    }

    @Test
    fun `GIVEN not in the process of searching in bookmarks WHEN the toolbar enters search mode THEN the search mode is not changed`() = runTestOnMain {
        val toolbarStore = BrowserToolbarStore(BrowserToolbarState(Mode.DISPLAY))
        val middleware = BrowserToolbarSyncToBookmarksMiddleware(toolbarStore, backgroundScope)
        val bookmarksStore = BookmarksStore(
            initialState = BookmarksState.default.copy(isSearching = false),
            middleware = listOf(middleware),
        )

        toolbarStore.dispatch(ToggleEditMode(true))

        assertFalse(bookmarksStore.state.isSearching)
    }
}
