/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object AddToHomeScreenSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        SYSTEM_PROMPT_ITEM,
        DEVICE_HOME_SCREEN_ITEM,
    }

    val CANCEL_DIALOG_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "cancel_button",
            description = "Add to home screen dialog cancel button",
            readiness = PageReadinessProfiles.IDENTITY_ANCHOR,
        )

    val ADD_DIALOG_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "add_button",
            description = "Add to home screen dialog add button",
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val SYSTEM_PROMPT_ADD_TO_HOME_SCREEN_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR2_BY_TEXT,
            value = "Add to home screen",
            description = "Add to home screen system prompt button",
            groups = setOf(Group.SYSTEM_PROMPT_ITEM),
        )

    @Suppress("FunctionName")
    fun HOME_SCREEN_SHORTCUT(shortcutTitle: String = "") =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = shortcutTitle,
            description = "Device home screen shortcut with title: $shortcutTitle",
            groups = setOf(Group.DEVICE_HOME_SCREEN_ITEM),
        )
}
