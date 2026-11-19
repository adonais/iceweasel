/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Ignore
import org.junit.Test
import org.mozilla.fenix.customannotations.Critical
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.HistorySelectors
import org.mozilla.fenix.ui.efficiency.selectors.RecentlyClosedTabsSelectors
import org.mozilla.fenix.ui.efficiency.selectors.TabDrawerSelectors

class RecentlyClosedTabsTest : BaseTest() {

    @Ignore("Covered by verifyNavigationReachability[0: RecentlyClosedTabsPage (TBD) — Navigation Reachability]")
    @Test
    fun verifyEmptyRecentlyClosedTabsSectionTest() {
        on.recentlyClosedTabs.navigateToPage()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2195812
    // Converted from legacy RecentlyClosedTabsTest.deleteRecentlyClosedTabsItemTest
    @SmokeTest
    @Test
    fun deleteRecentlyClosedTabsItemTest() {
        val website = mockWebServer.getGenericAsset(1)
        on.browserPage.navigateToPage(website.url.toString())
        on.tabDrawer.navigateToPage()
        on.tabDrawer.closeTabWithTitle(website.title)
        // Closing the only tab lands on Home; re-sync page state before routing onward.
        on.home.navigateToPage()
        on.recentlyClosedTabs.navigateToPage()
        on.recentlyClosedTabs.verifyRecentlyClosedItem(website.title, website.url.toString())
        on.recentlyClosedTabs.deleteRecentlyClosedItem()
        on.recentlyClosedTabs.verifyEmptyRecentlyClosedList()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1065414
    // Converted from legacy RecentlyClosedTabsTest.openRecentlyClosedItemTest
    @SmokeTest
    @Test
    fun openRecentlyClosedItemTest() {
        val website = mockWebServer.getGenericAsset(1)
        on.browserPage.navigateToPage(website.url.toString())
        on.tabDrawer.navigateToPage()
        on.tabDrawer.closeTabWithTitle(website.title)
        // Closing the only tab lands on Home; re-sync page state before routing onward.
        on.home.navigateToPage()
        on.recentlyClosedTabs.navigateToPage()
        on.recentlyClosedTabs.verifyRecentlyClosedItem(website.title, website.url.toString())
        on.recentlyClosedTabs.openRecentlyClosedItem(website.title)
        // Tapping the item reopens it as a browser tab.
        on.browserPage.navigateToPage()
        on.browserPage.verifyUrl(website.url.toString())
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1065413
    @Critical
    @Test
    fun verifyTheRecentlyClosedTabsViewInTheHistoryMenuTest() {
        val website = mockWebServer.getGenericAsset(1)

        on.history.navigateToPage().mozVerify(HistorySelectors.RECENTLY_CLOSED_TABS_NUMBER_OF_TABS(0))
        on.browserPage.navigateToPage(website.url.toString())
        on.tabDrawer.navigateToPage().closeAllTabs()
        on.home.navigateToPage()
        on.recentlyClosedTabs
            .navigateToPage()
            .mozVerify(RecentlyClosedTabsSelectors.RECENTLY_CLOSED_ITEM(website.title))
            .mozClick(RecentlyClosedTabsSelectors.SHOW_FULL_HISTORY_BUTTON)
        on.history
            .mozVerify(HistorySelectors.RECENTLY_CLOSED_TABS_NUMBER_OF_TABS(1))
            .mozVerifyElementsByGroup(HistorySelectors.Group.HISTORY_MENU_VIEW_WITH_HISTORY_ITEMS)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1065439
    @Critical
    @Test
    fun deletingBrowserHistoryClearsRecentlyClosedTabsListTest() {
        val firstPage = mockWebServer.getGenericAsset(1)
        val secondPage = mockWebServer.getGenericAsset(2)

        on.browserPage.navigateToPage(firstPage.url.toString())
        on.tabDrawer.navigateToPage().closeAllTabs()
        on.home.navigateToPage()
        on.recentlyClosedTabs
            .navigateToPage()
            .mozVerify(RecentlyClosedTabsSelectors.RECENTLY_CLOSED_ITEM(firstPage.title))
        on.history
            .navigateToPage()
            .mozVerifyElementsByGroup(HistorySelectors.Group.HISTORY_MENU_VIEW_WITH_HISTORY_ITEMS)
            .mozClick(HistorySelectors.DELETE_ALL_HISTORY_BUTTON)
            .mozClick(HistorySelectors.DELETE_EVERYTHING_OPTION_BUTTON)
            .mozClick(HistorySelectors.DELETE_CONFIRM_BUTTON)
            .mozVerify(HistorySelectors.RECENTLY_CLOSED_TABS_NUMBER_OF_TABS(0))
        on.browserPage.navigateToPage(secondPage.url.toString())
        on.tabDrawer
            .navigateToPage()
            .mozClick(TabDrawerSelectors.THREE_DOT_BUTTON)
            .mozClick(TabDrawerSelectors.RECENTLY_CLOSED_TABS_BUTTON)
        on.recentlyClosedTabs.mozVerify(RecentlyClosedTabsSelectors.EMPTY_RECENTLY_CLOSED_TABS_LIST)
    }
}
