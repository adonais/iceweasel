/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:Suppress("TooManyFunctions")

package org.mozilla.fenix.ui.robots

import android.util.Log
import androidx.compose.ui.test.ComposeTimeoutException
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertAny
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextReplacement
import androidx.test.espresso.Espresso.closeSoftKeyboard
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.pressImeActionButton
import androidx.test.espresso.assertion.PositionAssertions
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.matcher.IntentMatchers
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiScrollable
import androidx.test.uiautomator.UiSelector
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.ADDRESSBAR_SEARCH_BOX
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.SEARCH_SELECTOR
import org.junit.Assert.assertTrue
import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.AppAndSystemHelper.grantSystemPermission
import org.mozilla.fenix.helpers.AppAndSystemHelper.isPackageInstalled
import org.mozilla.fenix.helpers.AppAndSystemHelper.registerAndCleanupIdlingResources
import org.mozilla.fenix.helpers.Constants.LONG_CLICK_DURATION
import org.mozilla.fenix.helpers.Constants.PackageName.GOOGLE_QUICK_SEARCH
import org.mozilla.fenix.helpers.Constants.RETRY_COUNT
import org.mozilla.fenix.helpers.Constants.SPEECH_RECOGNITION
import org.mozilla.fenix.helpers.Constants.TAG
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.helpers.MatcherHelper.assertItemTextContains
import org.mozilla.fenix.helpers.MatcherHelper.assertItemTextEquals
import org.mozilla.fenix.helpers.MatcherHelper.assertUIObjectExists
import org.mozilla.fenix.helpers.MatcherHelper.assertUIObjectIsGone
import org.mozilla.fenix.helpers.MatcherHelper.itemWithDescription
import org.mozilla.fenix.helpers.MatcherHelper.itemWithResId
import org.mozilla.fenix.helpers.MatcherHelper.itemWithResIdAndText
import org.mozilla.fenix.helpers.MatcherHelper.itemWithText
import org.mozilla.fenix.helpers.SessionLoadedIdlingResource
import org.mozilla.fenix.helpers.TestAssetHelper.waitingTime
import org.mozilla.fenix.helpers.TestAssetHelper.waitingTimeShort
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.helpers.TestHelper.appName
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.helpers.TestHelper.packageName
import org.mozilla.fenix.helpers.TestHelper.waitForAppWindowToBeUpdated
import mozilla.components.browser.toolbar.R as toolbarR
import mozilla.components.feature.qr.R as qrR

/**
 * Implementation of Robot Pattern for the search fragment.
 */
class SearchRobot {
    fun verifySearchView() = assertUIObjectExists(itemWithResId("$packageName:id/search_wrapper"))

    fun verifySearchToolbar(isDisplayed: Boolean) =
        assertUIObjectExists(
            itemWithResId("$packageName:id/mozac_browser_toolbar_edit_url_view"),
            exists = isDisplayed,
        )

    fun verifyScanButtonVisibility(visible: Boolean = true) =
        assertUIObjectExists(scanButton(), exists = visible)

    @OptIn(ExperimentalTestApi::class)
    fun verifyScanButtonWithComposableToolbar(composeTestRule: ComposeTestRule, isDisplayed: Boolean) {
        if (isDisplayed) {
            Log.i(TAG, "verifyScanButtonWithComposableToolbar: Waiting for $waitingTime until the scan QR button is exists")
            composeTestRule.waitUntilExactlyOneExists(hasContentDescription(getStringResource(qrR.string.mozac_feature_qr_scanner)), waitingTime)
            Log.i(TAG, "verifyScanButtonWithComposableToolbar: Waited for $waitingTime until the scan QR button is exists")
            Log.i(TAG, "verifyScanButtonWithComposableToolbar: Trying to verify that the scan QR button is displayed")
            composeTestRule.onNodeWithContentDescription(getStringResource(qrR.string.mozac_feature_qr_scanner))
                .assertIsDisplayed()
            Log.i(TAG, "verifyScanButtonWithComposableToolbar: Verified that the scan QR button is displayed")
        } else {
            Log.i(TAG, "verifyScanButtonWithComposableToolbar: Waiting for $waitingTime until the scan QR button does not is exist")
            composeTestRule.waitUntilDoesNotExist(hasContentDescription(getStringResource(qrR.string.mozac_feature_qr_scanner)), waitingTime)
            Log.i(TAG, "verifyScanButtonWithComposableToolbar: Waited for $waitingTime until the scan QR button does not is exist")
            Log.i(TAG, "verifyScanButtonWithComposableToolbar: Trying to verify that the scan QR button is not displayed")
            composeTestRule.onNodeWithContentDescription(getStringResource(qrR.string.mozac_feature_qr_scanner))
                .assertIsNotDisplayed()
            Log.i(TAG, "verifyScanButtonWithComposableToolbar: Verified that the scan QR button is not displayed")
        }
    }

