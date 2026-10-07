/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bookmarks

import io.mockk.coEvery
import io.mockk.mockk
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.concept.storage.BookmarkNode
import mozilla.components.concept.storage.BookmarkNodeType
import mozilla.components.concept.storage.BookmarksStorage
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction

class BookmarkMenuItemProviderTest {
    @Test
    fun `GIVEN the current page is not bookmarked WHEN providing the item THEN offer bookmarking it`() = runTest {
        val provider = provider(bookmarksStorage = storageWith(bookmark = null))

        assertEquals(addBookmarkItem, provider.itemFlow.value)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun `GIVEN the current page is bookmarked WHEN providing the item THEN offer editing that bookmark`() = runTest {
        val provider = provider(bookmarksStorage = storageWith(bookmark = bookmark))

        // Bookmarking the page is offered before reading from disk, editing the bookmark once it is known.
        assertEquals(addBookmarkItem, provider.itemFlow.value)

        runCurrent()

        assertEquals(editBookmarkItem, provider.itemFlow.value)
    }

    @Test
    fun `GIVEN there is no page shown WHEN providing the item THEN don't offer bookmarking`() = runTest {
        val provider = provider(browserStore = BrowserStore(), bookmarksStorage = storageWith(bookmark = null))

        assertNull(provider.itemFlow.value)
    }

    private fun TestScope.provider(
        browserStore: BrowserStore = browserStoreWithSelectedTab(),
        bookmarksStorage: BookmarksStorage,
    ) =
        BookmarkMenuItemProvider(
            browserStore = browserStore,
            bookmarksStorage = bookmarksStorage,
            // The bookmarks are read on this scope, which runTest runs and then cancels.
            applicationScope = this,
        )

    private fun storageWith(bookmark: BookmarkNode?): BookmarksStorage = mockk {
        coEvery { getBookmarksWithUrl(any()) } returns Result.success(listOfNotNull(bookmark))
    }

    private fun browserStoreWithSelectedTab() =
        BrowserStore(
            BrowserState(
                tabs = listOf(createTab(url = TEST_URL, title = TEST_TITLE, id = TAB_ID)),
                selectedTabId = TAB_ID,
            )
        )

    private companion object {
        const val TEST_URL = "https://mozilla.org"
        const val TEST_TITLE = "Mozilla"
        const val TAB_ID = "tab1"
        const val BOOKMARK_GUID = "bookmarkGuid"

        val bookmark =
            BookmarkNode(
                type = BookmarkNodeType.ITEM,
                guid = BOOKMARK_GUID,
                parentGuid = null,
                position = null,
                title = TEST_TITLE,
                url = TEST_URL,
                dateAdded = 0,
                lastModified = 0,
                children = null,
            )

        val addBookmarkItem =
            StandardMenuItem(
                title = Text.Resource(R.string.browser_menu_bookmark_this_page_2),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_bookmark_24),
                onClickEvent = MenuAction.AddBookmark,
            )

        val editBookmarkItem =
            StandardMenuItem(
                title = Text.Resource(R.string.browser_menu_edit_bookmark),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_bookmark_fill_24),
                onClickEvent = MenuAction.Navigate.EditBookmark(guidToEdit = BOOKMARK_GUID),
                state = MenuItemState.ACTIVE,
            )
    }
}
