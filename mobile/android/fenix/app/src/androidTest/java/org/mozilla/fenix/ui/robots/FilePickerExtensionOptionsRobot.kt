/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.robots

import android.util.Log
import androidx.compose.ui.test.junit4.ComposeTestRule
import org.mozilla.fenix.helpers.Constants.TAG
import org.mozilla.fenix.helpers.MatcherHelper.assertUIObjectExists
import org.mozilla.fenix.helpers.MatcherHelper.itemContainingText
import org.mozilla.fenix.helpers.MatcherHelper.itemWithResId
import org.mozilla.fenix.helpers.TestHelper.packageName

/**
 * Robot for interacting with the file picker test extension's options page rendered in the
 * internal settings fragment.
 */
class FilePickerExtensionOptionsRobot(private val composeTestRule: ComposeTestRule) {
    fun verifyOptionsPageIsDisplayed() {
        Log.i(TAG, "verifyOptionsPageIsDisplayed: Waiting for the options page container")
        assertUIObjectExists(itemWithResId("$packageName:id/addonSettingsEngineView"))
        Log.i(TAG, "verifyOptionsPageIsDisplayed: Waiting for the file picker label")
        assertUIObjectExists(itemContainingText("Import JSON"))
        Log.i(TAG, "verifyOptionsPageIsDisplayed: Verified the options page is displayed")
    }

    fun verifyNoFileSelected() {
        Log.i(TAG, "verifyNoFileSelected: Trying to verify the default file picker state")
        assertUIObjectExists(itemContainingText("No file selected"))
        Log.i(TAG, "verifyNoFileSelected: Verified the default file picker state")
    }

    fun tapBrowseButton() {
        Log.i(TAG, "tapBrowseButton: Trying to tap the file input browse button")
        clickPageObject(composeTestRule, itemContainingText("Browse"))
        Log.i(TAG, "tapBrowseButton: Tapped the file input browse button")
    }

    fun verifyFileSelected(fileName: String) {
        Log.i(TAG, "verifyFileSelected: Trying to verify that $fileName is selected")
        assertUIObjectExists(itemContainingText("No file selected"), exists = false)
        assertUIObjectExists(itemContainingText(fileName))
        Log.i(TAG, "verifyFileSelected: Verified that $fileName is selected")
    }
}

/**
 * Enters the add-on options page robot scope for assertions and interactions.
 */
fun filePickerExtensionOptionsScreen(
    composeTestRule: ComposeTestRule,
    interact: FilePickerExtensionOptionsRobot.() -> Unit,
): FilePickerExtensionOptionsRobot {
    val robot = FilePickerExtensionOptionsRobot(composeTestRule)
    robot.interact()
    return robot
}
