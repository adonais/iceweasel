package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Test
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.MainMenuSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SearchBarSelectors
import org.mozilla.fenix.ui.efficiency.selectors.TabDrawerSelectors

class CrashReportingTest : BaseTest() {

    private val mockWebServer get() = fenixTestRule.mockWebServer

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1681928
    @SmokeTest
    @Test
    fun useAppWhileTabIsCrashedTest() {
        val firstWebPage = mockWebServer.getGenericAsset(1)
        val secondWebPage = mockWebServer.getGenericAsset(2)

        on.browserPage.navigateToPage(firstWebPage.url.toString())
            .verifyUrl(firstWebPage.url.toString())
        on.tabDrawer.navigateToPage()
            .mozClick(TabDrawerSelectors.FAB)
        on.searchBar
            .mozEnterText(secondWebPage.url.toString(), SearchBarSelectors.TOOLBAR_IN_EDIT_MODE)
            .mozPressEnter(SearchBarSelectors.TOOLBAR_IN_EDIT_MODE)
        on.browserPage.navigateToPage()
            .verifyUrl(secondWebPage.url.toString())
        on.browserPage.navigateToPage("about:crashcontent", forceNavigation = true)
            .mozVerifyElementsByGroup("tabCrashReporter")
        on.tabDrawer.navigateToPage()
            .mozVerify(TabDrawerSelectors.TAB_ITEM_WITH_TITLE(firstWebPage.title))
            .mozVerify(TabDrawerSelectors.TAB_ITEM_WITH_TITLE(secondWebPage.title))
        on.browserPage.navigateToPage()
        on.home.navigateToPage()
        on.mainMenu.navigateToPage()
            .mozVerify(MainMenuSelectors.SETTINGS_BUTTON)
    }
}