    fun verifyVoiceSearchButtonVisibility(enabled: Boolean) =
        assertUIObjectExists(voiceSearchButton(), exists = enabled)

    fun verifyVoiceSearchButtonWithComposableToolbar(composeTestRule: ComposeTestRule, isDisplayed: Boolean) {
        if (isDisplayed) {
            Log.i(TAG, "verifyVoiceSearchButtonWithComposableToolbar: Trying to verify that the voice search button is displayed")
            composeTestRule.onNodeWithContentDescription(getStringResource(R.string.voice_search_content_description))
                .assertIsDisplayed()
            Log.i(TAG, "verifyVoiceSearchButtonWithComposableToolbar: Verified that the voice search button is displayed")
        } else {
            Log.i(TAG, "verifyVoiceSearchButtonWithComposableToolbar: Trying to verify that the voice search button is not displayed")
            composeTestRule.onNodeWithContentDescription(getStringResource(R.string.voice_search_content_description))
                .assertIsNotDisplayed()
            Log.i(TAG, "verifyVoiceSearchButtonWithComposableToolbar: Verified that the voice search button is not displayed")
        }
    }

    // Device or AVD requires a Google Services Android OS installation
    fun startVoiceSearch() {
        Log.i(TAG, "startVoiceSearch: Trying to click the voice search button button")
        voiceSearchButton().click()
        Log.i(TAG, "startVoiceSearch: Clicked the voice search button button")
        grantSystemPermission()

        if (isPackageInstalled(GOOGLE_QUICK_SEARCH)) {
            Log.i(TAG, "startVoiceSearch: $GOOGLE_QUICK_SEARCH is installed")
            Log.i(TAG, "startVoiceSearch: Trying to verify the intent to: $GOOGLE_QUICK_SEARCH")
            Intents.intended(IntentMatchers.hasAction(SPEECH_RECOGNITION))
            Log.i(TAG, "startVoiceSearch: Verified the intent to: $GOOGLE_QUICK_SEARCH")
        }
    }

    fun startVoiceSearchWithComposableToolbar(composeTestRule: ComposeTestRule) {
        Log.i(TAG, "startVoiceSearchWithComposableToolbar: Trying to click the voice search button button")
        composeTestRule.onNodeWithContentDescription(getStringResource(R.string.voice_search_content_description)).performClick()
        Log.i(TAG, "startVoiceSearchWithComposableToolbar: Clicked the voice search button button")
        grantSystemPermission()

        if (isPackageInstalled(GOOGLE_QUICK_SEARCH)) {
            Log.i(TAG, "startVoiceSearchWithComposableToolbar: $GOOGLE_QUICK_SEARCH is installed")
            Log.i(TAG, "startVoiceSearchWithComposableToolbar: Trying to verify the intent to: $GOOGLE_QUICK_SEARCH")
            Intents.intended(IntentMatchers.hasAction(SPEECH_RECOGNITION))
            Log.i(TAG, "startVoiceSearchWithComposableToolbar: Verified the intent to: $GOOGLE_QUICK_SEARCH")
        }
    }

    fun closeVoiceSearchDialog() {
        Log.i(TAG, "closeVoiceSearchDialog: Trying to click device back button")
        mDevice.pressBack()
        Log.i(TAG, "closeVoiceSearchDialog: Clicked device back button")
    }

    @OptIn(ExperimentalTestApi::class)
    fun verifyTheSuggestionsHeader(rule: ComposeTestRule, headerText: String) {
        Log.i(TAG, "verifyTheFirefoxSuggestHeader: Trying to verify the Firefox Suggest header is displayed.")
        rule.waitUntilExactlyOneExists(hasText(headerText), waitingTime)
        rule.onNodeWithText(headerText).assertIsDisplayed()
        Log.i(TAG, "verifyTheFirefoxSuggestHeader: Verified the Firefox Suggest header is displayed.")
    }

