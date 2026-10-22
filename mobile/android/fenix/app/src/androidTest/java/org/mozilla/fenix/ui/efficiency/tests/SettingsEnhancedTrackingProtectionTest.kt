/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Ignore
import org.junit.Test
import org.mozilla.fenix.customannotations.Critical
import org.mozilla.fenix.helpers.TestAssetHelper.enhancedTrackingProtectionAsset
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.helpers.TestHelper.restartApp
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.helpers.PageStateTracker
import org.mozilla.fenix.ui.efficiency.selectors.SettingsEnhancedTrackingProtectionSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSelectors
import org.mozilla.fenix.ui.efficiency.selectors.UnifiedTrustPanelSelectors

class SettingsEnhancedTrackingProtectionTest : BaseTest() {

    @Ignore(
        "Covered by verifyNavigationReachability[1: SettingsEnhancedTrackingProtectionPage (TBD) — Navigation Reachability]"
    )
    @Test
    fun verifyTheEnhancedTrackingProtectionSectionTest() {
        on.settingsEnhancedTrackingProtection.navigateToPage()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/416046
    @Critical
    @Test
    fun verifyETPSettingsItemsAndSubMenusTest() {
        on.settingsEnhancedTrackingProtection
            .navigateToPage()
            .verifySubMenuItemsDisplayed()
            .verifyProtectionLevelsEnabled(true)
            .toggleEnhancedTrackingProtection()
            .verifyProtectionLevelsEnabled(false)
            .toggleEnhancedTrackingProtection()
            .verifyProtectionLevelsEnabled(true)
            .openStandardInfoAndVerifyBlockedTrackers()
            .openStrictInfoAndVerifyBlockedTrackers()
            .openCustomInfoAndVerifyBlockedTrackers()
            .openExceptions()

        on.settingsEnhancedTrackingProtectionExceptions.verifyExceptionsDefaultView().openExceptionsLearnMoreLink()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/417444
    @Critical
    @Test
    fun verifyTrackersBlockedWithStandardTPTest() {
        val genericPage = mockWebServer.getGenericAsset(1)
        val trackingUrl = mockWebServer.enhancedTrackingProtectionAsset.url.toString()

        on.settingsEnhancedTrackingProtection.navigateToPage().verifyStandardOptionSelected()
        on.settings
            .navigateToPage()
            .mozVerify(SettingsSelectors.SETTING_OPTION_SUMMARY("Enhanced Tracking Protection", "Standard"))
        on.home.navigateToPage()

        on.browserPage.navigateToPage(genericPage.url.toString()).verifyPageContent(genericPage.content)
        on.browserPage.navigateToPage(trackingUrl)
        on.browserPage.verifyPageContentWithReload(trackingUrl, "Fingerprinting blocked")
        on.browserPage.verifyPageContentWithReload(trackingUrl, "Cryptomining blocked")

        on.unifiedTrustPanel.navigateToPage().openTrackersBlockedDetails()
        on.unifiedTrustPanel.verifyBlockedTrackerCategories(
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_CRYPTOMINERS,
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_FINGERPRINTERS,
        )
        on.unifiedTrustPanel.verifyTrackerCategoryDetails(
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_CRYPTOMINERS,
            UnifiedTrustPanelSelectors.CATEGORY_DETAIL_CRYPTOMINERS_TITLE,
        )
        on.unifiedTrustPanel.verifyTrackerCategoryDetails(
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_FINGERPRINTERS,
            UnifiedTrustPanelSelectors.CATEGORY_DETAIL_FINGERPRINTERS_TITLE,
        )
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/417441
    @Critical
    @Test
    fun verifyTrackersBlockedWithStrictTPTest() {
        val genericPage = mockWebServer.getGenericAsset(1)
        val trackingUrl = mockWebServer.enhancedTrackingProtectionAsset.url.toString()

        on.settingsEnhancedTrackingProtection
            .navigateToPage()
            .mozClick(SettingsEnhancedTrackingProtectionSelectors.STRICT_OPTION)
        on.settings
            .navigateToPage()
            .mozVerify(SettingsSelectors.SETTING_OPTION_SUMMARY("Enhanced Tracking Protection", "Strict"))
        on.home.navigateToPage()

        on.browserPage.navigateToPage(genericPage.url.toString()).verifyPageContent(genericPage.content)
        on.browserPage.navigateToPage(trackingUrl)
        on.browserPage.verifyPageContentWithReload(trackingUrl, "social blocked")
        on.browserPage.verifyPageContentWithReload(trackingUrl, "ads blocked")
        on.browserPage.verifyPageContentWithReload(trackingUrl, "analytics blocked")
        on.browserPage.verifyPageContentWithReload(trackingUrl, "Fingerprinting blocked")
        on.browserPage.verifyPageContentWithReload(trackingUrl, "Cryptomining blocked")
        on.unifiedTrustPanel.navigateToPage().openTrackersBlockedDetails()
        on.unifiedTrustPanel.verifyBlockedTrackerCategories(
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_SOCIAL_MEDIA,
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_CRYPTOMINERS,
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_FINGERPRINTERS,
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_TRACKING_CONTENT,
        )
        on.unifiedTrustPanel.verifyTrackerCategoryDetails(
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_SOCIAL_MEDIA,
            UnifiedTrustPanelSelectors.CATEGORY_DETAIL_SOCIAL_MEDIA_TITLE,
        )
        on.unifiedTrustPanel.verifyTrackerCategoryDetails(
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_CRYPTOMINERS,
            UnifiedTrustPanelSelectors.CATEGORY_DETAIL_CRYPTOMINERS_TITLE,
        )
        on.unifiedTrustPanel.verifyTrackerCategoryDetails(
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_FINGERPRINTERS,
            UnifiedTrustPanelSelectors.CATEGORY_DETAIL_FINGERPRINTERS_TITLE,
        )
        on.unifiedTrustPanel.verifyTrackerCategoryDetails(
            UnifiedTrustPanelSelectors.TRACKERS_DETAILS_TRACKING_CONTENT,
            UnifiedTrustPanelSelectors.CATEGORY_DETAIL_TRACKING_CONTENT_TITLE,
        )
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/339714
    @Critical
    @Test
    fun enablingETPOnAWebsiteRemovesItFromTheExceptionListTest() {
        val trackingPage = mockWebServer.enhancedTrackingProtectionAsset
        val trackingUrl = trackingPage.url.toString()
        val trackingHost = trackingPage.url.host.toString()
        val secondPage = "https://mozilla-mobile.github.io/testapp"

        on.browserPage.navigateToPage(trackingUrl)
        on.unifiedTrustPanel
            .navigateToPage()
            .clickTheEnhancedTrackingProtectionOption()
            .verifyEnhancedTrackingProtectionToggleState(isOn = false)
        on.settingsEnhancedTrackingProtectionExceptions
            .navigateToPage()
            .verifySiteExceptionExists(trackingHost, shouldExist = true)

        on.home.navigateToPage()
        on.browserPage.navigateToPage(trackingUrl)
        on.unifiedTrustPanel
            .navigateToPage()
            .clickTheEnhancedTrackingProtectionOption()
            .verifyEnhancedTrackingProtectionToggleState(isOn = true)
        on.settingsEnhancedTrackingProtectionExceptions
            .navigateToPage()
            .verifySiteExceptionExists(trackingHost, shouldExist = false)

        on.home.navigateToPage()
        on.browserPage.navigateToPage(secondPage).verifyPageContent("Lets test!")
        on.unifiedTrustPanel
            .navigateToPage()
            .clickTheEnhancedTrackingProtectionOption()
            .verifyEnhancedTrackingProtectionToggleState(isOn = false)

        on.home.navigateToPage()
        on.browserPage.navigateToPage(trackingUrl)
        on.unifiedTrustPanel.navigateToPage().verifyEnhancedTrackingProtectionToggleState(isOn = true)

        restartApp(composeRule.activityRule)
        PageStateTracker.reset()
        on.browserPage.navigateToPage(trackingUrl)
        on.unifiedTrustPanel.navigateToPage().verifyEnhancedTrackingProtectionToggleState(isOn = true)
    }
}
