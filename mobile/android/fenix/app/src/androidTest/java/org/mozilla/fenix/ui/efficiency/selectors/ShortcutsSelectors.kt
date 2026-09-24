/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object ShortcutsSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        SHORTCUTS_DIALOG
    }

    val SHORTCUTS_DIALOG_ADD_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "add_button",
            description = "Shortcuts dialog add button",
            groups = setOf(Group.SHORTCUTS_DIALOG),
        )
}