    /**
     * Verifies that the sponsored suggestions are displayed.
     * For regular search suggestions, use [verifySearchSuggestionsAreDisplayed].
     */
    @OptIn(ExperimentalTestApi::class)
    fun verifySponsoredSuggestionsResults(
        rule: ComposeTestRule,
        vararg searchSuggestions: String,
        searchTerm: String,
        shouldEditKeyword: Boolean = false,
        numberOfDeletionSteps: Int = 0,
        shouldUseSearchShort: Boolean = false,
        searchEngineName: String = "",
    ) {
        rule.waitForIdle()
        for (i in 1..RETRY_COUNT) {
            Log.i(TAG, "verifySponsoredSuggestionsResults: Started try #$i")
            try {
                for (searchSuggestion in searchSuggestions) {
                    Log.i(TAG, "verifySponsoredSuggestionsResults: Trying to perform \"Close soft keyboard\" action")
                    closeSoftKeyboard()
                    Log.i(TAG, "verifySponsoredSuggestionsResults: Performed \"Close soft keyboard\" action")
                    Log.i(TAG, "verifySponsoredSuggestionsResults: Waiting for $waitingTime ms until $searchSuggestion search suggestion exists")
                    rule.waitUntilExactlyOneExists(hasText(searchSuggestion), waitingTime)
                    Log.i(TAG, "verifySponsoredSuggestionsResults: Waited for $waitingTime ms until $searchSuggestion search suggestion exists")
                }

                break
            } catch (e: ComposeTimeoutException) {
                Log.i(TAG, "verifySponsoredSuggestionsResults: AssertionError caught, executing fallback methods")
                if (i == RETRY_COUNT) {
                    throw e
                } else {
                    mDevice.pressBack()
                    homeScreen {
                    }.openSearch {
                        if (shouldUseSearchShort) {
                            clickSearchSelectorButton()
                            selectTemporarySearchMethod(searchEngineName)
                        }
                        typeSearch(searchTerm)
                        if (shouldEditKeyword) {
                            deleteSearchKeywordCharacters(numberOfDeletionSteps = numberOfDeletionSteps)
                        }
                    }
                }
            }
        }
        for (searchSuggestion in searchSuggestions) {
            Log.i(TAG, "verifySponsoredSuggestionsResults: Trying to verify that $searchSuggestion search suggestion exists")
            rule.onNodeWithText(searchSuggestion).assertIsDisplayed()
            Log.i(TAG, "verifySponsoredSuggestionsResults: Verified that $searchSuggestion search suggestion exists")
        }
    }

    /**
     * Verifies that the regular search suggestions are displayed.
     * For sponsored suggestions, use [verifySponsoredSuggestionsResults].
     */
    @OptIn(ExperimentalTestApi::class)
    fun verifySearchSuggestionsAreDisplayed(rule: ComposeTestRule, vararg searchSuggestions: String) {
        rule.waitForIdle()
        for (searchSuggestion in searchSuggestions) {
            Log.i(
                TAG,
                "verifySearchSuggestionsAreDisplayed: Trying to perform \"Close soft keyboard\" action.",
            )
            closeSoftKeyboard()
            Log.i(
                TAG,
                "verifySearchSuggestionsAreDisplayed: Performed \"Close soft keyboard\" action.",
            )
            Log.i(
                TAG,
                "verifySearchSuggestionsAreDisplayed: Waiting for $waitingTime ms until $searchSuggestion search suggestion exists.",
            )
            rule.waitUntilExactlyOneExists(hasText(searchSuggestion), waitingTime)
            rule.onAllNodesWithTag("mozac.awesomebar.suggestion")
                .assertAny(
                    hasText(searchSuggestion, substring = true),
                )
            Log.i(
                TAG,
                "verifySearchSuggestionsAreDisplayed: Verified $searchSuggestion search suggestion exists.",
            )
        }
    }

    fun verifySuggestionsAreNotDisplayed(rule: ComposeTestRule, vararg searchSuggestions: String) {
        Log.i(TAG, "verifySuggestionsAreNotDisplayed: Waiting for compose test rule to be idle")
        rule.waitForIdle()
        Log.i(TAG, "verifySuggestionsAreNotDisplayed: Waited for compose test rule to be idle")
        for (searchSuggestion in searchSuggestions) {
            Log.i(TAG, "verifySuggestionsAreNotDisplayed: Trying to verify that there are no $searchSuggestion related search suggestions")
            rule.onAllNodesWithTag("mozac.awesomebar.suggestions")
                .assertAny(
                    hasText(searchSuggestion)
                        .not(),
                )
            Log.i(TAG, "verifySuggestionsAreNotDisplayed: Verified that there are no $searchSuggestion related search suggestions")
        }
    }

    fun verifySuggestionsWithComposableToolbarAreNotDisplayed(composeTestRule: ComposeTestRule) {
        Log.i(TAG, "verifySuggestionsWithComposableToolbarAreNotDisplayed: Trying to verify that no search suggestions are displayed")
        composeTestRule.onNodeWithTag("mozac.awesomebar.suggestions").assertIsNotDisplayed()
        Log.i(TAG, "verifySuggestionsWithComposableToolbarAreNotDisplayed: Verified that no search suggestions are displayed")
    }

