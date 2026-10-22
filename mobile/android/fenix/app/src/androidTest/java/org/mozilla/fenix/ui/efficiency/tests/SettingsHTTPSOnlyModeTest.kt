/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Ignore
import org.junit.Test
import org.mozilla.fenix.customannotations.Critical
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest

class SettingsHTTPSOnlyModeTest : BaseTest() {

    @Ignore("Covered by verifyNavigationReachability[1: SettingsHTTPSOnlyModePage (TBD) — Navigation Reachability]")
    @Test
    fun verifyTheHTTPSOnlyModeSectionTest() {
        on.settingsHTTPSOnlyMode.navigateToPage()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1724825
    @Critical
    @Test
    fun httpsOnlyModeMenuItemsTest() {
        on.settingsHTTPSOnlyMode
            .navigateToPage()
            .verifyHttpsOnlyModeMenuHeader()
            .verifyHttpsOnlyModeSummary()
            .verifyHttpsOnlyModeToggle(enabled = false)
            .verifyHttpsOnlyModeOptionsEnabled(enabled = false)
            .verifyNoHttpsOnlyModeOptionSelected()
            .enableHttpsOnlyMode()
            .verifyHttpsOnlyModeToggle(enabled = true)
            .verifyHttpsOnlyModeOptionsEnabled(enabled = true)
            .verifyHttpsOnlyAllTabsSelected()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1724827
    @SmokeTest
    @Test
    fun httpsOnlyModeEnabledInNormalBrowsingTest() {
        on.settingsHTTPSOnlyMode.navigateToPage().enableHttpsOnlyMode().verifyHttpsOnlyAllTabsSelected()

        on.settings.navigateToPage().verifyHttpsOnlyModeOnAllTabs()

        on.home.navigateToPage()

        on.browserPage
            .navigateToPage("http://permission.site/")
            .verifyPageContentWithReload("http://permission.site/", "permission.site")

        on.searchBar.navigateToPage().verifyUrl("https://permission.site/")

        on.browserPage
            .navigateToPage("http.badssl.com")
            .verifyHttpsOnlyErrorPage()
            .goBackFromHttpsError()
            .verifyPageContentWithReload("http://permission.site/", "permission.site")

        on.searchBar.navigateToPage()
        on.browserPage.navigateToPage("http.badssl.com").continueToHttpSite().verifyPageContent("http.badssl.com")
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2091057
    @Critical
    @Test
    fun httpsOnlyModeExceptionPersistsForCurrentSessionTest() {
        on.settingsHTTPSOnlyMode
            .navigateToPage()
            .enableHttpsOnlyMode()
            .verifyHttpsOnlyModeToggle(enabled = true)
            .verifyHttpsOnlyModeOptionsEnabled(enabled = true)
            .verifyHttpsOnlyAllTabsSelected()
        on.browserPage
            .navigateToPage("http.badssl.com")
            .verifyPageContent("Secure site not available")
            .clickPageContent("Continue to HTTP Site")
            .verifyPageContent("http.badssl.com")
        on.tabDrawer.navigateToPage().closeAllTabs()
        on.home.navigateToPage()
        on.browserPage.navigateToPage("http.badssl.com").verifyPageContent("http.badssl.com")
    }
}
