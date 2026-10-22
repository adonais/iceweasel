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

    // The top-of-screen items below carry a DOWN scroll (swipe down = scroll up) so they can be reached again
    // after the test has scrolled to the lower rows - mirroring the legacy scrollToElementByText("Standard
    // (default)") before the info clicks. mozSwipeTo no-ops when the element is already visible.
    val LEARN_MORE_LINK =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = "Learn more",
            description = "Enhanced tracking protection Learn more link",
            scrollDirection = SwipeDirection.DOWN,
        )

    // The main Enhanced Tracking Protection switch. FenixSwitchPreference renders a MaterialSwitch with the
    // internal id "checkbox" (a CheckBoxPreference subclass), so it is addressable directly - unlike the
    // stock GLOBAL_PRIVACY_CONTROL_TOGGLE below, whose switch is reached via its row title.
    // NOT a readiness anchor: selecting Strict/Custom expands allow-list CheckBoxPreference rows that ALSO carry the
    // "checkbox" res-id, making this substring match ambiguous - so it must not gate navigation. It is only used
    // explicitly while Standard is selected (the toggle is then the only "checkbox" on screen).
    val ENHANCED_TRACKING_PROTECTION_TOGGLE =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_RES_NAME,
            value = "checkbox",
            description = "Enhanced Tracking Protection toggle",
            // The toggle sits at the top of the screen; swipe DOWN (scroll up) to reveal it after the
            // lower rows have been scrolled to.
            scrollDirection = SwipeDirection.DOWN,
        )

    val ENHANCED_TRACKING_PROTECTION_TOGGLE_SUMMARY =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_enhanced_tracking_protection_summary),
            description = "Enhanced Tracking Protection toggle summary",
            scrollDirection = SwipeDirection.DOWN,
        )

    val STANDARD_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_enhanced_tracking_protection_standard_default_1),
            description = "Standard tracking protection option",
            scrollDirection = SwipeDirection.DOWN,
        )

    val STANDARD_OPTION_SUMMARY =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_enhanced_tracking_protection_standard_description_5),
            description = "Standard tracking protection option summary",
            scrollDirection = SwipeDirection.DOWN,
        )

    val STANDARD_INFO_BUTTON =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_CONTENT_DESC,
            value = getStringResource(R.string.preference_enhanced_tracking_protection_standard_info_button),
            description = "Standard tracking protection info button",
            scrollDirection = SwipeDirection.DOWN,
        )

    val STRICT_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_enhanced_tracking_protection_strict),
            description = "Strict tracking protection option",
            scrollDirection = SwipeDirection.DOWN,
        )

    val STRICT_OPTION_SUMMARY =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_enhanced_tracking_protection_strict_description_4),
            description = "Strict tracking protection option summary",
            scrollDirection = SwipeDirection.DOWN,
        )

    val STRICT_INFO_BUTTON =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_CONTENT_DESC,
            value = getStringResource(R.string.preference_enhanced_tracking_protection_strict_info_button),
            description = "Strict tracking protection info button",
            scrollDirection = SwipeDirection.DOWN,
        )

    val CUSTOM_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_enhanced_tracking_protection_custom),
            description = "Custom tracking protection option",
            scrollDirection = SwipeDirection.UP,
        )

    val CUSTOM_OPTION_SUMMARY =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_enhanced_tracking_protection_custom_description_2),
            description = "Custom tracking protection option summary",
            scrollDirection = SwipeDirection.UP,
        )

    val CUSTOM_INFO_BUTTON =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_CONTENT_DESC,
            value = getStringResource(R.string.preference_enhanced_tracking_protection_custom_info_button),
            description = "Custom tracking protection info button",
            scrollDirection = SwipeDirection.UP,
        )

    val GLOBAL_PRIVACY_CONTROL_TOGGLE =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_enhanced_tracking_protection_custom_global_privacy_control),
            description = "Tell websites not to share & sell data toggle",
            scrollDirection = SwipeDirection.UP,
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
