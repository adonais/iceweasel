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

object SettingsAccessibilitySelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        ACCESSIBILITY_SETTINGS,
        FONT_SIZING,
    }

    val SETTINGS_ACCESSIBILITY_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_accessibility),
            description = "Accessibility toolbar title",
        )

    val AUTOMATIC_FONT_SIZING_TITLE =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_accessibility_auto_size_2),
            description = "The Automatic font sizing title",
            groups = setOf(Group.ACCESSIBILITY_SETTINGS, Group.FONT_SIZING),
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val AUTOMATIC_FONT_SIZING_SUMMARY =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_accessibility_auto_size_summary),
            description = "The Automatic font sizing summary",
            groups = setOf(Group.FONT_SIZING),
        )

    val FONT_SIZE_TITLE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = "fontSizeTitle",
            description = "The Font Size title",
            groups = setOf(Group.FONT_SIZING),
        )

    val FONT_SIZE_SUBTITLE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = "fontSizeSubtitle",
            description = "The Font Size summary",
            groups = setOf(Group.FONT_SIZING),
        )

    val FONT_SIZE_SLIDER =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = "fontSizeSlider",
            description = "The Font Size slider",
            groups = setOf(Group.FONT_SIZING),
        )

    val FONT_SIZE_SLIDER_VALUE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = "fontSizeSliderValue",
            description = "The Font Size slider percentage value",
            groups = setOf(Group.FONT_SIZING),
        )

    val ZOOM_ON_ALL_WEBSITES_TITLE =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_accessibility_force_enable_zoom),
            description = "The Zoom on all websites title",
            groups = setOf(Group.FONT_SIZING),
        )

    val ZOOM_ON_ALL_WEBSITES_SUMMARY =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preference_accessibility_force_enable_zoom_summary),
            description = "The Zoom on all websites summary",
            groups = setOf(Group.FONT_SIZING),
        )
}
