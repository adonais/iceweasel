/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.helpers.TestHelper.appName
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy
import org.mozilla.fenix.ui.efficiency.helpers.SwipeDirection

object SettingsEnhancedTrackingProtectionSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        ETPSECTION
    }

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preference_enhanced_tracking_protection),
            description = "Enhanced Tracking Protection toolbar title",
        )

    val ENHANCED_TRACKING_PROTECTION_SUMMARY =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = "$appName protects you from many of the most common trackers that follow what you do online.",
            description = "Enhanced tracking protection section summary",
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val ENHANCED_TRACKING_PROTECTION_EXCEPTIONS_BUTTON =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = "Exceptions",
            description = "Enhanced tracking protection Exceptions button",
            groups = setOf(Group.ETPSECTION),
            scrollDirection = SwipeDirection.UP,
        )
}
