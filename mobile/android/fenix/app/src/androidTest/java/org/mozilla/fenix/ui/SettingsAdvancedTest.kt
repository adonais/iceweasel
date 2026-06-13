/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import androidx.core.net.toUri
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.helpers.AppAndSystemHelper.assertNativeAppOpens
import org.mozilla.fenix.helpers.AppAndSystemHelper.assertYoutubeAppOpens
import org.mozilla.fenix.helpers.Constants
import org.mozilla.fenix.helpers.FenixTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.MatcherHelper.itemContainingText
import org.mozilla.fenix.helpers.MatcherHelper.itemWithText
import org.mozilla.fenix.helpers.OpenLinksInApp
import org.mozilla.fenix.helpers.TestAssetHelper
import org.mozilla.fenix.helpers.TestAssetHelper.appLinksRedirectAsset
import org.mozilla.fenix.helpers.TestAssetHelper.externalLinksAsset
import org.mozilla.fenix.helpers.TestHelper
import org.mozilla.fenix.helpers.TestHelper.exitMenu
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.helpers.TestHelper.waitForAppWindowToBeUpdated
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.clickPageObject
import org.mozilla.fenix.ui.robots.homeScreen
import org.mozilla.fenix.ui.robots.navigationToolbar
import androidx.compose.ui.test.junit4.v2.AndroidComposeTestRule as AndroidComposeTestRuleV2

/**
 *  Tests for verifying the advanced section in Settings
 *
 */

class SettingsAdvancedTest {
    private val youtubeUrlLink = itemContainingText("Youtube link")
    private val youtubeSchemaUrlLink = itemContainingText("Youtube schema link")

    private val playStoreLink = itemContainingText("Playstore link")
    private val playStoreUrl = "play.google.com"

    private val phoneUrlLink = itemContainingText("Telephone link")
    private val phoneSchemaLink = "tel://1234567890"

    @get:Rule(order = 0)
    val fenixTestRule: FenixTestRule = FenixTestRule()

    private val mockWebServer get() = fenixTestRule.mockWebServer

    @get:Rule(order = 1)
    val composeTestRule =
        AndroidComposeTestRuleV2(
            HomeActivityIntentTestRule.withDefaultSettingsOverrides(),
        ) { it.activity }

    @get:Rule(order = 2)
    val memoryLeaksRule = DetectMemoryLeaksRule(composeTestRule = { composeTestRule })

    lateinit var externalLinksPage: TestAssetHelper.TestAsset

