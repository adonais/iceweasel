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

object SettingsPasswordsSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        PASSWORD_SETTINGS
    }

    val GO_BACK_BUTTON =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_CONTENT_DESC,
            value = "Navigate up",
            description = "the Back Arrow button",
        )

    val SETTINGS_PASSWORDS_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_passwords_logins_and_passwords_2),
            description = "Passwords toolbar title",
        )

    val SAVE_PASSWORDS_TOGGLE =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "save_passwords_toggle",
            description = "Save Passwords Toggle",
            groups = setOf(Group.PASSWORD_SETTINGS),
        )

    val SAVE_PASSWORDS_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = "Save passwords",
            description = "Save Passwords Option",
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val SAVED_PASSWORDS_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = "Saved passwords",
            description = "Saved Passwords Option",
            readiness = PageReadinessProfiles.READY_CONTENT,
        )
}