    @OptIn(ExperimentalTestApi::class)
    fun verifySearchSuggestionsCount(rule: ComposeTestRule, numberOfSuggestions: Int, searchTerm: String) {
        for (i in 1..RETRY_COUNT) {
            Log.i(TAG, "verifySearchSuggestionsCount: Started try #$i")
            try {
                Log.i(TAG, "verifySearchSuggestionsCount: Compose test rule is waiting for $waitingTime ms until the note count equals to: $numberOfSuggestions")
                rule.waitUntilNodeCount(hasTestTag("mozac.awesomebar.suggestion"), numberOfSuggestions, waitingTime)
                Log.i(TAG, "verifySearchSuggestionsCount: Compose test rule waited for $waitingTime ms until the note count equals to: $numberOfSuggestions")
                Log.i(TAG, "verifySearchSuggestionsCount: Trying to verify that the count of the search suggestions equals: $numberOfSuggestions")
                rule.onAllNodesWithTag("mozac.awesomebar.suggestion").assertCountEquals(numberOfSuggestions)
                Log.i(TAG, "verifySearchSuggestionsCount: Verified that the count of the search suggestions equals: $numberOfSuggestions")

                break
            } catch (e: ComposeTimeoutException) {
                Log.i(TAG, "verifySearchSuggestionsCount: ComposeTimeoutException caught, executing fallback methods")
                if (i == RETRY_COUNT) {
                    throw e
                } else {
                    Log.i(TAG, "verifySearchSuggestionsCount: Trying to click device back button")
                    mDevice.pressBack()
                    Log.i(TAG, "verifySearchSuggestionsCount: Clicked device back button")
                    homeScreen {
                    }.openSearch {
                        typeSearch(searchTerm)
                    }
                }
            }
        }
    }

    fun verifyAllowSuggestionsInPrivateModeDialog() =
        assertUIObjectExists(
            itemWithText(getStringResource(R.string.search_suggestions_onboarding_title)),
            itemWithText(getStringResource(R.string.search_suggestions_onboarding_text)),
            itemWithText("Learn more"),
            itemWithText(getStringResource(R.string.search_suggestions_onboarding_allow_button)),
            itemWithText(getStringResource(R.string.search_suggestions_onboarding_do_not_allow_button)),
        )

    fun verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar(composeTestRule: ComposeTestRule) {
        Log.i(TAG, "verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar: Trying to verify that the private browsing search suggestion title is displayed")
        composeTestRule.onNodeWithText(getStringResource(R.string.search_suggestions_onboarding_title), useUnmergedTree = true).assertIsDisplayed()
        Log.i(TAG, "verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar: Verified that the private browsing search suggestion title is displayed")
        Log.i(TAG, "verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar: Trying to verify that the private browsing search suggestion message is displayed")
        composeTestRule.onNodeWithText(getStringResource(R.string.search_suggestions_onboarding_text), useUnmergedTree = true).assertIsDisplayed()
        Log.i(TAG, "verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar: Verified that the private browsing search suggestion message is displayed")
        Log.i(TAG, "verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar: Trying to verify that the \"Learn more\" link is displayed")
        composeTestRule.onNodeWithContentDescription("Learn more Links available", useUnmergedTree = true).assertIsDisplayed()
        Log.i(TAG, "verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar: Verified that the \"Learn more\" link is displayed")
        Log.i(TAG, "verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar: Trying to verify that the \"Allow\" button is displayed")
        composeTestRule.onNodeWithText(getStringResource(R.string.search_suggestions_onboarding_allow_button), useUnmergedTree = true).assertIsDisplayed()
        Log.i(TAG, "verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar: Verified that the \"Allow\" button is displayed")
        Log.i(TAG, "verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar: Trying to verify that the \"Don't allow\" button is displayed")
        composeTestRule.onNodeWithText(getStringResource(R.string.search_suggestions_onboarding_do_not_allow_button), useUnmergedTree = true).assertIsDisplayed()
        Log.i(TAG, "verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar: Verified that the \"Don't allow\" button is displayed")
    }

    fun denySuggestionsInPrivateMode() {
        Log.i(TAG, "denySuggestionsInPrivateMode: Trying to click the \"Don’t allow\" button")
        mDevice.findObject(
            UiSelector().text(getStringResource(R.string.search_suggestions_onboarding_do_not_allow_button)),
        ).click()
        Log.i(TAG, "denySuggestionsInPrivateMode: Clicked the \"Don’t allow\" button")
    }

    fun allowSuggestionsInPrivateMode() {
        Log.i(TAG, "allowSuggestionsInPrivateMode: Trying to click the \"Allow\" button")
        mDevice.findObject(
            UiSelector().text(getStringResource(R.string.search_suggestions_onboarding_allow_button)),
        ).click()
        Log.i(TAG, "allowSuggestionsInPrivateMode: Clicked the \"Allow\" button")
    }

    fun verifySearchSelectorButton() = assertUIObjectExists(searchSelectorButton())

    fun clickSearchSelectorButton() {
        Log.i(TAG, "clickSearchSelectorButton: Waiting for $waitingTime ms for search selector button to exist")
        searchSelectorButton().waitForExists(waitingTime)
        Log.i(TAG, "clickSearchSelectorButton: Waited for $waitingTime ms for search selector button to exist")
        Log.i(TAG, "clickSearchSelectorButton: Trying to click the search selector button")
        searchSelectorButton().click()
        Log.i(TAG, "clickSearchSelectorButton: Clicked the search selector button")
    }

    fun clickSearchSelectorButtonWithComposableToolbar(composeTestRule: ComposeTestRule) {
        Log.i(TAG, "clickSearchSelectorButtonWithComposableToolbar: Trying to click the search selector button")
        composeTestRule.onNodeWithTag(SEARCH_SELECTOR).performClick()
        Log.i(TAG, "clickSearchSelectorButtonWithComposableToolbar: Clicked the search selector button")
    }

