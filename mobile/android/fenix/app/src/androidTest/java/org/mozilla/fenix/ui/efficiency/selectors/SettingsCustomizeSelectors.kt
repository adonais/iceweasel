/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object SettingsCustomizeSelectors {
    val SETTINGS_CUSTOMIZE_TITLE = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
        value = "Customize",
        description = "The Customize Settings title",
        groups = listOf("requiredForPage"),
    )

    val SHOW_TOOLBAR_TOGGLE = Selector(
        strategy = SelectorStrategy.ESPRESSO_BY_ID,
        value = "show_toolbar_toggle",
        description = "Show Toolbar Toggle",
        groups = listOf("customizeSettings"),
    )

    val SELECT_APP_ICON_TITLE = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
        value = getStringResource(R.string.preference_select_app_icon_title),
        description = "Select App Icon title",
        groups = listOf("appIconDefault"),
    )

    val APP_ICON_DEFAULT = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
        value = "Default",
        description = "Default app icon option",
        groups = listOf("appIconDefault"),
    )

    val all = listOf(
        SETTINGS_CUSTOMIZE_TITLE,
        SHOW_TOOLBAR_TOGGLE,
        SELECT_APP_ICON_TITLE,
        APP_ICON_DEFAULT,
    )
}
