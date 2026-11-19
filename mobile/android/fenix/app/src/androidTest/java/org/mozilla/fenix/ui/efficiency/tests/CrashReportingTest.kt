/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Test
import org.mozilla.fenix.customannotations.Critical
import org.mozilla.fenix.customannotations.SkipLeaks
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.BrowserPageSelectors
import org.mozilla.fenix.ui.efficiency.selectors.MainMenuSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SearchBarSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsAboutCrashesSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsAboutSelectors
import org.mozilla.fenix.ui.efficiency.selectors.TabDrawerSelectors

class CrashReportingTest : BaseTest() {

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1681928
    @SmokeTest
    @Test
    fun useAppWhileTabIsCrashedTest() {
        val firstWebPage = mockWebServer.getGenericAsset(1)
        val secondWebPage = mockWebServer.getGenericAsset(2)

        on.browserPage.navigateToPage(firstWebPage.url.toString()).verifyUrl(firstWebPage.url.toString())
        on.tabDrawer.navigateToPage().mozClick(TabDrawerSelectors.FAB)
        on.searchBar
            .mozEnterText(secondWebPage.url.toString(), SearchBarSelectors.TOOLBAR_IN_EDIT_MODE)
            .mozPressEnter(SearchBarSelectors.TOOLBAR_IN_EDIT_MODE)
        on.browserPage.navigateToPage().verifyUrl(secondWebPage.url.toString())
        on.browserPage
            .navigateToPage("about:crashcontent", forceNavigation = true)
            .mozVerifyElementsByGroup(BrowserPageSelectors.Group.TAB_CRASH_REPORTER)
        on.tabDrawer
            .navigateToPage()
            .mozVerify(TabDrawerSelectors.TAB_ITEM_WITH_TITLE(firstWebPage.title))
            .mozVerify(TabDrawerSelectors.TAB_ITEM_WITH_TITLE(secondWebPage.title))
        on.browserPage.navigateToPage()
        on.home.navigateToPage()
        on.mainMenu.navigateToPage().mozVerify(MainMenuSelectors.SETTINGS_BUTTON)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/308906
    @SkipLeaks(reasons = ["https://bugzilla.mozilla.org/show_bug.cgi?id=2011974"])
    @Critical
    @Test
    fun closeTabFromCrashedTabReporterTest() {
        val firstWebPage = mockWebServer.getGenericAsset(1)
        val secondWebPage = mockWebServer.getGenericAsset(2)

        on.browserPage.navigateToPage(firstWebPage.url.toString()).verifyUrl(firstWebPage.url.toString())
        on.tabDrawer.navigateToPage().mozClick(TabDrawerSelectors.FAB)
        on.searchBar
            .mozEnterText(secondWebPage.url.toString(), SearchBarSelectors.TOOLBAR_IN_EDIT_MODE)
            .mozPressEnter(SearchBarSelectors.TOOLBAR_IN_EDIT_MODE)
        on.browserPage.navigateToPage().verifyUrl(secondWebPage.url.toString())
        on.browserPage
            .navigateToPage("about:crashcontent", forceNavigation = true)
            .mozVerifyElementsByGroup(BrowserPageSelectors.Group.TAB_CRASH_REPORTER)
            .mozClick(BrowserPageSelectors.TAB_CRASH_REPORTER_CLOSE_BUTTON)
        on.browserPage.verifyPageContent(firstWebPage.content)
        on.settingsAbout
            .navigateToPage()
            .mozClick(SettingsAboutSelectors.CRASHES_BUTTON)
            // The crash row is bound asynchronously (Room LiveData -> RecyclerView), so its fields appear
            // together only once that bind lands. Verify each selector independently rather than via
            // mozVerifyElementsByGroup: separate polls wait in turn (absorbing the async render), while a group
            // check requires all selectors present within a single shared window and races the population.
            .mozVerify(SettingsAboutCrashesSelectors.CRASH_ID)
            .mozVerify(SettingsAboutCrashesSelectors.CRASH_TITLE)
            .mozVerify(SettingsAboutCrashesSelectors.CRASH_FOOTER)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2336134
    @SkipLeaks(reasons = ["https://bugzilla.mozilla.org/show_bug.cgi?id=2011974"])
    @Critical
    @Test
    fun restoreTabFromTabCrashedReporterTest() {
        val firstWebPage = mockWebServer.getGenericAsset(1)
        val secondWebPage = mockWebServer.getGenericAsset(2)

        on.browserPage.navigateToPage(firstWebPage.url.toString()).verifyUrl(firstWebPage.url.toString())
        on.tabDrawer.navigateToPage().mozClick(TabDrawerSelectors.FAB)
        on.searchBar
            .mozEnterText(secondWebPage.url.toString(), SearchBarSelectors.TOOLBAR_IN_EDIT_MODE)
            .mozPressEnter(SearchBarSelectors.TOOLBAR_IN_EDIT_MODE)
        on.browserPage.navigateToPage().verifyUrl(secondWebPage.url.toString())
        on.browserPage
            .navigateToPage("about:crashcontent", forceNavigation = true)
            .mozVerifyElementsByGroup(BrowserPageSelectors.Group.TAB_CRASH_REPORTER)
            .mozClick(BrowserPageSelectors.TAB_CRASH_REPORTER_RESTORE_BUTTON)
        on.browserPage.verifyPageContent(secondWebPage.content)
        on.settingsAbout
            .navigateToPage()
            .mozClick(SettingsAboutSelectors.CRASHES_BUTTON)
            // The crash row is bound asynchronously (Room LiveData -> RecyclerView), so its fields appear
            // together only once that bind lands. Verify each selector independently rather than via
            // mozVerifyElementsByGroup: separate polls wait in turn (absorbing the async render), while a group
            // check requires all selectors present within a single shared window and races the population.
            .mozVerify(SettingsAboutCrashesSelectors.CRASH_ID)
            .mozVerify(SettingsAboutCrashesSelectors.CRASH_TITLE)
            .mozVerify(SettingsAboutCrashesSelectors.CRASH_FOOTER)
    }
}