    fun verifySearchEngineIcon(name: String) = assertUIObjectExists(itemWithDescription(name))

    fun verifySearchEngineIconWithComposableToolbar(composeTestRule: ComposeTestRule, name: String) {
        Log.i(TAG, "verifySearchEngineIconWithComposableToolbar: Trying to verify that search selector icon for: $name search engine is displayed")
        composeTestRule.onNodeWithContentDescription(getStringResource(R.string.search_engine_selector_content_description, name)).assertIsDisplayed()
        Log.i(TAG, "verifySearchEngineIconWithComposableToolbar: Verified that search selector icon for: $name search engine is displayed")
    }

    fun verifySearchBarPlaceholder(text: String) {
        Log.i(TAG, "verifySearchBarPlaceholder: Waiting for $waitingTime ms for the edit mode toolbar to exist")
        browserToolbarEditView().waitForExists(waitingTime)
        Log.i(TAG, "verifySearchBarPlaceholder: Waited for $waitingTime ms for the edit mode toolbar to exist")
        assertItemTextEquals(browserToolbarEditView(), expectedText = text)
    }

    fun verifySearchBarPlaceholderWithComposableToolbar(
        composeTestRule: ComposeTestRule,
        searchHint: String,
    ) {
        Log.i(TAG, "verifySearchBarPlaceholderWithComposableToolbar: Verify hint is $searchHint")
        composeTestRule
            .onNodeWithTag(ADDRESSBAR_SEARCH_BOX)
            .assert(hasText(searchHint))
            .assertIsDisplayed()
        Log.i(TAG, "verifySearchBarPlaceholderWithComposableToolbar: Verification successful")
    }

    fun verifySearchShortcutListContains(vararg searchEngineName: String, shouldExist: Boolean = true) {
        searchEngineName.forEach {
            if (shouldExist) {
                assertUIObjectExists(
                    searchShortcutList().getChild(UiSelector().text(it)),
                )
            } else {
                assertUIObjectIsGone(searchShortcutList().getChild(UiSelector().text(it)))
            }
        }
    }

    fun verifySearchShortcutListWithComposableToolbar(composeTestRule: ComposeTestRule, vararg searchEngineNames: String) {
        for (searchEngineName in searchEngineNames) {
            Log.i(TAG, "verifySearchShortcutListWithComposableToolbar: Trying to verify the $searchEngineName search shortcut is displayed")
            composeTestRule.onNodeWithContentDescription(searchEngineName).assertIsDisplayed()
            Log.i(TAG, "verifySearchShortcutListWithComposableToolbar: Verified the $searchEngineName search shortcut is displayed")
        }
    }

    // New unified search UI search selector.
    fun selectTemporarySearchMethod(searchEngineName: String) {
        Log.i(TAG, "selectTemporarySearchMethod: Trying to click the $searchEngineName search shortcut")
        searchShortcutList().getChild(UiSelector().text(searchEngineName)).click()
        Log.i(TAG, "selectTemporarySearchMethod: Clicked the $searchEngineName search shortcut")
    }

    fun selectTemporarySearchMethodWithComposableToolbar(composeTestRule: ComposeTestRule, searchEngineName: String) {
        Log.i(TAG, "selectTemporarySearchMethodWithComposableToolbar: Trying to click the $searchEngineName search shortcut")
        composeTestRule.onNodeWithContentDescription(searchEngineName).performClick()
        Log.i(TAG, "selectTemporarySearchMethodWithComposableToolbar: Clicked the $searchEngineName search shortcut")
    }

    fun clickScanButton() {
        waitForAppWindowToBeUpdated()
        assertUIObjectExists(scanButton())
        Log.i(TAG, "clickScanButton: Trying to click the scan button and wait for $waitingTimeShort ms for a new window")
        scanButton().clickAndWaitForNewWindow(waitingTimeShort)
        Log.i(TAG, "clickScanButton: Clicked the scan button and waited for $waitingTimeShort ms for a new window")
    }

    fun clickScanButtonWithComposableToolbar(composeTestRule: ComposeTestRule) {
        Log.i(TAG, "clickScanButtonWithComposableToolbar: Trying to click the scan button")
        composeTestRule.onNodeWithContentDescription(getStringResource(qrR.string.mozac_feature_qr_scanner)).performClick()
        Log.i(TAG, "clickScanButtonWithComposableToolbar: Clicked the scan button")
    }

    fun clickDismissPermissionRequiredDialog() {
        Log.i(TAG, "clickDismissPermissionRequiredDialog: Waiting for $waitingTime ms for the \"Dismiss\" permission button to exist")
        dismissPermissionButton().waitForExists(waitingTime)
        Log.i(TAG, "clickDismissPermissionRequiredDialog: Waited for $waitingTime ms for the \"Dismiss\" permission button to exist")
        Log.i(TAG, "clickDismissPermissionRequiredDialog: Trying to click the \"Dismiss\" permission button")
        dismissPermissionButton().click()
        Log.i(TAG, "clickDismissPermissionRequiredDialog: Clicked the \"Dismiss\" permission button")
    }

