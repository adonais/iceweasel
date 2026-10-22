/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.account

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SignOutDialogTest {

    @get:Rule val composeTestRule = createComposeRule()

    @Test
    fun `GIVEN the sign out dialog is displayed WHEN the sign out button is clicked THEN the sign out callback is invoked`() {
        var onSignOutInvoked = false

        composeTestRule.setContent {
            SignOutDialog(
                onConfirmSignOut = { onSignOutInvoked = true },
                onCancel = {},
            )
        }

        composeTestRule.onNodeWithTag(AccountSettingsTestTag.SIGN_OUT_DIALOG_CONFIRM_BUTTON).performClick()

        assertTrue(onSignOutInvoked)
    }

    @Test
    fun `GIVEN the sign out dialog is displayed WHEN the cancel button is clicked THEN the cancel callback is invoked`() {
        var onCancelInvoked = false

        composeTestRule.setContent {
            SignOutDialog(
                onConfirmSignOut = {},
                onCancel = { onCancelInvoked = true },
            )
        }

        composeTestRule.onNodeWithTag(AccountSettingsTestTag.SIGN_OUT_DIALOG_CANCEL_BUTTON).performClick()

        assertTrue(onCancelInvoked)
    }
}
