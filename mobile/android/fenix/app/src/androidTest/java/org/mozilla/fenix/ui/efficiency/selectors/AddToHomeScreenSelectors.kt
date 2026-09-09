/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object AddToHomeScreenSelectors {
    val CANCEL_DIALOG_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "cancel_button",
            description = "Add to home screen dialog cancel button",
            groups = listOf("requiredForPage"),
        )

    val ADD_DIALOG_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "add_button",
            description = "Add to home screen dialog add button",
            groups = listOf("requiredForPage"),
        )

    val SYSTEM_PROMPT_ADD_TO_HOME_SCREEN_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR2_BY_TEXT,
            value = "Add to home screen",
            description = "Add to home screen system prompt button",
            groups = listOf("systemPromptItem"),
        )

    @Suppress("FunctionName")
    fun HOME_SCREEN_SHORTCUT(shortcutTitle: String = "") =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR2_BY_TEXT,
            value = shortcutTitle,
            description = "Device home screen shortcut with title: $shortcutTitle",
            groups = listOf("deviceHomeScreenItem"),
        )

    val all =
        listOf(
            CANCEL_DIALOG_BUTTON,
            ADD_DIALOG_BUTTON,
            SYSTEM_PROMPT_ADD_TO_HOME_SCREEN_BUTTON,
            HOME_SCREEN_SHORTCUT(),
        )
}
