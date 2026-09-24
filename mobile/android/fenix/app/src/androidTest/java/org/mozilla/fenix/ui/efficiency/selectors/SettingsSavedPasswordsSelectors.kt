/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.settings.logins.ui.LoginsTestingTags.LOGIN_DETAILS_PASSWORD_TEXT_FIELD
import org.mozilla.fenix.settings.logins.ui.LoginsTestingTags.SAVED_LOGINS_LIST
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object SettingsSavedPasswordsSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        LOGINS_SECURITY_DIALOG,
        EMPTY_SAVED_PASSWORDS_LIST,
        LOGIN_DETAILS,
    }

    val SAVED_PASSWORDS_TOOLBAR_TITLE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.preferences_passwords_saved_logins_2),
            description = "Saved passwords toolbar title",
            readiness = PageReadinessProfiles.IDENTITY_ANCHOR,
        )

    val GO_BACK_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value = getStringResource(R.string.logins_navigate_back_button_content_description),
            description = "Go back toolbar button",
        )

    val LOGINS_SECURITY_DIALOG_TITLE =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = getStringResource(R.string.logins_warning_dialog_title_2),
            description = "Logins security dialog title",
            groups = setOf(Group.LOGINS_SECURITY_DIALOG),
        )

    val LOGINS_SECURITY_DIALOG_LATER_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR2_BY_RAW_RES,
            value = "android:id/button2",
            description = "Logins security dialog later button",
            groups = setOf(Group.LOGINS_SECURITY_DIALOG),
        )

    val SAVED_PASSWORDS_LIST =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = SAVED_LOGINS_LIST,
            description = "Saved passwords list",
        )

    val EMPTY_SAVED_PASSWORDS_LIST_DESCRIPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.preferences_passwords_saved_logins_description_empty_text_2),
            description = "Save Passwords Toggle",
            groups = setOf(Group.EMPTY_SAVED_PASSWORDS_LIST),
        )

    val EMPTY_SAVED_PASSWORDS_LIST_LEARN_MORE_ABOUT_SYNC =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value = "Learn more about sync Links available",
            description = "Save Passwords Toggle",
            groups = setOf(Group.EMPTY_SAVED_PASSWORDS_LIST),
        )

    val EMPTY_SAVED_PASSWORDS_LIST_ADD_PASSWORD_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.preferences_logins_add_login_2),
            description = "Add password button",
            groups = setOf(Group.EMPTY_SAVED_PASSWORDS_LIST),
        )

    val REVEAL_PASSWORD_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value = getStringResource(R.string.saved_login_reveal_password),
            description = "Reveal password button",
            groups = setOf(Group.LOGIN_DETAILS),
        )

    @Suppress("FunctionName")
    fun SAVED_LOGIN_ENTRY(username: String = "") =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = username,
            description = "Saved login entry '$username'",
        )

    @Suppress("FunctionName")
    fun LOGIN_DETAILS_PASSWORD(password: String = "") =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG_AND_TEXT,
            value = LOGIN_DETAILS_PASSWORD_TEXT_FIELD,
            secondaryValue = password,
            description = "Login details password field with value '$password'",
        )
}
