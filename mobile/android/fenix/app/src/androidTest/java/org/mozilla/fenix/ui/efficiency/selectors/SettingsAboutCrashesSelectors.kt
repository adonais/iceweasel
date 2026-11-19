/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object SettingsAboutCrashesSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        ABOUT_CRASHES_ITEMS
    }

    val CRASH_ID =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "mozac_lib_crash_id",
            description = "Crash ID",
            groups = setOf(Group.ABOUT_CRASHES_ITEMS),
        )

    val CRASH_TITLE =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "mozac_lib_crash_title",
            description = "Crash title",
            groups = setOf(Group.ABOUT_CRASHES_ITEMS),
        )

    val CRASH_FOOTER =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "mozac_lib_crash_footer",
            description = "Crash footer",
            groups = setOf(Group.ABOUT_CRASHES_ITEMS),
        )
}
