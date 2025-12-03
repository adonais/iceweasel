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
import org.mozilla.fenix.helpers.AppAndSystemHelper.assertYoutubeAppOpens
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.MatcherHelper.itemContainingText
import org.mozilla.fenix.helpers.MatcherHelper.itemWithResIdAndText
import org.mozilla.fenix.helpers.OpenLinksInApp
import org.mozilla.fenix.helpers.TestAssetHelper
import org.mozilla.fenix.helpers.TestAssetHelper.externalLinksAsset
import org.mozilla.fenix.helpers.TestHelper
import org.mozilla.fenix.helpers.TestHelper.exitMenu
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.helpers.TestHelper.waitForAppWindowToBeUpdated
import org.mozilla.fenix.helpers.TestSetup
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.clickPageObject
import org.mozilla.fenix.ui.robots.homeScreen
import org.mozilla.fenix.ui.robots.navigationToolbar

/**
 *  Tests for verifying the advanced section in Settings
 *
 */

class SettingsAdvancedTest : TestSetup() {
    private val youTubeSchemaLink = itemContainingText("Youtube schema link")
    private val playStoreLink = itemContainingText("Playstore link")
    private val playStoreUrl = "play.google.com"

    @get:Rule
    val activityIntentTestRule = HomeActivityIntentTestRule.withDefaultSettingsOverrides()

    @get:Rule
    val memoryLeaksRule = DetectMemoryLeaksRule()

    lateinit var externalLinksPage: TestAssetHelper.TestAsset

    @Before
    override fun setUp() {
        super.setUp()
        externalLinksPage = mockWebServer.externalLinksAsset
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2092699
    // Walks through settings menu and sub-menus to ensure all items are present
    @Test
    fun verifyAdvancedSettingsSectionItemsTest() {
        // ADVANCED
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
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
        activityIntentTestRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        exitMenu()

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(playStoreLink)
            verifyUrl(playStoreUrl)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2121052
    // Assumes Youtube is installed and enabled
    @Test
    fun privateBrowsingAskBeforeOpeningOpenLinkInAppTest() {
        activityIntentTestRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(playStoreLink)
            verifyUrl(playStoreUrl)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2121045
    // Assumes Youtube is installed and enabled
    @SmokeTest
    @Test
    fun askBeforeOpeningLinkInAppCancelTest() {
        activityIntentTestRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(youTubeSchemaLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "YouTube")
            clickPageObject(itemWithResIdAndText("android:id/button2", "Cancel"))
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2288347
    // Assumes Youtube is installed and enabled
    @SmokeTest
    @Test
    fun askBeforeOpeningLinkInAppOpenTest() {
        activityIntentTestRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(youTubeSchemaLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "YouTube")
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResIdAndText("android:id/button1", "Open"))
            mDevice.waitForIdle()
            assertYoutubeAppOpens()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2121051
    // Assumes Youtube is installed and enabled
    @Test
    fun privateBrowsingAskBeforeOpeningLinkInAppCancelTest() {
        TestHelper.appContext.settings().shouldShowCookieBannersCFR = false
        activityIntentTestRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        homeScreen {
        }.togglePrivateBrowsingMode()

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(youTubeSchemaLink)
            verifyPrivateBrowsingOpenLinkInAnotherAppPrompt(
                appName = "YouTube",
                url = "youtube",
                pageObject = youTubeSchemaLink,
            )
            clickPageObject(itemWithResIdAndText("android:id/button2", "Cancel"))
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2288350
    // Assumes Youtube is installed and enabled
    @Test
    fun privateBrowsingAskBeforeOpeningLinkInAppOpenTest() {
        activityIntentTestRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ASK
        }

        homeScreen {
        }.togglePrivateBrowsingMode()

        exitMenu()

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(youTubeSchemaLink)
            verifyPrivateBrowsingOpenLinkInAnotherAppPrompt(
                appName = "YouTube",
                url = "youtube",
                pageObject = youTubeSchemaLink,
            )
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResIdAndText("android:id/button1", "Open"))
            mDevice.waitForIdle()
            assertYoutubeAppOpens()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1058618
    // Assumes Youtube is installed and enabled
    @Test
    fun alwaysOpenLinkInAppTest() {
        activityIntentTestRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ALWAYS
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(youTubeSchemaLink)
            mDevice.waitForIdle()
            assertYoutubeAppOpens()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1058617
    @Test
    fun dismissOpenLinksInAppCFRTest() {
        activityIntentTestRule.applySettingsExceptions {
            it.isOpenInAppBannerEnabled = true
            it.openLinksInExternalApp = OpenLinksInApp.NEVER
        }

        navigationToolbar {
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
        activityIntentTestRule.applySettingsExceptions {
            it.isOpenInAppBannerEnabled = true
            it.openLinksInExternalApp = OpenLinksInApp.NEVER
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser("https://m.youtube.com/".toUri()) {
            verifyPageContent("youtube")
            verifyOpenLinksInAppsCFRExists(true)
        }.clickOpenLinksInAppsGoToSettingsCFRButton {
            verifyOpenLinksInAppsButton()
        }
    }
}