    fun clickGoToPermissionsSettings() {
        Log.i(TAG, "clickGoToPermissionsSettings: Waiting for $waitingTime ms for the \"Go To Settings\" permission button to exist")
        goToPermissionsSettingsButton().waitForExists(waitingTime)
        Log.i(TAG, "clickGoToPermissionsSettings: Waited for $waitingTime ms for the \"Go To Settings\" permission button to exist")
        Log.i(TAG, "clickGoToPermissionsSettings: Trying to click the \"Go To Settings\" permission button")
        goToPermissionsSettingsButton().click()
        Log.i(TAG, "clickGoToPermissionsSettings: Clicked the \"Go To Settings\" permission button")
    }

    fun verifyScannerOpen() {
        Log.i(TAG, "verifyScannerOpen: Trying to verify that the device camera is opened or that the camera app error message exist")
        assertTrue(
            "$TAG: Neither the device camera was opened nor the camera app error message was displayed",
            mDevice.findObject(UiSelector().resourceId("$packageName:id/view_finder"))
                .waitForExists(waitingTime) ||
                // In case there is no camera available, an error will be shown.
                mDevice.findObject(UiSelector().resourceId("$packageName:id/camera_error"))
                    .exists(),
        )
        Log.i(TAG, "verifyScannerOpen: Verified that the device camera is opened or that the camera app error message exist")
    }

    fun typeSearch(searchTerm: String) {
        Log.i(TAG, "typeSearch: Waiting for $waitingTime ms for the edit mode toolbar to exist")
        browserToolbarEditView().waitForExists(waitingTime)
        Log.i(TAG, "typeSearch: Waited for $waitingTime ms for the edit mode toolbar to exist")
        Log.i(TAG, "typeSearch: Trying to set the edit mode toolbar text to $searchTerm")
        browserToolbarEditView().setText(searchTerm)
        Log.i(TAG, "typeSearch: Edit mode toolbar text was set to $searchTerm")
        Log.i(TAG, "typeSearch: Waiting for device to be idle")
        mDevice.waitForIdle()
        Log.i(TAG, "typeSearch: Waited for device to be idle")
    }

    fun typeSearchWithComposableToolbar(composeTestRule: ComposeTestRule, searchTerm: String) {
        Log.i(TAG, "typeSearchWithComposableToolbar: Trying to set the edit mode toolbar text to $searchTerm")
        composeTestRule.onNodeWithTag(ADDRESSBAR_SEARCH_BOX).performTextReplacement(searchTerm)
        Log.i(TAG, "typeSearchWithComposableToolbar: Edit mode toolbar text was set to $searchTerm")
    }

    fun clickClearButton() {
        Log.i(TAG, "clickClearButton: Trying to click the clear button")
        clearButton().click()
        Log.i(TAG, "clickClearButton: Clicked the clear button")
    }

    fun clickClearButtonWithComposableToolbar(composeTestRule: ComposeTestRule) {
        Log.i(TAG, "clickClearButtonWithComposableToolbar: Trying to click the clear button")
        composeTestRule.onNodeWithContentDescription(getStringResource(toolbarR.string.mozac_clear_button_description)).performClick()
        Log.i(TAG, "clickClearButtonWithComposableToolbar: Clicked the clear button")
        Log.i(TAG, "clickClearButtonWithComposableToolbar: Waiting for compose test rule to be idle")
        composeTestRule.waitForIdle()
        Log.i(TAG, "clickClearButtonWithComposableToolbar: Waited for compose test rule to be idle")
    }

    fun tapOutsideToDismissSearchBar() {
        Log.i(TAG, "tapOutsideToDismissSearchBar: Trying to perform a backward scroll action")
        // After updating UIAutomator to 2.3.0 the click action doesn't seem to dismiss anymore the awesome bar
        // On the other hand, the scroll action seems to be working properly and dismisses the awesome bar
        UiScrollable(UiSelector().resourceId("$packageName:id/search_wrapper")).scrollBackward()
        Log.i(TAG, "tapOutsideToDismissSearchBar: Performed a backward scroll action")
        Log.i(TAG, "tapOutsideToDismissSearchBar: Waiting for $waitingTime ms for the edit mode toolbar to be gone")
        browserToolbarEditView().waitUntilGone(waitingTime)
        Log.i(TAG, "tapOutsideToDismissSearchBar: Waited for $waitingTime ms for the edit mode toolbar to be gone")
    }

