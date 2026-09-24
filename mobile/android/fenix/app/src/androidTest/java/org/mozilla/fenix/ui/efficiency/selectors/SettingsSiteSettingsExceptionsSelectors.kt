/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object SettingsSiteSettingsExceptionsSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        EMPTY_SITE_SETTINGS_EXCEPTIONS_LIST
    }

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preference_exceptions),
            description = "Site settings exceptions toolbar title",
        )

    val EMPTY_EXCEPTIONS_LIST =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "empty_exception_container",
            description = "Empty site settings exceptions list",
            groups = setOf(Group.EMPTY_SITE_SETTINGS_EXCEPTIONS_LIST),
        )

    val EXCEPTIONS_LIST =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "exceptions",
            description = "Site settings exceptions list",
        )

    @Suppress("ktlint:standard:function-naming", "FunctionName")
    fun EXCEPTION_ROW(origin: String = "") =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = origin,
            description = "the site exception row for $origin",
        )

    val CLEAR_PERMISSIONS_ON_ALL_SITES_BUTTON =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "delete_all_site_permissions_button",
            description = "the Clear permissions on all sites button",
        )

    val CLEAR_PERMISSIONS_DIALOG_TITLE =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.clear_permissions),
            description = "the Clear permissions dialog title",
        )

    val CLEAR_PERMISSIONS_DIALOG_CANCEL_BUTTON =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.clear_permissions_negative),
            description = "the Clear permissions dialog Cancel button",
        )

    val CLEAR_PERMISSIONS_DIALOG_OK_BUTTON =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.clear_permissions_positive),
            description = "the Clear permissions dialog OK button",
        )
}
