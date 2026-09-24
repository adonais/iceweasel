/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Test
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.SettingsAboutSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSelectors

class SettingsAboutTest : BaseTest() {

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/2092700
    @Test
    fun verifyAboutSettingsItemsTest() {
        on.settings.navigateToPage().mozVerifyElementsByGroup(SettingsSelectors.Group.ABOUT_SECTION)
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/246966
    @Test
    fun verifyRateOnGooglePlayButtonTest() {
        on.settings.navigateToPage().mozVerifyElementsByGroup(SettingsSelectors.Group.GOOGLE_PLAY)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3132646
    @Test
    fun verifyLibrariesListInReleaseBuildsTest() {
        on.settingsAbout
            .navigateToPage()
            .mozVerifyElementsByGroup(SettingsAboutSelectors.Group.LIBRARIES_THAT_WE_USE)
            .mozVerifyElementsByGroup(SettingsAboutSelectors.Group.ABOUT_INFO)
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3132639
    @Test
    fun verifyAboutFirefoxMenuAppDetailsItemTest() {
        on.settingsAbout.navigateToPage().mozVerifyElementsByGroup(SettingsAboutSelectors.Group.ABOUT_INFO)
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3132640
    @Test
    fun verifyAboutFirefoxMenuWhatsNewInFirefoxItemTest() {
        on.settingsAbout.navigateToPage().mozVerifyElementsByGroup(SettingsAboutSelectors.Group.WHATS_NEW)
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3132641
    @Test
    fun verifyAboutFirefoxMenuSupportItemTest() {
        on.settingsAbout.navigateToPage().mozVerifyElementsByGroup(SettingsAboutSelectors.Group.SUPPORT_ITEM)
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3132642
    @Test
    fun verifyAboutFirefoxMenuCrashesItemTest() {
        on.settingsAbout.navigateToPage().mozVerifyElementsByGroup(SettingsAboutSelectors.Group.CRASHES)
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3132643
    @Test
    fun verifyAboutFirefoxMenuPrivacyNoticeItemTest() {
        on.settingsAbout.navigateToPage().mozVerifyElementsByGroup(SettingsAboutSelectors.Group.PRIVACY_NOTICE)
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3132644
    @Test
    fun verifyAboutFirefoxMenuKnowYourRightsItemTest() {
        on.settingsAbout.navigateToPage().mozVerifyElementsByGroup(SettingsAboutSelectors.Group.KNOW_YOUR_RIGHTS)
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3132645
    @Test
    fun verifyAboutFirefoxMenuLicensingInformationItemTest() {
        on.settingsAbout.navigateToPage().mozVerifyElementsByGroup(SettingsAboutSelectors.Group.LICENSING_INFORMATION)
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3132646
    @Test
    fun verifyAboutFirefoxMenuLibrariesThatWeUseItemTest() {
        on.settingsAbout.navigateToPage().mozVerifyElementsByGroup(SettingsAboutSelectors.Group.LIBRARIES_THAT_WE_USE)
    }
}
