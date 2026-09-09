/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Test
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest

class TextSelectionTest : BaseTest() {

    private val mockWebServer
        get() = fenixTestRule.mockWebServer

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2326832
    @SmokeTest
    @Test
    fun verifySelectAllTextOptionTest() {
        val genericURL = mockWebServer.getGenericAsset(1)

        on.home.navigateToPage()
        on.browserPage
            .navigateToPage(genericURL.url.toString())
            .longClickWebContentText("content")
            .clickContextMenuItem("Select all")
            .clickContextMenuItem("Copy")
            .longClickToolbar()
            .clickDisplayModeToolbarContextMenuItem("Paste")

        // With Select all, white spaces are copied.
        // Potential bug https://bugzilla.mozilla.org/show_bug.cgi?id=1821310
        on.searchBar.verifyTypedToolbarText("  Page content: 1 ", exists = true)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2326831
    @SmokeTest
    @Test
    fun verifyPrivateSearchTextTest() {
        val genericURL = mockWebServer.getGenericAsset(1)

        on.home.navigateToPage()
        on.home.switchToPrivateBrowsingMode()

        on.browserPage
            .navigateToPage(genericURL.url.toString())
            .verifyPageContent(genericURL.content)
            .searchSelectedWebText(
                webText = "content",
                menuItem = "Private Search",
                expectedTabCount = "2",
                isPrivateBrowsingEnabled = true,
            )
            .verifyUrl("content")
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/243839
    @SmokeTest
    @Test
    fun verifyCopyPDFTextOptionTest() {
        val genericURL = mockWebServer.getGenericAsset(3)

        on.home.navigateToPage()
        on.browserPage
            .navigateToPage(genericURL.url.toString())
            .clickPageContent("PDF form file")
            .clickStayInAppPromptButtonIfPresent()
            .longClickWebContentText("Crossing")
            .clickContextMenuItem("Copy")

        on.searchBar
            .navigateToPage()
            .clickClearButton()
            .verifySearchBarPlaceholder()
            .longClickToolbar()
            .clickContextMenuItem("Paste")
            .verifyTypedToolbarText("Crossing", exists = true)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2326836
    @SmokeTest
    @Test
    fun verifySearchPDFTextOptionTest() {
        val genericURL = mockWebServer.getGenericAsset(3)

        on.home.navigateToPage()
        on.browserPage
            .navigateToPage(genericURL.url.toString())
            .clickPageContent("PDF form file")
            .clickStayInAppPromptButtonIfPresent()
            .longClickWebContentText("Crossing")
            .clickContextMenuItem("Search")
            .verifyUrl("Crossing")
            .verifyTabCounter("2")
    }
}
