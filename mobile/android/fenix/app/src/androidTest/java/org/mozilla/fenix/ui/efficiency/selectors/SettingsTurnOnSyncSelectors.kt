/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object SettingsTurnOnSyncSelectors {

    val USE_EMAIL_INSTEAD_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "signInEmailButton",
            description = "Use email instead button",
            groups = listOf("requiredForPage"),
        )

    val READY_TO_SCAN_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "signInScanButton",
            description = "Ready to scan button",
            groups = listOf("requiredForPage"),
        )

    // The camera-permission dialog Fenix shows when pairing is attempted without the permission. Matched on
    // text because the dialog is a MaterialAlertDialog whose buttons carry no ids of their own, and via
    // UiObject2 because dismissing a dialog is exactly the "slow reaction" case where UiObject's clickAndSync
    // reports a successful click as a failure.
    val PERMISSION_DIALOG_DISMISS_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR2_BY_TEXT,
            value = getStringResource(R.string.camera_permissions_needed_negative_button_text),
            description = "Camera permission dialog Dismiss button",
            groups = listOf(),
        )

    val PERMISSION_DIALOG_GO_TO_SETTINGS_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR2_BY_TEXT,
            value = getStringResource(R.string.camera_permissions_needed_positive_button_text),
            description = "Camera permission dialog Go to settings button",
            groups = listOf(),
        )

    val all =
        listOf(
            USE_EMAIL_INSTEAD_BUTTON,
            READY_TO_SCAN_BUTTON,
            PERMISSION_DIALOG_DISMISS_BUTTON,
            PERMISSION_DIALOG_GO_TO_SETTINGS_BUTTON,
        )
}
