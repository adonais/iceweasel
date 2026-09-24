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

object SettingsPrivateBrowsingSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        DEFAULT_VALUES
    }

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_private_browsing_options),
            description = "Private browsing toolbar title",
        )

    val ADD_PRIVATE_BROWSING_SHORTCUT =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_add_private_browsing_shortcut),
            description = "Add private browsing shortcut button",
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val OPEN_LINKS_IN_PRIVATE_TAB =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = "Open links in a private tab",
            description = "Open links in a private tab toggle",
            groups = setOf(Group.DEFAULT_VALUES),
        )

    val ALLOW_SCREENSHOTS_IN_PRIVATE_BROWSING =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_allow_screenshots_in_private_mode),
            description = "Allow screenshots in private browsing toggle",
        )
}
