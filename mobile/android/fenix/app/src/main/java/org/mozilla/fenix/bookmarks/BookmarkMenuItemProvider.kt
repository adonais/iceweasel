/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bookmarks

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import mozilla.components.browser.state.ext.getUrl
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.concept.storage.BookmarksStorage
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.MenuItemProvider
import org.mozilla.fenix.components.menu.store.MenuAction

/**
 * [MenuItemProvider] for the menu item allowing to bookmark the current page, or to edit the bookmark it already has.
 *
 * @param browserStore [BrowserStore] used to know which page the item is about.
 * @param bookmarksStorage [BookmarksStorage] used to check whether that page is already bookmarked.
 * @param applicationScope [CoroutineScope] tied to the lifetime of the application, on which to query the bookmarks.
 */
class BookmarkMenuItemProvider(
    private val browserStore: BrowserStore,
    private val bookmarksStorage: BookmarksStorage,
    applicationScope: CoroutineScope,
) : MenuItemProvider {
    // Without a page shown there is nothing to bookmark. Knowing whether the shown page already is bookmarked means
    // reading from disk, which the menu should not wait for, so it starts out offered as not bookmarked.
    private val mutableItem =
        MutableStateFlow<MenuItem?>(ADD_BOOKMARK_ITEM.takeIf { browserStore.state.selectedTab != null })

    override val itemFlow: StateFlow<MenuItem?> = mutableItem.asStateFlow()

    init {
        // BookmarksStorage#getBookmarksWithUrl will run until completion even if the coroutine is canceled, so it is
        // deliberately run on a scope outliving this menu. This provider can be kept alive by it for that long since
        // everything it holds is itself tied to the lifetime of the application.
        applicationScope.launch { resolveBookmark() }
    }

    private suspend fun resolveBookmark() {
        val url = browserStore.state.selectedTab?.getUrl() ?: return
        val guidToEdit =
            bookmarksStorage.getBookmarksWithUrl(url).getOrDefault(emptyList()).firstOrNull { it.url == url }?.guid
                ?: return

        mutableItem.value = editBookmarkItem(guidToEdit)
    }
}

private val ADD_BOOKMARK_ITEM =
    StandardMenuItem(
        title = Text.Resource(R.string.browser_menu_bookmark_this_page_2),
        icon = MenuItemIconRes(iconsR.drawable.mozac_ic_bookmark_24),
        onClickEvent = MenuAction.AddBookmark,
    )

private fun editBookmarkItem(guidToEdit: String) =
    StandardMenuItem(
        title = Text.Resource(R.string.browser_menu_edit_bookmark),
        icon = MenuItemIconRes(iconsR.drawable.mozac_ic_bookmark_fill_24),
        onClickEvent = MenuAction.Navigate.EditBookmark(guidToEdit = guidToEdit),
        state = MenuItemState.ACTIVE,
    )
