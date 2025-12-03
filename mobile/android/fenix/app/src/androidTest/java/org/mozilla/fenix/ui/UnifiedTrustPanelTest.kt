/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:Suppress("DEPRECATION")

package org.mozilla.fenix.ui

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.core.net.toUri
import androidx.test.rule.ActivityTestRule
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.IntentReceiverActivity
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.helpers.DataGenerationHelper.createCustomTabIntent
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.TestAssetHelper.enhancedTrackingProtectionAsset
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.helpers.TestAssetHelper.waitingTimeLong
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.helpers.TestSetup
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.browserScreen
import org.mozilla.fenix.ui.robots.customTabScreen
import org.mozilla.fenix.ui.robots.navigationToolbar

class UnifiedTrustPanelTest : TestSetup() {
    @get:Rule
    val composeTestRule =
        AndroidComposeTestRule(
            HomeActivityIntentTestRule(
                isUnifiedTrustPanelEnabled = true,
                isComposableToolbarEnabled = false,
                isPWAsPromptEnabled = false,
            ),
        ) { it.activity }

    @get:Rule
    val intentReceiverActivityTestRule = ActivityTestRule(
        IntentReceiverActivity::class.java,
        true,
        false,
    )

    @get:Rule
    val memoryLeaksRule = DetectMemoryLeaksRule()

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3186718
    @SmokeTest
    @Test
    fun verifySecurePageConnectionFromQuickSettingsWithNoTrackersTest() {
        val firstPage = "https://mozilla-mobile.github.io/testapp"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(firstPage.toUri()) {
            verifyPageContent("Lets test!")
        }
        navigationToolbar {
        }.openUnifiedTrustPanel {
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = "Test App",
                webSiteURL = firstPage.toUri().host.toString(),
                isTheWebSiteSecure = true,
                isEnhancedTrackingProtectionEnabled = true,
                isTrackerBlockingEnabled = true,
                areTrackersBlocked = false,
                )
            clickTheEnhancedTrackingProtectionOption(composeTestRule)
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = "Test App",
                webSiteURL = firstPage.toUri().host.toString(),
                isEnhancedTrackingProtectionEnabled = false,
                isTheWebSiteSecure = true,
                isTrackerBlockingEnabled = false,
                areTrackersBlocked = false,
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3186721
    @SmokeTest
    @Test
    fun verifyInsecurePageConnectionFromQuickSettingsWithTrackersTest() {
        appContext.settings().setStrictETP()
        val genericPage = mockWebServer.getGenericAsset(1)
        val trackingProtectionPage = mockWebServer.enhancedTrackingProtectionAsset.url

        // browsing a generic page to allow GV to load on a fresh run
        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericPage.url) {
        }.openTabDrawer(composeTestRule) {
            closeTab()
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(trackingProtectionPage) {
            verifyTrackingProtectionWebContent("social blocked")
            verifyTrackingProtectionWebContent("ads blocked")
            verifyTrackingProtectionWebContent("analytics blocked")
            verifyTrackingProtectionWebContent("Fingerprinting blocked")
            verifyTrackingProtectionWebContent("Cryptomining blocked")
        }
        navigationToolbar {
        }.openUnifiedTrustPanel {
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = trackingProtectionPage.host.toString(),
                webSiteURL = trackingProtectionPage.host.toString(),
                isTheWebSiteSecure = false,
                isEnhancedTrackingProtectionEnabled = true,
                isTrackerBlockingEnabled = true,
                areTrackersBlocked = true,
            )
            clickTheEnhancedTrackingProtectionOption(composeTestRule)
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = trackingProtectionPage.host.toString(),
                webSiteURL = trackingProtectionPage.host.toString(),
                isTheWebSiteSecure = false,
                isEnhancedTrackingProtectionEnabled = false,
                isTrackerBlockingEnabled = false,
                areTrackersBlocked = false,
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3186723
    @SmokeTest
    @Test
    fun verifyClearCookiesAndSiteDataFromQuickSettingsTest() {
        val loginPage = "https://mozilla-mobile.github.io/testapp/loginForm"
        val originWebsite = "mozilla-mobile.github.io"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            waitForPageToLoad(waitingTimeLong)
        }
        navigationToolbar {
        }.openUnifiedTrustPanel {
            clickTheClearCookiesAndSiteDataButton(composeTestRule)
            verifyTheClearCookiesAndSiteDataDialog(composeTestRule, originWebsite)
        }
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3186719
    @Test
    fun verifySecurePageConnectionFromQuickSettingsWithTrackersTest() {
        appContext.settings().setStrictETP()
        val genericPage = mockWebServer.getGenericAsset(1)
        val trackingProtectionPage = "https://senglehardt.com/test/trackingprotection/test_pages/tracking_protection"

        // browsing a generic page to allow GV to load on a fresh run
        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericPage.url) {
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(trackingProtectionPage.toUri()) {
            verifyPageContent("Tracker Blocking")
        }
        navigationToolbar {
        }.openUnifiedTrustPanel {
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = trackingProtectionPage.toUri().host.toString(),
                webSiteURL = trackingProtectionPage.toUri().host.toString(),
                isTheWebSiteSecure = true,
                isEnhancedTrackingProtectionEnabled = true,
                isTrackerBlockingEnabled = true,
                areTrackersBlocked = true,
            )
            clickTheEnhancedTrackingProtectionOption(composeTestRule)
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = trackingProtectionPage.toUri().host.toString(),
                webSiteURL = trackingProtectionPage.toUri().host.toString(),
                isEnhancedTrackingProtectionEnabled = false,
                isTheWebSiteSecure = true,
                isTrackerBlockingEnabled = false,
                areTrackersBlocked = true,
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3186720
    @Test
    fun verifyInsecurePageConnectionFromQuickSettingsWithNoTrackersTest() {
        val genericPage = mockWebServer.getGenericAsset(1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericPage.url) {
            verifyPageContent(genericPage.content)
        }
        navigationToolbar {
        }.openUnifiedTrustPanel {
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = genericPage.title,
                webSiteURL = genericPage.url.host.toString(),
                isTheWebSiteSecure = false,
                isEnhancedTrackingProtectionEnabled = true,
                isTrackerBlockingEnabled = true,
                areTrackersBlocked = false,
            )
            clickTheEnhancedTrackingProtectionOption(composeTestRule)
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = genericPage.title,
                webSiteURL = genericPage.url.host.toString(),
                isTheWebSiteSecure = false,
                isEnhancedTrackingProtectionEnabled = false,
                isTrackerBlockingEnabled = false,
                areTrackersBlocked = false,
            )
        }
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3186709
    @Test
    fun verifySecurePageConnectionFromQuickSettingsWithNoTrackersInCustomTabsTest() {
        val customTabPage = "https://mozilla-mobile.github.io/testapp"

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                pageUrl = customTabPage,
            ),
        )

        browserScreen {
            verifyPageContent("Lets test!")
        }

        customTabScreen {
        }.openUnifiedTrustPanel {
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = "Test App",
                webSiteURL = customTabPage.toUri().host.toString(),
                isTheWebSiteSecure = true,
                isEnhancedTrackingProtectionEnabled = true,
                isTrackerBlockingEnabled = true,
                areTrackersBlocked = false,
            )
            clickTheEnhancedTrackingProtectionOption(composeTestRule)
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = "Test App",
                webSiteURL = customTabPage.toUri().host.toString(),
                isEnhancedTrackingProtectionEnabled = false,
                isTheWebSiteSecure = true,
                isTrackerBlockingEnabled = false,
                areTrackersBlocked = false,
            )
        }
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3186710
    @SmokeTest
    @Test
    fun verifySecurePageConnectionFromQuickSettingsWithTrackersInCustomTabsTest() {
        appContext.settings().setStrictETP()
        val genericPage = mockWebServer.getGenericAsset(1)
        val customTabPage = "https://senglehardt.com/test/trackingprotection/test_pages/tracking_protection"

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                pageUrl = genericPage.url.toString(),
            ),
        )

        browserScreen {
            verifyPageContent(genericPage.content)
        }

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                pageUrl = customTabPage,
            ),
        )

        customTabScreen {
            verifyCustomTabUrl(customTabPage.toUri().host.toString())
        }
        customTabScreen {
        }.openUnifiedTrustPanel {
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = customTabPage.toUri().host.toString(),
                webSiteURL = customTabPage.toUri().host.toString(),
                isTheWebSiteSecure = true,
                isEnhancedTrackingProtectionEnabled = true,
                isTrackerBlockingEnabled = true,
                areTrackersBlocked = true,
            )
            clickTheEnhancedTrackingProtectionOption(composeTestRule)
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = customTabPage.toUri().host.toString(),
                webSiteURL = customTabPage.toUri().host.toString(),
                isEnhancedTrackingProtectionEnabled = false,
                isTheWebSiteSecure = true,
                isTrackerBlockingEnabled = false,
                areTrackersBlocked = true,
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3186711
    @SmokeTest
    @Test
    fun verifyInsecurePageConnectionFromQuickSettingsWithNoTrackersInCustomTabsTest() {
        val customTabPage = mockWebServer.getGenericAsset(1)

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                pageUrl = customTabPage.url.toString(),
            ),
        )

        browserScreen {
            verifyPageContent(customTabPage.content)
        }

        customTabScreen {
        }.openUnifiedTrustPanel {
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = customTabPage.title,
                webSiteURL = customTabPage.url.host.toString(),
                isTheWebSiteSecure = false,
                isEnhancedTrackingProtectionEnabled = true,
                isTrackerBlockingEnabled = true,
                areTrackersBlocked = false,
            )
            clickTheEnhancedTrackingProtectionOption(composeTestRule)
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = customTabPage.title,
                webSiteURL = customTabPage.url.host.toString(),
                isTheWebSiteSecure = false,
                isEnhancedTrackingProtectionEnabled = false,
                isTrackerBlockingEnabled = false,
                areTrackersBlocked = false,
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3186714
    @SmokeTest
    @Test
    fun verifyClearCookiesAndSiteDataFromQuickSettingsInCustomTabsTest() {
        val customTabPage = "https://mozilla-mobile.github.io/testapp/loginForm"
        val originWebsite = "mozilla-mobile.github.io"

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                pageUrl = customTabPage,
            ),
        )

        customTabScreen {
            waitForPageToLoad(waitingTimeLong)
        }.openUnifiedTrustPanel {
            clickTheClearCookiesAndSiteDataButton(composeTestRule)
            verifyTheClearCookiesAndSiteDataDialog(composeTestRule, originWebsite)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3186712
    @Test
    fun verifyInsecurePageConnectionFromQuickSettingsWithTrackersInCustomTabsTest() {
        appContext.settings().setStrictETP()

        val customTabPage = mockWebServer.enhancedTrackingProtectionAsset.url

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                pageUrl = customTabPage.toString(),
            ),
        )

        browserScreen {
            verifyTrackingProtectionWebContent("social blocked")
            verifyTrackingProtectionWebContent("ads blocked")
            verifyTrackingProtectionWebContent("analytics blocked")
            verifyTrackingProtectionWebContent("Fingerprinting blocked")
            verifyTrackingProtectionWebContent("Cryptomining blocked")
        }
        customTabScreen {
        }.openUnifiedTrustPanel {
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = customTabPage.host.toString(),
                webSiteURL = customTabPage.host.toString(),
                isTheWebSiteSecure = false,
                isEnhancedTrackingProtectionEnabled = true,
                isTrackerBlockingEnabled = true,
                areTrackersBlocked = true,
            )
            clickTheEnhancedTrackingProtectionOption(composeTestRule)
            verifyUnifiedTrustPanelItems(
                composeTestRule = composeTestRule,
                webSite = customTabPage.host.toString(),
                webSiteURL = customTabPage.host.toString(),
                isTheWebSiteSecure = false,
                isEnhancedTrackingProtectionEnabled = false,
                isTrackerBlockingEnabled = false,
                areTrackersBlocked = false,
            )
        }
    }
}
