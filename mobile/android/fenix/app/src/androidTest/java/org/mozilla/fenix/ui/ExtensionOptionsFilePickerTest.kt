/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import android.app.Activity.RESULT_OK
import android.app.Instrumentation
import android.content.Intent
import android.os.Build
import android.os.Environment
import androidx.core.net.toUri
import androidx.navigation.fragment.NavHostFragment
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import mozilla.components.support.webextensions.WebExtensionSupport
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.NavGraphDirections
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.FenixTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.helpers.TestWebExtensionInstaller
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.SettingsSubMenuAddonsManagerAddonDetailedMenuRobot
import org.mozilla.fenix.ui.robots.filePickerExtensionOptionsScreen
import java.io.File
import kotlin.io.path.createTempDirectory
import androidx.compose.ui.test.junit4.v2.AndroidComposeTestRule as AndroidComposeTestRuleV2

@RunWith(AndroidJUnit4::class)
class ExtensionOptionsFilePickerTest {
    private var tempFileDirectory: File? = null

    companion object {
        private const val SELECTABLE_FILE_NAME = "file_picker_test.json"

        val FILE_PICKER_TEST_EXTENSION = TestWebExtensionInstaller.BuiltInTestExtension(
            name = "File Picker Android Test",
            id = "{e068cfab-5e1d-4dcd-bf4c-4be5c62b1ea0}",
            uri = "resource://android/assets/extensions/file_picker_test/",
        )
    }

    @get:Rule(order = 0)
    val fenixTestRule: FenixTestRule = FenixTestRule()

    @get:Rule(order = 1)
    val composeTestRule =
        AndroidComposeTestRuleV2(
            HomeActivityIntentTestRule.withDefaultSettingsOverrides(),
        ) { it.activity }

    @get:Rule(order = 2)
    val memoryLeaksRule = DetectMemoryLeaksRule(composeTestRule = { composeTestRule })

    @After
    fun tearDownTempFileDirectory() {
        tempFileDirectory?.deleteRecursively()
        tempFileDirectory = null
    }

    @Test
    fun filePickerSelection_updatesExtensionOptionsPage() {
        ensureFilePickerExtensionInstalled()
        val selectedFile = createSelectableJsonFile()

        navigateToFilePickerExtensionDetails()
        SettingsSubMenuAddonsManagerAddonDetailedMenuRobot().openSettings()

        stubFilePickerSelection(selectedFile)
        filePickerExtensionOptionsScreen(composeTestRule) {
            verifyOptionsPageIsDisplayed()
            verifyNoFileSelected()
            tapBrowseButton()
        }

        filePickerExtensionOptionsScreen(composeTestRule) {
            verifyFileSelected(SELECTABLE_FILE_NAME)
        }
    }

    private fun ensureFilePickerExtensionInstalled() {
        TestWebExtensionInstaller.ensureBuiltInExtensionInstalled(FILE_PICKER_TEST_EXTENSION) { extension ->
            WebExtensionSupport.installedExtensions[extension.id]
                ?.getMetadata()
                ?.optionsPageUrl
        }
    }

    private fun navigateToFilePickerExtensionDetails() {
        val addon = runBlocking {
            composeTestRule.activity.components.addonManager.getAddonByID(FILE_PICKER_TEST_EXTENSION.id)
        } ?: error("Expected ${FILE_PICKER_TEST_EXTENSION.name} to be installed")

        composeTestRule.activity.runOnUiThread {
            val navHost =
                composeTestRule.activity.supportFragmentManager.findFragmentById(R.id.container) as NavHostFragment
            navHost.navController.navigate(
                NavGraphDirections.actionGlobalToInstalledAddonDetailsFragment(addon),
            )
        }

        InstrumentationRegistry.getInstrumentation().waitForIdleSync()
    }

    private fun createSelectableJsonFile(): File {
        val downloadsDirectory = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            requireNotNull(appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS))
        } else {
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        }

        downloadsDirectory.mkdirs()
        tempFileDirectory = createTempDirectory(
            directory = downloadsDirectory.toPath(),
            prefix = "file_picker_test_",
        ).toFile()

        return File(tempFileDirectory, SELECTABLE_FILE_NAME).apply {
            writeText("""{"source":"extension-options-test"}""")
        }
    }

    private fun stubFilePickerSelection(selectedFile: File) {
        val resultData = Intent().apply {
            data = selectedFile.toUri()
        }
        intending(hasAction(Intent.ACTION_CHOOSER)).respondWith(
            Instrumentation.ActivityResult(RESULT_OK, resultData),
        )
    }
}
