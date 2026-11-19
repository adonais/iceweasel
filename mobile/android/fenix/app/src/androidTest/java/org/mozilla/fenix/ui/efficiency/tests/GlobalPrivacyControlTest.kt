/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Test
import org.mozilla.fenix.customannotations.Critical
import org.mozilla.fenix.helpers.TestAssetHelper.gcpTestAsset
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.SettingsEnhancedTrackingProtectionSelectors as ETP

class GlobalPrivacyControlTest : BaseTest() {

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2429327
    @Critical
    @Test
    fun verifyGlobalPrivacyControlInNormalBrowsingTest() {
        val gpcPage = mockWebServer.gcpTestAsset

        on.settingsEnhancedTrackingProtection
            .navigateToPage()
            .mozVerifyOptionSwitchIsNotChecked(ETP.GLOBAL_PRIVACY_CONTROL_TOGGLE)
            .mozSwipeTo(ETP.ENHANCED_TRACKING_PROTECTION_SUMMARY)
        on.settings.navigateToPage()
        on.home.navigateToPage()
        on.browserPage.navigateToPage(gpcPage.url.toString()).verifyPageContent("GPC not enabled.")

        on.settingsEnhancedTrackingProtection
            .navigateToPage()
            .mozClick(ETP.GLOBAL_PRIVACY_CONTROL_TOGGLE)
            .mozVerifyOptionSwitchIsChecked(ETP.GLOBAL_PRIVACY_CONTROL_TOGGLE)
            .mozSwipeTo(ETP.ENHANCED_TRACKING_PROTECTION_SUMMARY)
        on.settings.navigateToPage()
        on.browserPage
            .navigateToPage(gpcPage.url.toString(), forceNavigation = true)
            .verifyPageContent("GPC is enabled.")
    }
}
