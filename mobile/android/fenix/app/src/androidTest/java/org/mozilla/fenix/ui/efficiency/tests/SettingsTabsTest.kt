/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Ignore
import org.junit.Test
import org.mozilla.fenix.customannotations.Critical
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.SettingsTabsSelectors
import org.mozilla.fenix.ui.efficiency.selectors.TabDrawerSelectors

class SettingsTabsTest : BaseTest() {

    @Ignore("Covered by verifyNavigationReachability[1: SettingsTabsPage (TBD) — Navigation Reachability]")
    @Test
    fun verifySettingsTabsLoadsTest() {
        on.settingsTabs.navigateToPage()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4227411
    @Critical
    @Test
    fun verifyThePrivacyReportItemTest() {
        val website = mockWebServer.getGenericAsset(1)

        on.settingsTabs
            .navigateToPage()
            .mozVerifyOptionSwitchIsChecked(SettingsTabsSelectors.ENABLE_PRIVACY_REPORT_OPTION)
            .mozClick(SettingsTabsSelectors.ENABLE_PRIVACY_REPORT_OPTION)
            .mozVerifyOptionSwitchIsNotChecked(SettingsTabsSelectors.ENABLE_PRIVACY_REPORT_OPTION)
        on.browserPage.navigateToPage(website.url.toString())
        on.tabDrawer.navigateToPage().mozVerifyElementAbsent(TabDrawerSelectors.TRACKERS_BLOCKED_DASHBOARD_PILL)
        on.home.navigateToPage()
        on.settingsTabs
            .navigateToPage()
            .mozVerifyOptionSwitchIsNotChecked(SettingsTabsSelectors.ENABLE_PRIVACY_REPORT_OPTION)
            .mozClick(SettingsTabsSelectors.ENABLE_PRIVACY_REPORT_OPTION)
            .mozVerifyOptionSwitchIsChecked(SettingsTabsSelectors.ENABLE_PRIVACY_REPORT_OPTION)
        on.tabDrawer.navigateToPage().mozVerify(TabDrawerSelectors.TRACKERS_BLOCKED_DASHBOARD_PILL)
    }
}