    fun longClickToolbar() {
        Log.i(TAG, "longClickToolbar: Waiting for $waitingTime ms for the toolbar to exist")
        mDevice.findObject(UiSelector().resourceId("$packageName:id/toolbar"))
            .waitForExists(waitingTime)
        Log.i(TAG, "longClickToolbar: Waited for $waitingTime ms for the toolbar to exist")
        Log.i(TAG, "longClickToolbar: Trying to perform long click on the toolbar")
        mDevice.findObject(By.res("$packageName:id/toolbar")).click(LONG_CLICK_DURATION)
        Log.i(TAG, "longClickToolbar: Performed long click on the toolbar")
    }

    fun clickPasteText() {
        for (i in 1..RETRY_COUNT) {
            Log.i(TAG, "clickPasteText: Started try #$i")
            try {
                Log.i(TAG, "clickPasteText: Waiting for $waitingTime ms for the \"Paste\" option to exist")
                mDevice.findObject(UiSelector().textContains("Paste")).waitForExists(waitingTime)
                Log.i(TAG, "clickPasteText: Waited for $waitingTime ms for the \"Paste\" option to exist")
                Log.i(TAG, "clickPasteText: Trying to click the \"Paste\" button")
                mDevice.findObject(By.textContains("Paste")).click()
                Log.i(TAG, "clickPasteText: Clicked the \"Paste\" button")

                break
            } catch (e: NullPointerException) {
                Log.i(TAG, "clickPasteText: NullPointerException caught, executing fallback methods")
                if (i == RETRY_COUNT) {
                    throw e
                } else {
                    searchScreen {
                    }.dismissSearchBar {
                    }.openSearch {
                        clickClearButton()
                        longClickToolbar()
                    }
                }
            }
        }
    }

    fun verifyTranslatedFocusedNavigationToolbar(toolbarHintString: String) =
        assertItemTextContains(browserToolbarEditView(), itemText = toolbarHintString)

    fun verifyTypedToolbarText(expectedText: String, exists: Boolean) =
        assertUIObjectExists(
            itemWithResIdAndText("$packageName:id/mozac_browser_toolbar_edit_url_view", expectedText),
            exists = exists,
            waitingTime = waitingTimeShort,
        )

    fun verifyTypedToolbarTextWithComposableToolbar(
        composeTestRule: ComposeTestRule,
        expectedText: String,
        exists: Boolean,
    ) {
        Log.i(TAG, "verifyTypedToolbarTextWithComposableToolbar: Verifying that text '$expectedText' exists?: $exists")

        val editToolbar = composeTestRule.onNode(
            hasTestTag(ADDRESSBAR_SEARCH_BOX) and hasText(expectedText),
            useUnmergedTree = true,
        )

        when (exists) {
            true -> editToolbar.assertIsDisplayed()
            false -> editToolbar.assertIsNotDisplayed()
        }

        Log.i(TAG, "verifyTypedToolbarTextWithComposableToolbar: Verification successful.")
    }

    fun verifySearchBarPosition(bottomPosition: Boolean) {
        Log.i(TAG, "verifySearchBarPosition: Trying to verify that the search bar is set to bottom: $bottomPosition")
        onView(withId(R.id.toolbar))
            .check(
                if (bottomPosition) {
                    PositionAssertions.isCompletelyBelow(withId(R.id.keyboard_divider))
                } else {
                    PositionAssertions.isCompletelyAbove(withId(R.id.keyboard_divider))
                },
            )
        Log.i(TAG, "verifySearchBarPosition: Verified that the search bar is set to bottom: $bottomPosition")
    }

    fun deleteSearchKeywordCharacters(numberOfDeletionSteps: Int) {
        for (i in 1..numberOfDeletionSteps) {
            Log.i(TAG, "deleteSearchKeywordCharacters: Trying to click keyboard delete button $i times")
            mDevice.pressDelete()
            Log.i(TAG, "deleteSearchKeywordCharacters: Clicked keyboard delete button $i times")
            Log.i(TAG, "deleteSearchKeywordCharacters: Waiting for $waitingTimeShort ms for $appName window to be updated")
            mDevice.waitForWindowUpdate(appName, waitingTimeShort)
            Log.i(TAG, "deleteSearchKeywordCharacters: Waited for $waitingTimeShort ms for $appName window to be updated")
        }
    }

    class Transition {
        private lateinit var sessionLoadedIdlingResource: SessionLoadedIdlingResource

        fun dismissSearchBar(interact: HomeScreenRobot.() -> Unit): HomeScreenRobot.Transition {
            for (i in 0..1) {
                try {
                    Log.i(TAG, "dismissSearchBar: Trying to click device back button")
                    mDevice.pressBack()
                    Log.i(TAG, "dismissSearchBar: Clicked device back button")
                    assertUIObjectIsGone(searchWrapper())

                    break
                } catch (e: AssertionError) {
                    if (i == 1) {
                        throw e
                    }
                }
            }

            HomeScreenRobot().interact()
            return HomeScreenRobot.Transition()
        }

