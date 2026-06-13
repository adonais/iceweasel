/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object TabDrawerSelectors {

    val NORMAL_BROWSING_OPEN_TABS_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TAG,
        value = TabsTrayTestTag.NORMAL_TABS_PAGE_BUTTON,
        description = "Normal browsing tabs tray button",
        groups = listOf("requiredForPage"),
    )

    val SYNCED_TABS_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TAG,
        value = TabsTrayTestTag.SYNCED_TABS_PAGE_BUTTON,
        description = "Synced tabs button",
        groups = listOf("requiredForPage"),
    )

    val SIGN_IN_TO_SYNC_BUTTON = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
        value = getStringResource(R.string.tab_manager_empty_synced_tabs_page_sign_in_cta),
        description = "Sign in to sync button",
        groups = listOf("tabDrawerUnauthenticatedSyncedTabs"),
    )

    val UNAUTHENTICATED_SYNCED_TABS_PAGE = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TAG,
        value = TabsTrayTestTag.UNAUTHENTICATED_SYNCED_TABS_PAGE,
        description = "Unauthenticated synced tabs page",
        groups = listOf("tabDrawerUnauthenticatedSyncedTabs"),
    )

    val UNAUTHENTICATED_SYNCED_TABS_PAGE_HEADER = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
        value = getStringResource(R.string.tab_manager_empty_synced_tabs_page_header),
        description = "Unauthenticated synced tabs page header",
        groups = listOf("tabDrawerUnauthenticatedSyncedTabs"),
    )

    val UNAUTHENTICATED_SYNCED_TABS_PAGE_DESCRIPTION = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
        value = getStringResource(R.string.tab_manager_empty_synced_tabs_page_description),
        description = "Unauthenticated synced tabs page description",
        groups = listOf("tabDrawerUnauthenticatedSyncedTabs"),
    )

    val all = listOf(
        NORMAL_BROWSING_OPEN_TABS_BUTTON,
        SYNCED_TABS_BUTTON,
        SIGN_IN_TO_SYNC_BUTTON,
        UNAUTHENTICATED_SYNCED_TABS_PAGE,
        UNAUTHENTICATED_SYNCED_TABS_PAGE_HEADER,
        UNAUTHENTICATED_SYNCED_TABS_PAGE_DESCRIPTION,
    )
}
