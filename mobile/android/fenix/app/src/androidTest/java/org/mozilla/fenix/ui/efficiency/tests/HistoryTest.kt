/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Ignore
import org.junit.Test
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.HomeSelectors

class HistoryTest : BaseTest() {

    // TODO (I. RIOS 3/20/2026): add to BaseTest for State Machine
    private val mockWebServer get() = fenixTestRule.mockWebServer

    @Ignore("Covered by verifyNavigationReachability[0: HistoryPage (TBD) — Navigation Reachability]")
    @Test
    fun verifyHistorySectionTest() {
        on.history.navigateToPage()
    }

    @SmokeTest
    @Test
    fun noHistoryInPrivateBrowsingTest() {
        val website = mockWebServer.getGenericAsset(1)
        on.home.navigateToPage()
            .mozClick(HomeSelectors.PRIVATE_BROWSING_BUTTON)
        on.browserPage.navigateToPage(website.url.toString())
        on.history.navigateToPage()
            .mozVerifyElementsByGroup("emptyHistory")
    }
}
