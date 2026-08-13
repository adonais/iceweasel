/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bookmarks

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BookmarksStateTest {
    @Test
    fun `WHEN screen is not loading and user is not searching and bookmarks exist THEN user can enter search`() {
        val state = BookmarksState.default.copy(
            bookmarkItems = listOf(
                generateBookmark(1),
            ),
            isLoading = false,
            searchState = null,
        )

        assertTrue(state.canEnterSearch)
    }

    @Test
    fun `WHEN screen is not loading and user is searching and bookmarks exist THEN user cannot enter search`() {
        val state = BookmarksState.default.copy(
            bookmarkItems = listOf(
                generateBookmark(1),
            ),
            isLoading = false,
            searchState = SearchState(),
        )

        assertFalse(state.canEnterSearch)
    }

    @Test
    fun `WHEN screen is loading and user is searching and bookmarks exist THEN user cannot enter search`() {
        val state = BookmarksState.default.copy(
            bookmarkItems = listOf(
                generateBookmark(1),
            ),
            isLoading = true,
            searchState = SearchState(),
        )

        assertFalse(state.canEnterSearch)
    }

    @Test
    fun `WHEN screen is loading and user is not searching and bookmarks exist THEN user cannot enter search`() {
        val state = BookmarksState.default.copy(
            bookmarkItems = listOf(
                generateBookmark(1),
            ),
            isLoading = true,
            searchState = null,
        )

        assertFalse(state.canEnterSearch)
    }

    @Test
    fun `WHEN screen is loading and user is not searching and bookmarks do not exist THEN user cannot enter search`() {
        val state = BookmarksState.default.copy(
            bookmarkItems = listOf(),
            isLoading = true,
            searchState = null,
        )

        assertFalse(state.canEnterSearch)
    }

    @Test
    fun `WHEN screen is loading and user is searching and bookmarks do not exist THEN user cannot enter search`() {
        val state = BookmarksState.default.copy(
            bookmarkItems = listOf(),
            isLoading = true,
            searchState = SearchState(),
        )

        assertFalse(state.canEnterSearch)
    }

    @Test
    fun `WHEN screen is not loading and user is searching and bookmarks do not exist THEN user cannot enter search`() {
        val state = BookmarksState.default.copy(
            bookmarkItems = listOf(),
            isLoading = false,
            searchState = SearchState(),
        )

        assertFalse(state.canEnterSearch)
    }

    @Test
    fun `WHEN screen is not loading and user is not searching and bookmarks do not exist THEN user cannot enter search`() {
        val state = BookmarksState.default.copy(
            bookmarkItems = listOf(),
            isLoading = false,
            searchState = null,
        )

        assertFalse(state.canEnterSearch)
    }

    private fun generateBookmark(
        num: Int = 0,
        url: String = "url",
        title: String = "title",
        previewImageUrl: String = "previewImageUrl",
        dateAdded: Long = 0,
        position: UInt? = null,
    ) = BookmarkItem.Bookmark(url, title, previewImageUrl, "$num", position, dateAdded)
}
