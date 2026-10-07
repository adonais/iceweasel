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

    val SAVE_PASSWORDS_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = "Save passwords",
            description = "Save Passwords Option",
            readiness = PageReadinessProfiles.READY_CONTENT,
            groups = setOf(Group.PASSWORD_SETTINGS),
        )

    val SAVED_PASSWORDS_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = "Saved passwords",
            description = "Saved Passwords Option",
            readiness = PageReadinessProfiles.READY_CONTENT,
            groups = setOf(Group.PASSWORD_SETTINGS),
        )

    val AUTOFILL_IN_FIREFOX_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_passwords_autofill2),
            description = "Autofill in Firefox Option",
            groups = setOf(Group.PASSWORD_SETTINGS),
        )

    val AUTOFILL_IN_OTHER_APPS_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_android_autofill),
            description = "Autofill in other apps Option",
            groups = setOf(Group.PASSWORD_SETTINGS),
        )

    val SYNC_PASSWORDS_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_passwords_sync_logins_across_devices_2),
            description = "Sync passwords across devices Option",
            groups = setOf(Group.PASSWORD_SETTINGS),
        )

    val EXCEPTIONS_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_passwords_exceptions),
            description = "Login Exceptions Option",
            groups = setOf(Group.PASSWORD_SETTINGS),
        )
}
