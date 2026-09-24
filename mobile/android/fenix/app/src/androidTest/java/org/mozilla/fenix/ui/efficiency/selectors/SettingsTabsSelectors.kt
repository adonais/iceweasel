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

object SettingsTabsSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        TAB_SETTINGS
    }

    val SETTINGS_TABS_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_tabs),
            description = "Tabs toolbar title",
        )

    val INACTIVE_TABS_TITLE =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_inactive_tabs_title),
            description = "Inactive tabs title",
            groups = setOf(Group.TAB_SETTINGS),
            readiness = PageReadinessProfiles.READY_CONTENT,
        )
}
