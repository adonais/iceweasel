/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Ignore
import org.junit.Test
import org.mozilla.fenix.customannotations.Critical
import org.mozilla.fenix.helpers.TestAssetHelper.enhancedTrackingProtectionAsset
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.SettingsEnhancedTrackingProtectionExceptionsSelectors as ETPExceptions

class SettingsEnhancedTrackingProtectionExceptionsTest : BaseTest() {

    @Ignore(
        "Covered by verifyNavigationReachability[1: SettingsEnhancedTrackingProtectionExceptionsPage (TBD) — Navigation Reachability]"
    )
    @Test
    fun verifyTheEnhancedTrackingProtectionExceptionsSectionTest() {
        on.settingsEnhancedTrackingProtectionExceptions.navigateToPage()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/339713
    // Local tracking asset stands in for the external senglehardt.com URL.
    @Critical
    @Test
    fun clearWebsitesFromTheETPExceptionsListTest() {
        val trackingPage = mockWebServer.enhancedTrackingProtectionAsset
        val trackingUrl = trackingPage.url.toString()
        val trackingHost = trackingPage.url.host.toString()

        on.browserPage.navigateToPage(trackingUrl)
        on.unifiedTrustPanel
            .navigateToPage()
            .clickTheEnhancedTrackingProtectionOption()
            .verifyEnhancedTrackingProtectionToggleState(isOn = false)

        on.settingsEnhancedTrackingProtectionExceptions
            .navigateToPage()
            .verifySiteExceptionExists(trackingHost, shouldExist = true)
        on.settingsEnhancedTrackingProtectionExceptions.mozClick(ETPExceptions.REMOVE_SITE_BUTTON)
        on.settingsEnhancedTrackingProtectionExceptions.verifySiteExceptionExists(trackingHost, shouldExist = false)

        on.home.navigateToPage()
        on.browserPage.navigateToPage(trackingUrl)
        on.unifiedTrustPanel.navigateToPage().verifyEnhancedTrackingProtectionToggleState(isOn = true)
    }
}
