/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object HomeSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        TOP_SITES,
        TOP_SITES_COMPOSE,
        PRIVATE_BROWSING,
        HOME_SCREEN,
        CONTINUE,
        RECENT_BOOKMARKS_SECTION,
        PRIVATE_BROWSING_HOME_SCREEN,
        TOP_SITE_ITEM,
    }

    val TOP_SITES_LIST =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "top_sites_list",
            description = "Top Sites List",
            groups = setOf(Group.TOP_SITES),
        )

    val TOP_SITES_LIST_COMPOSE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = "top_sites_list",
            description = "Top Sites List",
            groups = setOf(Group.TOP_SITES_COMPOSE),
        )

    val HOMEPAGE_VIEW =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = "homepage.view",
            description = "Homepage view",
            readiness = PageReadinessProfiles.IDENTITY_ANCHOR,
        )

    val MAIN_MENU_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value = getStringResource(R.string.content_description_menu),
            description = "Three Dot Menu",
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    // Use UIAutomator when navigating from BrowserPage — avoids Compose sync hanging when GeckoView is active.
    val MAIN_MENU_BUTTON_UIAUTOMATOR =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_DESCRIPTION_CONTAINS,
            value = getStringResource(R.string.content_description_menu),
            description = "Three Dot Menu",
        )

    val PRIVATE_BROWSING_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value = getStringResource(R.string.content_description_private_browsing),
            description = "Private browsing button",
            groups = setOf(Group.PRIVATE_BROWSING),
        )

    val HOME_WORDMARK_LOGO =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = "homepage.wordmark.logo",
            description = "the home screen wordmark logo",
            groups = setOf(Group.HOME_SCREEN),
        )

    val HOME_WORDMARK_TEXT =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = "homepage.wordmark.text",
            description = "the home screen wordmark text",
            groups = setOf(Group.HOME_SCREEN),
        )

    val COLLECTIONS_HEADER =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.collections_header),
            description = "the Collections header",
            groups = setOf(Group.HOME_SCREEN),
        )

    val TAB_COUNTER_ZERO =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value = "Non-private Tabs Open: 0. Tap to switch tabs.",
            description = "the tab counter showing zero open tabs",
            groups = setOf(Group.HOME_SCREEN),
        )

    val CONTINUE_SECTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.recent_tabs_header_2),
            description = "Continue section header",
            groups = setOf(Group.CONTINUE),
        )

    val RECENT_BOOKMARKS_SECTION =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.home_bookmarks_title),
            description = "Bookmarks section header",
            groups = setOf(Group.RECENT_BOOKMARKS_SECTION),
        )

    val PRIVATE_BROWSING_INFO_CARD_TITLE =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = getStringResource(R.string.felt_privacy_desc_card_title),
            description = "Private browsing info card title",
            groups = setOf(Group.PRIVATE_BROWSING_HOME_SCREEN),
        )

    @Suppress("FunctionName")
    fun TOP_SITE_ITEM(topSiteTitle: String = "") =
        Selector(
            strategy = SelectorStrategy.COMPOSE_ON_ALL_NODES_BY_TAG_WITH_CHILD_TEXT_ON_FIRST,
            value = "top_sites_list.top_site_item",
            secondaryValue = topSiteTitle,
            description = "Top site item with title: $topSiteTitle",
            groups = setOf(Group.TOP_SITE_ITEM),
        )

    // The legacy robot hardcodes the English literal "Recently visited"; this keys off the string resource
    // it duplicates, so the selector survives localization.
    val RECENTLY_VISITED_HEADER =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.history_metadata_header_2),
            description = "Recently visited section header",
        )

    // A search group in the "Recently visited" section, titled with the search term. Exact text, because the
    // term is also the query and a CONTAINS match would collide with the awesomebar and history rows.
    // The group's "N pages" size caption is a sibling text node — assert it with
    // mozVerifyElementHasSiblingWithText, not as part of this selector.
    @Suppress("ktlint:standard:function-naming", "FunctionName")
    fun RECENTLY_VISITED_SEARCH_GROUP(searchTerm: String = "") =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = searchTerm,
            description = "'$searchTerm' search group",
        )
}
