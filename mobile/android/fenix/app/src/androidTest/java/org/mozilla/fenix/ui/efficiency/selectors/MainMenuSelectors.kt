/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.helpers.TestHelper.appName
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object MainMenuSelectors {

    val NEW_PRIVATE_TAB_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = getStringResource(R.string.browser_menu_new_private_tab),
        description = "Main menu New private tab button",
        // Removed in https://bugzilla.mozilla.org/show_bug.cgi?id=1966222 as part of the menu redesign effort
        groups = listOf("removedIn=141"),
    )

    val EXTENSIONS_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = getStringResource(R.string.browser_menu_extensions),
        description = "Main menu Extensions button",
        groups = listOf("requiredForPage"),
    )

    val BOOKMARKS_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = getStringResource(R.string.library_bookmarks),
        description = "Main menu Bookmarks button",
        groups = listOf("requiredForPage"),
    )

    val HISTORY_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = getStringResource(R.string.library_history),
        description = "Main menu History button",
        groups = listOf("requiredForPage"),
    )

    val DOWLOADS_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = getStringResource(R.string.library_downloads),
        description = "Main menu Downloads button",
        groups = listOf("requiredForPage"),
    )

    val PASSWORDS_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = getStringResource(R.string.browser_menu_passwords),
        description = "Main menu Passwords button",
        groups = listOf("requiredForPage"),
    )

    val SIGN_IN_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = getStringResource(R.string.browser_menu_sign_in),
        description = "Main menu Sign in button",
        groups = listOf("requiredForPage"),
    )

    val SETTINGS_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = getStringResource(R.string.browser_menu_settings),
        description = "Main menu Settings button",
        groups = listOf("requiredForPage"),
    )

    val BOOKMARK_THIS_PAGE_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
        value = getStringResource(R.string.browser_menu_bookmark_this_page_2),
        description = "Bookmark this page button",
        groups = listOf("bookmarkActions", "browserMenu"),
    )

    val EDIT_BOOKMARK_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
        value = getStringResource(R.string.browser_menu_edit_bookmark),
        description = "Edit bookmark button",
        groups = listOf("editBookmarkActions"),
    )

    val FIND_IN_PAGE_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
        value = getStringResource(R.string.browser_menu_find_in_page),
        description = "Main menu Find in page button",
        groups = listOf("browserMenu"),
    )

    val BACK_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = "Back",
        description = "Main menu Back button",
        groups = listOf("browserMenu"),
    )

    val FORWARD_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = "Forward",
        description = "Main menu Forward button",
        groups = listOf("browserMenu"),
    )

    val REFRESH_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = "Refresh",
        description = "Main menu Refresh button",
        groups = listOf("browserMenu"),
    )

    val SHARE_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = "Share",
        description = "Main menu Share button",
        groups = listOf("browserMenu"),
    )

    val DESKTOP_SITE_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
        value = getStringResource(R.string.browser_menu_desktop_site),
        description = "Main menu Desktop site button",
        groups = listOf("browserMenu"),
    )

    val MORE_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
        value = "More Collapsed",
        description = "Main menu More button",
        groups = listOf("browserMenu"),
    )

    // TODO (M. Barone 3/20/2026): add getting 'appName' to our base helpers
    val DEFAULT_BROWSER_BANNER_TITLE = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = getStringResource(R.string.browser_menu_default_banner_title, appName),
        description = "Make Firefox your default banner title",
        groups = listOf("homeBanner"),
    )

    val DEFAULT_BROWSER_BANNER_SUBTITLE = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = getStringResource(R.string.browser_menu_default_banner_subtitle_2),
        description = "Make Firefox your default banner subtitle",
        groups = listOf("homeBanner"),
    )

    val DEFAULT_BROWSER_BANNER_DISMISS = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
        value = getStringResource(R.string.browser_menu_default_banner_dismiss_promotion),
        description = "Make Firefox your default banner dismiss button",
        groups = listOf("homeBanner"),
    )

    val all = listOf(
        NEW_PRIVATE_TAB_BUTTON,
        EXTENSIONS_BUTTON,
        BOOKMARKS_BUTTON,
        HISTORY_BUTTON,
        DOWLOADS_BUTTON,
        PASSWORDS_BUTTON,
        SIGN_IN_BUTTON,
        SETTINGS_BUTTON,
        BOOKMARK_THIS_PAGE_BUTTON,
        EDIT_BOOKMARK_BUTTON,
        FIND_IN_PAGE_BUTTON,
        DEFAULT_BROWSER_BANNER_TITLE,
        DEFAULT_BROWSER_BANNER_SUBTITLE,
        DEFAULT_BROWSER_BANNER_DISMISS,
        BACK_BUTTON,
        FORWARD_BUTTON,
        REFRESH_BUTTON,
        SHARE_BUTTON,
        DESKTOP_SITE_BUTTON,
        MORE_BUTTON,
    )
}
