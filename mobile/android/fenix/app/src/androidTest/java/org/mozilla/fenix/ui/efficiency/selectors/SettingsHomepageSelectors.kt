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

object SettingsHomepageSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        HOMEPAGE_SETTINGS
    }

    val SETTINGS_HOMEPAGE_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_home_2),
            description = "Homepage toolbar title",
        )

    val SHOW_TOP_SITES_TOGGLE =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "show_top_sites_toggle",
            description = "Show Top Sites Toggle",
            groups = setOf(Group.HOMEPAGE_SETTINGS),
        )

    val SHORTCUTS_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = "Shortcuts",
            description = "the Shortcuts button",
            groups = setOf(Group.HOMEPAGE_SETTINGS),
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val CONTINUE_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = "Continue",
            description = "the Continue button",
            groups = setOf(Group.HOMEPAGE_SETTINGS),
        )

    val RECENT_BOOKMARKS_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.customize_toggle_bookmarks),
            description = "the Recent bookmarks button",
            groups = setOf(Group.HOMEPAGE_SETTINGS),
        )

    val RECENTLY_VISITED_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = "Recently visited",
            description = "the Recently visited button",
            groups = setOf(Group.HOMEPAGE_SETTINGS),
        )

    val POCKET_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = "Pocket",
            description = "the Pocket button",
            groups = setOf(Group.HOMEPAGE_SETTINGS),
        )

    @Suppress("FunctionName")
    fun OPENING_SCREEN_OPTION(openingScreenOption: String = "") =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID_WITH_SIBLING_TEXT,
            value = "radio_button",
            secondaryValue = openingScreenOption,
            description = "Opening screen option: $openingScreenOption",
            groups = setOf(Group.HOMEPAGE_SETTINGS),
        )
}
