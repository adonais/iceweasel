/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object BookmarksSelectors {
    val TOOLBAR_TITLE = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = "Bookmarks",
        description = "Bookmarks Toolbar Title",
        groups = listOf("requiredForPage"),
    )

    val OPEN_IN_NEW_TAB_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = getStringResource(R.string.bookmark_menu_open_in_new_tab_button),
        description = "Open in new tab bookmarks three dot menu button",
        groups = listOf("bookmarksThreeDotMenu"),
    )

    val NAVIGATE_UP_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
        value = getStringResource(R.string.bookmark_navigate_back_button_content_description),
        description = "Bookmark edit navigate up button",
        groups = listOf("bookmarkEdit"),
    )

    val EDIT_TITLE_FIELD = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TAG,
        value = "edit.bookmark.item.title.text.field",
        description = "Bookmark edit title field",
        groups = listOf("bookmarkEdit"),
    )

    val EDIT_URL_FIELD = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TAG,
        value = "edit.bookmark.item.url.text.field",
        description = "Bookmark edit URL field",
        groups = listOf("bookmarkEdit"),
    )

    val DELETE_BOOKMARK_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
        value = getStringResource(R.string.bookmark_delete_bookmark_content_description),
        description = "Delete bookmark button",
        groups = listOf("bookmarkEdit"),
    )

    val BOOKMARK_TITLE_TEXT = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = "Bookmark title",
        description = "Bookmark title text",
        groups = listOf(),
    )

    val all = listOf(
        TOOLBAR_TITLE,
        OPEN_IN_NEW_TAB_BUTTON,
        NAVIGATE_UP_BUTTON,
        EDIT_TITLE_FIELD,
        EDIT_URL_FIELD,
        DELETE_BOOKMARK_BUTTON,
        BOOKMARK_TITLE_TEXT,
    )
}