        fun openBrowser(interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            Log.i(TAG, "openBrowser: Waiting for device to be idle")
            mDevice.waitForIdle()
            Log.i(TAG, "openBrowser: Waited for device to be idle")
            Log.i(TAG, "openBrowser: Trying to set the edit mode toolbar text to: mozilla")
            browserToolbarEditView().setText("mozilla\n")
            Log.i(TAG, "openBrowser: Edit mode toolbar text was set to: mozilla")
            Log.i(TAG, "openBrowser: Trying to click device enter button")
            pressImeActionOnToolbarEditView()
            Log.i(TAG, "openBrowser: Clicked device enter button")

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }

        fun submitQuery(query: String, interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            sessionLoadedIdlingResource = SessionLoadedIdlingResource()

            Log.i(TAG, "submitQuery: Trying to set the edit mode toolbar text to: $query")
            browserToolbarEditView().setText(query)
            Log.i(TAG, "submitQuery: Edit mode toolbar text was set to: $query")
            Log.i(TAG, "submitQuery: Trying to click device enter button")
            pressImeActionOnToolbarEditView()
            Log.i(TAG, "submitQuery: Clicked device enter button")

            registerAndCleanupIdlingResources(sessionLoadedIdlingResource) {
                assertUIObjectExists(itemWithResId("$packageName:id/browserLayout"))
            }

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }

        fun submitQueryWithComposableToolbar(
            composeTestRule: ComposeTestRule,
            query: String,
            interact: BrowserRobot.() -> Unit,
        ): BrowserRobot.Transition {
            Log.i(TAG, "submitQueryWithComposableToolbar: Trying to set toolbar text to: $query and pressing IME action")

            composeTestRule.onNodeWithTag(ADDRESSBAR_SEARCH_BOX).apply {
                performTextReplacement(query)
                performImeAction()
            }
            Log.i(TAG, "submitQueryWithComposableToolbar: Toolbar text was set to: $query and IME action performed")

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }

        fun clickSearchEngineSettings(interact: SettingsSubMenuSearchRobot.() -> Unit): SettingsSubMenuSearchRobot.Transition {
            Log.i(TAG, "clickSearchEngineSettings: Trying to click the \"Search settings\" button")
            searchShortcutList().getChild(UiSelector().text("Search settings")).click()
            Log.i(TAG, "clickSearchEngineSettings: Clicked the \"Search settings\" button")

            SettingsSubMenuSearchRobot().interact()
            return SettingsSubMenuSearchRobot.Transition()
        }

        fun clickSearchSuggestion(searchSuggestion: String, interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            mDevice.findObject(UiSelector().textContains(searchSuggestion)).also {
                Log.i(TAG, "clickSearchSuggestion: Waiting for $waitingTime ms for search suggestion: $searchSuggestion to exist")
                it.waitForExists(waitingTime)
                Log.i(TAG, "clickSearchSuggestion: Waited for $waitingTime ms for search suggestion: $searchSuggestion to exist")
                Log.i(TAG, "clickSearchSuggestion: Trying to click search suggestion: $searchSuggestion and wait for $waitingTimeShort ms for a new window")
                it.clickAndWaitForNewWindow(waitingTimeShort)
                Log.i(TAG, "clickSearchSuggestion: Clicked search suggestion: $searchSuggestion and waited for $waitingTimeShort ms for a new window")
            }

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }
    }
}

fun searchScreen(interact: SearchRobot.() -> Unit): SearchRobot.Transition {
    SearchRobot().interact()
    return SearchRobot.Transition()
}

private fun browserToolbarEditView() =
    mDevice.findObject(UiSelector().resourceId("$packageName:id/mozac_browser_toolbar_edit_url_view"))

private fun pressImeActionOnToolbarEditView() {
    val context = appContext
    val resId = context.resources.getIdentifier(
        "mozac_browser_toolbar_edit_url_view",
        "id",
        packageName,
    )

    Log.i(TAG, "pressImeActionOnToolbarEditView: Trying to perform pressImeActionButton via Espresso")
    onView(withId(resId))
        .perform(pressImeActionButton())
    Log.i(TAG, "pressImeActionOnToolbarEditView: Performed pressImeActionButton via Espresso")
}

private fun dismissPermissionButton() =
    mDevice.findObject(UiSelector().text("Dismiss"))

private fun goToPermissionsSettingsButton() =
    mDevice.findObject(UiSelector().text("Go to settings"))

private fun scanButton() = itemWithDescription("Scan")

private fun clearButton() =
    mDevice.findObject(UiSelector().resourceId("$packageName:id/mozac_browser_toolbar_clear_view"))

private fun searchWrapper() = mDevice.findObject(UiSelector().resourceId("$packageName:id/search_wrapper"))

private fun searchSelectorButton() = itemWithResId("$packageName:id/search_selector")

private fun searchShortcutList() =
    mDevice.findObject(UiSelector().resourceId("$packageName:id/mozac_browser_menu_recyclerView"))

private fun voiceSearchButton() = mDevice.findObject(UiSelector().description("Voice search"))
