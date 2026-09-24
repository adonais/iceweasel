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

object SettingsSiteSettingsSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        EXCEPTIONS,
        AUTOPLAY,
    }

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_site_settings),
            description = "Site settings toolbar title",
        )

    val EXCEPTIONS_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = "Exceptions",
            description = "Site settings Exceptions button",
            groups = setOf(Group.EXCEPTIONS),
        )

    val AUTOPLAY_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.preference_browser_feature_autoplay),
            description = "Site settings Autoplay button",
            groups = setOf(Group.AUTOPLAY),
        )

    val CAMERA_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.preference_phone_feature_camera),
            description = "Site settings Camera button",
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val LOCATION_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.preference_phone_feature_location),
            description = "Site settings Location button",
        )

    val MICROPHONE_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.preference_phone_feature_microphone),
            description = "Site settings Microphone button",
        )
}
