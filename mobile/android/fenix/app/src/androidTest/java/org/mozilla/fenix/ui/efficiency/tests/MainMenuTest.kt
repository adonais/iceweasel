/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Ignore
import org.junit.Test
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.BookmarksSelectors
import org.mozilla.fenix.ui.efficiency.selectors.BrowserPageSelectors
import org.mozilla.fenix.ui.efficiency.selectors.HomeSelectors
import org.mozilla.fenix.ui.efficiency.selectors.MainMenuSelectors

class MainMenuTest : BaseTest() {

    private val mockWebServer get() = fenixTestRule.mockWebServer

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080168
    @SmokeTest
    @Test
    fun verifyMainMenuItemsTest() {
        on.mainMenu.navigateToPage()
            .mozVerifyElementsByGroup("homeBanner")
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080172
    @SmokeTest
    @Test
    fun verifyTheExtensionsMenuOptionTest() {
        on.settingsAddonsManager.navigateToPage()
            .mozVerifyElementsByGroup("addOns")
        on.home.navigateToPage()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080181
    @SmokeTest
    @Ignore("Covered by verifyNavigationReachability[1: SettingsHomepagePage (TBD) — Navigation Reachability]")
    @Test
    fun verifyTheHomePageSettingsMenuItemTest() {
        on.settings.navigateToPage()
        on.home.navigateToPage()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080129
    @SmokeTest
    @Test
    fun verifyBookmarkPageMenuOptionTest() {
        val testPage = mockWebServer.getGenericAsset(1)
        on.browserPage.navigateToPage(testPage.url.toString())
            .mozClick(HomeSelectors.MAIN_MENU_BUTTON_UIAUTOMATOR)
            .mozClick(MainMenuSelectors.BOOKMARK_THIS_PAGE_BUTTON)
            .mozClick(BrowserPageSelectors.SNACKBAR_EDIT_BUTTON)
        on.bookmarks
            .mozVerifyElementsByGroup("bookmarkEdit")
            .mozClick(BookmarksSelectors.DELETE_BOOKMARK_BUTTON)
        on.browserPage
            .mozClick(HomeSelectors.MAIN_MENU_BUTTON_UIAUTOMATOR)
        on.mainMenu
            .mozVerifyElementsByGroup("bookmarkActions")
    }
}
