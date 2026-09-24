/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy
import org.mozilla.fenix.ui.efficiency.helpers.SwipeDirection

object SettingsSearchSelectors : SelectorContainer {
    val SETTINGS_SEARCH_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_search),
            description = "Search toolbar title",
        )

    val DEFAULT_SEARCH_ENGINE_SETTING_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = "Default search engine",
            description = "Default search engine option",
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val MANAGE_SHORTCUTS_SETTING_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_manage_search_shortcuts_2),
            description = "Manage alternative search engines option",
        )

    // Below-fold preference row; clicking the title toggles the switch (mirrors the legacy
    // toggleShowSearchSuggestions). Its scroll direction drives the harness to bring it into view first.
    val SHOW_SEARCH_SUGGESTIONS_TOGGLE =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_show_search_suggestions),
            description = "Show search suggestions toggle",
            scrollDirection = SwipeDirection.UP,
        )
}
