/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object HomeSelectors {
    val TOP_SITES_LIST = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
        value = "top_sites_list",
        description = "Top Sites List",
        groups = listOf("topSites"),
    )

    val TOP_SITES_LIST_COMPOSE = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TAG,
        value = "top_sites_list",
        description = "Top Sites List",
        groups = listOf("topSitesCompose"),
    )

    val MAIN_MENU_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
        value = getStringResource(R.string.content_description_menu),
        description = "Three Dot Menu",
        groups = listOf("requiredForPage"),
    )

    // Use UIAutomator when navigating from BrowserPage — avoids Compose sync hanging when GeckoView is active.
    val MAIN_MENU_BUTTON_UIAUTOMATOR = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_DESCRIPTION_CONTAINS,
        value = getStringResource(R.string.content_description_menu),
        description = "Three Dot Menu",
        groups = listOf(),
    )

    val PRIVATE_BROWSING_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
        value = getStringResource(R.string.content_description_private_browsing),
        description = "Private browsing button",
        groups = listOf("privateBrowsing"),
    )

    val all = listOf(
        MAIN_MENU_BUTTON,
        PRIVATE_BROWSING_BUTTON,
        TOP_SITES_LIST,
    )
}