    @Before
    fun setUp() {
        externalLinksPage = mockWebServer.externalLinksAsset
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2092699
    // Walks through settings menu and sub-menus to ensure all items are present
    @Test
    fun verifyAdvancedSettingsSectionItemsTest() {
        // ADVANCED
        homeScreen(composeTestRule) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
            verifySettingsToolbar()
            verifyAdvancedHeading()
            verifyAddons()
            verifyOpenLinksInAppsButton()
            verifySettingsOptionSummary("Open links in apps", "Ask before opening")
            verifyDownloadsButton()
            verifyLeakCanaryButton()
            // LeakCanary is disabled in UI tests.
            // See BuildConfig.LEAKCANARY.
            verifyLeakCanaryToggle(false)
            verifyRemoteDebuggingButton()
            verifyRemoteDebuggingToggle(false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2121046
    // Assumes Youtube is installed and enabled
    @SmokeTest
    @Test
    fun askBeforeOpeningOpenLinkInAppTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        exitMenu()

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, playStoreLink)
            verifyUrl(playStoreUrl)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2121052
    // Assumes Youtube is installed and enabled
    @Test
    fun privateBrowsingAskBeforeOpeningOpenLinkInAppTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, playStoreLink)
            verifyUrl(playStoreUrl)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2121045
    // Assumes Youtube is installed and enabled
    @SmokeTest
    @Test
    fun askBeforeOpeningLinkInAppCancelTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, youtubeSchemaUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "YouTube")
            clickPageObject(composeTestRule, itemContainingText("Cancel"))
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2288347
    // Assumes Youtube is installed and enabled
    @SmokeTest
    @Test
    fun askBeforeOpeningLinkInAppOpenTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, youtubeSchemaUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "YouTube")
            waitForAppWindowToBeUpdated()
            clickPageObject(composeTestRule, itemWithText("Open"))
            mDevice.waitForIdle()
            assertYoutubeAppOpens()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2121051
    // Assumes Youtube is installed and enabled
    @Test
    fun privateBrowsingAskBeforeOpeningLinkInAppCancelTest() {
        TestHelper.appContext.settings().shouldShowCookieBannersCFR = false
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        homeScreen(composeTestRule) {
        }.togglePrivateBrowsingMode()

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, youtubeSchemaUrlLink)
            verifyPrivateBrowsingOpenLinkInAnotherAppPrompt(
                appName = "YouTube",
                url = "youtube",
                pageObject = youtubeSchemaUrlLink,
            )
            clickPageObject(composeTestRule, itemContainingText("Cancel"))
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2288350
    // Assumes Youtube is installed and enabled
    @Test
    fun privateBrowsingAskBeforeOpeningLinkInAppOpenTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        homeScreen(composeTestRule) {
        }.togglePrivateBrowsingMode()

        exitMenu()

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, youtubeSchemaUrlLink)
            verifyPrivateBrowsingOpenLinkInAnotherAppPrompt(
                appName = "YouTube",
                url = "youtube",
                pageObject = youtubeSchemaUrlLink,
            )
            waitForAppWindowToBeUpdated()
            clickPageObject(composeTestRule, itemWithText("Open"))
            mDevice.waitForIdle()
            assertYoutubeAppOpens()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1058618
    // Assumes Youtube is installed and enabled
    @Test
    fun alwaysOpenLinkInAppTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ALWAYS
        }

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, youtubeSchemaUrlLink)
            mDevice.waitForIdle()
            assertYoutubeAppOpens()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1058617
    @Test
    fun dismissOpenLinksInAppCFRTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.isOpenInAppBannerEnabled = true
            it.openLinksInExternalApp = OpenLinksInApp.NEVER
        }

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser("https://m.youtube.com/".toUri()) {
            verifyPageContent("youtube")
            verifyOpenLinksInAppsCFRExists(true)
            clickOpenLinksInAppsDismissCFRButton()
            verifyOpenLinksInAppsCFRExists(false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2288331
    @Test
    fun goToSettingsFromOpenLinksInAppCFRTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.isOpenInAppBannerEnabled = true
            it.openLinksInExternalApp = OpenLinksInApp.NEVER
        }

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser("https://m.youtube.com/".toUri()) {
            verifyPageContent("youtube")
            verifyOpenLinksInAppsCFRExists(true)
        }.clickOpenLinksInAppsGoToSettingsCFRButton {
            verifyOpenLinksInAppsButton()
        }
    }

    /**
     * User setting: Never
     * For an https YouTube link, no external-app prompt is shown.
     * The page loads directly in-browser (verify “youtube.com”).
     * https://m.youtube.com/user/mozilla
     */
    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2121046
    @Test
    fun neverOpenLinkInAppTest() {
        val externalLinksPage = mockWebServer.appLinksRedirectAsset

        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.NEVER
        }

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, youtubeUrlLink)
            mDevice.waitForIdle()
            verifyOpenLinkInAnotherAppPromptIsNotShown()
            verifyUrl("youtube.com")
        }
    }

    /**
     * User setting: Always
     * For tel: links, no prompt is shown.
     * The native Phone app opens automatically with the correct URI.
     * tel://1234567890
     */
    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4026484
    @Test
    fun verifyTheAlwaysOpenPhoneLinkInAppTest() {
        val externalLinksPage = mockWebServer.appLinksRedirectAsset

        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ALWAYS
        }

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, phoneUrlLink)
            mDevice.waitForIdle()
            assertNativeAppOpens(composeTestRule, Constants.PackageName.PHONE_APP, phoneSchemaLink)
        }
    }

    /**
     * User setting: Ask
     * Verifies that the “Open in Phone” prompt appears when tapping a tel: link.
     * tel://1234567890
     */
    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4026485
    @Test
    fun askBeforeOpeningPhoneLinkPromptTest() {
        val externalLinksPage = mockWebServer.appLinksRedirectAsset

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, phoneUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "Phone")
        }
    }

    /**
     * User setting: Ask
     * Clicking a tel: link triggers the Phone prompt.
     * Tapping “Cancel” keeps the user on the same page.
     * tel://1234567890
     */
    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4026486
    @Test
    fun askBeforeOpeningLinkInAppPhoneCancelTest() {
        val externalLinksPage = mockWebServer.appLinksRedirectAsset

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, phoneUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "Phone")
            clickPageObject(composeTestRule, itemContainingText("Cancel"))
            mDevice.waitForIdle()
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    /**
     * User setting: Ask
     * When prompted for a tel: link and user taps “Open”,
     * the Phone app launches, then control returns to the same browser page.
     * tel://1234567890
     */
    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4026487
    @Test
    fun askBeforeOpeningPhoneLinkInAcceptTest() {
        val externalLinksPage = mockWebServer.appLinksRedirectAsset

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, phoneUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "Phone")
            clickPageObject(composeTestRule, itemWithText("Open"))
            mDevice.waitForIdle()
            assertNativeAppOpens(composeTestRule, Constants.PackageName.PHONE_APP, phoneSchemaLink)
            mDevice.waitForIdle()
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    /**
     * User setting: Ask
     * Verify the "Always open links in apps" checkbox appears in the prompt
     * when the setting is "Ask" and the tab is not private.
     * tel://1234567890
     */
    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4026488
    @Test
    fun askBeforeOpeningLinkCheckboxVisibleTest() {
        val externalLinksPage = mockWebServer.appLinksRedirectAsset

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(composeTestRule, phoneUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "Phone")
            verifyAppLinksPromptCheckbox(exists = true)
            clickPageObject(composeTestRule, itemContainingText("Cancel"))
        }
    }

    /**
     * User setting: Ask
     * Verify the "Always open links in apps" checkbox is NOT shown when the
     * app-links prompt appears from a private browsing tab.
     * vnd.youtube://@Mozilla
     */
    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4026490
    @Test
    fun askBeforeOpeningLinkInPrivateTabNoCheckboxTest() {
        val externalLinksPage = mockWebServer.appLinksRedirectAsset

        navigationToolbar(composeTestRule) {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
        }.openTabDrawer(composeTestRule) {
        }.toggleToPrivateTabs {
        }.openNewTab {
        }.submitQuery(externalLinksPage.url.toString()) {
            clickPageObject(composeTestRule, youtubeSchemaUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "YouTube")
            verifyAppLinksPromptCheckbox(exists = false)
            clickPageObject(composeTestRule, itemContainingText("Cancel"))
        }
    }
}
