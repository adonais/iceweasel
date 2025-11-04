/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import androidx.test.uiautomator.UiSelector
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.Config
import org.mozilla.fenix.ReleaseChannel
import org.mozilla.fenix.helpers.AppAndSystemHelper.runWithCondition
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.RetryTestRule
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.helpers.TestSetup
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.clickRateButtonGooglePlay
import org.mozilla.fenix.ui.robots.homeScreen

/**
 *  Tests for verifying the main three dot menu options
 *
 */

class SettingsAboutTest : TestSetup() {
    @get:Rule
    val activityIntentTestRule = HomeActivityIntentTestRule.withDefaultSettingsOverrides()

    @get:Rule
    val memoryLeaksRule = DetectMemoryLeaksRule()

    @Rule
    @JvmField
    val retryTestRule = RetryTestRule(3)

    // Walks through the About settings menu to ensure all items are present
    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2092700
    @Test
    fun verifyAboutSettingsItemsTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
            verifyAboutHeading()
            verifyRateOnGooglePlay()
            verifyAboutFirefoxPreview()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/246966
    @Test
    fun verifyRateOnGooglePlayButtonTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
            clickRateButtonGooglePlay()
            verifyGooglePlayRedirect()
            // press back to return to the app, or accept ToS if still visible
            mDevice.pressBack()
            dismissGooglePlayToS()
        }
    }

    @Test
    fun verifyLibrariesListInReleaseBuildsTest() {
        runWithCondition(Config.channel.isReleased) {
            homeScreen {
            }.openThreeDotMenu {
            }.openSettings {
            }.openAboutFirefoxPreview {
                verifyLibrariesUsedLink()
                verifyTheLibrariesListNotEmpty()
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3132639
    @Test
    fun verifyAboutFirefoxMenuAppDetailsItemTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openAboutFirefoxPreview {
            verifyAboutToolbar()
            verifyAboutFirefoxPreviewInfo()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3132640
    @Test
    fun verifyAboutFirefoxMenuWhatsNewInFirefoxItemTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openAboutFirefoxPreview {
            verifyAboutToolbar()
            verifyWhatIsNewInFirefoxLink()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3132641
    @Test
    fun verifyAboutFirefoxMenuSupportItemTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openAboutFirefoxPreview {
            verifyAboutToolbar()
            verifySupportLink()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3132642
    @Test
    fun verifyAboutFirefoxMenuCrashesItemTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openAboutFirefoxPreview {
            verifyAboutToolbar()
            verifyCrashesLink()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3132643
    @Test
    fun verifyAboutFirefoxMenuPrivacyNoticeItemTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openAboutFirefoxPreview {
            verifyAboutToolbar()
            verifyPrivacyNoticeLink()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3132644
    @Test
    fun verifyAboutFirefoxMenuKnowYourRightsItemTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openAboutFirefoxPreview {
            verifyAboutToolbar()
            verifyKnowYourRightsLink()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3132645
    @Test
    fun verifyAboutFirefoxMenuLicensingInformationItemTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openAboutFirefoxPreview {
            verifyAboutToolbar()
            verifyLicensingInformationLink()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3132646
    @Test
    fun verifyAboutFirefoxMenuLibrariesThatWeUseItemTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openAboutFirefoxPreview {
            verifyAboutToolbar()
            verifyLibrariesUsedLink()
        }
    }
}

private fun dismissGooglePlayToS() {
    if (mDevice.findObject(UiSelector().textContains("Terms of Service")).exists()) {
        mDevice.findObject(UiSelector().textContains("ACCEPT")).click()
    }
}
