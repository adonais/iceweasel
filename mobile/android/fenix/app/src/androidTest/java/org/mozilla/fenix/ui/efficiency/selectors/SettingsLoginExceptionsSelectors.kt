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

object SettingsLoginExceptionsSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        EMPTY_LOGIN_EXCEPTIONS_LIST
    }

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preference_exceptions),
            description = "Login exceptions toolbar title",
        )

    val EMPTY_LOGIN_EXCEPTIONS_LIST =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "exceptions_empty_view",
            description = "Empty login exceptions list",
            groups = setOf(Group.EMPTY_LOGIN_EXCEPTIONS_LIST),
        )

    val LOGIN_EXCEPTIONS_LIST =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "exceptions_list",
            description = "Login exceptions list",
        )

    @Suppress("FunctionName")
    fun EXCEPTION_ROW(origin: String = "") =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = origin,
            description = "the login exception row for '$origin'",
        )
}
