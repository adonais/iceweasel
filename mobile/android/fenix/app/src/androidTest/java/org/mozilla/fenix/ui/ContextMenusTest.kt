/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.core.net.toUri
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.helpers.AppAndSystemHelper.assertExternalAppOpens
import org.mozilla.fenix.helpers.Constants.PackageName.YOUTUBE_APP
import org.mozilla.fenix.helpers.FenixTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.HomeActivityTestRule
import org.mozilla.fenix.helpers.MatcherHelper.itemContainingText
import org.mozilla.fenix.helpers.MatcherHelper.itemWithText
import org.mozilla.fenix.helpers.RetryTestRule
import org.mozilla.fenix.helpers.RetryableComposeTestRule
import org.mozilla.fenix.helpers.TestAssetHelper.externalLinksAsset
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.helpers.TestAssetHelper.imageAsset
import org.mozilla.fenix.helpers.TestHelper.clickSnackbarButton
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.helpers.TestHelper.verifySnackBarText
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.clickContextMenuItem
import org.mozilla.fenix.ui.robots.clickPageObject
import org.mozilla.fenix.ui.robots.downloadRobot
import org.mozilla.fenix.ui.robots.longClickPageObject
import org.mozilla.fenix.ui.robots.navigationToolbar
import org.mozilla.fenix.ui.robots.shareOverlay

/**
 *  Tests for verifying basic functionality of content context menus
 *
 *  - Verifies long click "Open link in new tab" UI and functionality
 *  - Verifies long click "Open link in new Private tab" UI and functionality
 *  - Verifies long click "Copy Link" UI and functionality
 *  - Verifies long click "Share Link" UI and functionality
 *  - Verifies long click "Open image in new tab" UI and functionality
 *  - Verifies long click "Save Image" UI and functionality
 *  - Verifies long click "Copy image location" UI and functionality
 *  - Verifies long click items of mixed hypertext items
 *
 */

class ContextMenusTest {

    @get:Rule(order = 0)
    val retryTestRule = RetryTestRule(3)

    @get:Rule(order = 1)
    val fenixTestRule: FenixTestRule = FenixTestRule()

    @get:Rule(order = 2)
    val retryableComposeTestRule = RetryableComposeTestRule<HomeActivity, HomeActivityTestRule> {
        AndroidComposeTestRule(
            HomeActivityIntentTestRule(
                // workaround for toolbar at top position by default
                // remove with https://bugzilla.mozilla.org/show_bug.cgi?id=1917640
                shouldUseBottomToolbar = true,
            ),
        ) { it.activity }
    }

    @get:Rule(order = 3)
    val memoryLeaksRule = DetectMemoryLeaksRule()

    private val mockWebServer get() = fenixTestRule.mockWebServer

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/243837
    @Test
    fun verifyOpenLinkNewTabContextMenuOptionTest() {
        val pageLinks = mockWebServer.getGenericAsset(4)
        val genericURL = mockWebServer.getGenericAsset(1)

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(pageLinks.url) {
            mDevice.waitForIdle()
            longClickPageObject(retryableComposeTestRule.current, itemWithText("Link 1"))
            verifyContextMenuForLocalHostLinks(genericURL.url)
            clickContextMenuItem("Open link in new tab")
            verifySnackBarText("New tab opened")
            clickSnackbarButton(retryableComposeTestRule.current, "SWITCH")
            verifyUrl(genericURL.url.toString())
        }.openTabDrawer(retryableComposeTestRule.current) {
            verifyNormalBrowsingButtonIsSelected()
            verifyExistingOpenTabs("Test_Page_1")
            verifyExistingOpenTabs("Test_Page_4")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/244655
    @Test
    fun verifyOpenLinkInNewPrivateTabContextMenuOptionTest() {
        val pageLinks = mockWebServer.getGenericAsset(4)
        val genericURL = mockWebServer.getGenericAsset(2)

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(pageLinks.url) {
            mDevice.waitForIdle()
            longClickPageObject(retryableComposeTestRule.current, itemWithText("Link 2"))
            verifyContextMenuForLocalHostLinks(genericURL.url)
            clickContextMenuItem("Open link in private tab")
            verifySnackBarText("New private tab opened")
            clickSnackbarButton(retryableComposeTestRule.current, "SWITCH")
            verifyUrl(genericURL.url.toString())
        }.openTabDrawer(retryableComposeTestRule.current) {
            verifyPrivateBrowsingButtonIsSelected()
            verifyExistingOpenTabs("Test_Page_2")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/243832
    @Test
    fun verifyCopyLinkContextMenuOptionTest() {
        val pageLinks = mockWebServer.getGenericAsset(4)
        val genericURL = mockWebServer.getGenericAsset(3)

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(pageLinks.url) {
            mDevice.waitForIdle()
            longClickPageObject(retryableComposeTestRule.current, itemWithText("Link 3"))
            verifyContextMenuForLocalHostLinks(genericURL.url)
            clickContextMenuItem("Copy link")
            verifySnackBarText("Link copied to clipboard")
        }.openNavigationToolbar {
        }.visitLinkFromClipboard {
            verifyUrl(genericURL.url.toString())
        }
    }

    @Test
    fun verifyCopyLinkTextContextMenuOptionTest() {
        val pageLinks = mockWebServer.getGenericAsset(4)
        val genericURL = mockWebServer.getGenericAsset(3)

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(pageLinks.url) {
            mDevice.waitForIdle()
            longClickPageObject(retryableComposeTestRule.current, itemWithText("Link 3"))
            verifyContextMenuForLocalHostLinks(genericURL.url)
            clickContextMenuItem("Copy link text")
            verifySnackBarText("Link text copied to clipboard")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/243838
    @Test
    fun verifyShareLinkContextMenuOptionTest() {
        val pageLinks = mockWebServer.getGenericAsset(4)
        val genericURL = mockWebServer.getGenericAsset(1)

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(pageLinks.url) {
            mDevice.waitForIdle()
            longClickPageObject(retryableComposeTestRule.current, itemWithText("Link 1"))
            verifyContextMenuForLocalHostLinks(genericURL.url)
            clickContextMenuItem("Share link")
            shareOverlay {
                verifyShareLinkIntent(genericURL.url)
                mDevice.pressBack()
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/243833
    @Test
    fun verifyOpenImageNewTabContextMenuOptionTest() {
        val pageLinks = mockWebServer.getGenericAsset(4)
        val imageResource = mockWebServer.imageAsset

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(pageLinks.url) {
            mDevice.waitForIdle()
            longClickPageObject(retryableComposeTestRule.current, itemWithText("test_link_image"))
            verifyLinkImageContextMenuItems(imageResource.url)
            clickContextMenuItem("Open image in new tab")
            verifySnackBarText("New tab opened")
            clickSnackbarButton(retryableComposeTestRule.current, "SWITCH")
            verifyUrl(imageResource.url.toString())
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/243834
    @Test
    fun verifyCopyImageLocationContextMenuOptionTest() {
        val pageLinks = mockWebServer.getGenericAsset(4)
        val imageResource = mockWebServer.imageAsset

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(pageLinks.url) {
            mDevice.waitForIdle()
            longClickPageObject(retryableComposeTestRule.current, itemWithText("test_link_image"))
            verifyLinkImageContextMenuItems(imageResource.url)
            clickContextMenuItem("Copy image location")
            verifySnackBarText("Link copied to clipboard")
        }.openNavigationToolbar {
        }.visitLinkFromClipboard {
            verifyUrl(imageResource.url.toString())
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/243835
    @Test
    fun verifySaveImageContextMenuOptionTest() {
        val pageLinks = mockWebServer.getGenericAsset(4)
        val imageResource = mockWebServer.imageAsset

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(pageLinks.url) {
            mDevice.waitForIdle()
            longClickPageObject(retryableComposeTestRule.current, itemWithText("test_link_image"))
            verifyLinkImageContextMenuItems(imageResource.url)
            clickContextMenuItem("Save image")
        }

        downloadRobot(retryableComposeTestRule.current) {
            verifyDownloadCompleteSnackbar(fileName = "rabbit.jpg")
            clickSnackbarButton(composeTestRule = retryableComposeTestRule.current, "OPEN")
            verifyPhotosAppOpens()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/352050
    @Test
    fun verifyContextMenuLinkVariationsTest() {
        val pageLinks = mockWebServer.getGenericAsset(4)
        val genericURL = mockWebServer.getGenericAsset(1)
        val imageResource = mockWebServer.imageAsset

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(pageLinks.url) {
            mDevice.waitForIdle()
            longClickPageObject(retryableComposeTestRule.current, itemWithText("Link 1"))
            verifyContextMenuForLocalHostLinks(genericURL.url)
            dismissContentContextMenu()
            longClickPageObject(retryableComposeTestRule.current, itemWithText("test_link_image"))
            verifyLinkImageContextMenuItems(imageResource.url)
            dismissContentContextMenu()
            longClickPageObject(retryableComposeTestRule.current, itemWithText("test_no_link_image"))
            verifyNoLinkImageContextMenuItems(imageResource.url)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2333840
    @Test
    fun verifyPDFContextMenuLinkVariationsTest() {
        val genericURL = mockWebServer.getGenericAsset(3)

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(genericURL.url) {
            clickPageObject(retryableComposeTestRule.current, itemWithText("PDF form file"))
            waitForPageToLoad()
            clickPageObject(retryableComposeTestRule.current, itemContainingText("Cancel"))
            longClickPageObject(retryableComposeTestRule.current, itemWithText("Wikipedia link"))
            verifyContextMenuForLinksToOtherHosts("wikipedia.org".toUri())
            dismissContentContextMenu()
            // Some options are missing from the linked and non liked images context menus in PDF files
            // See https://bugzilla.mozilla.org/show_bug.cgi?id=1012805 for more details
            longClickPDFImage()
            verifyContextMenuForLinksToOtherHosts("wikipedia.org".toUri())
            dismissContentContextMenu()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/832094
    @Test
    fun verifyOpenLinkInAppContextMenuOptionTest() {
        val defaultWebPage = mockWebServer.externalLinksAsset

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(defaultWebPage.url) {
            longClickPageObject(retryableComposeTestRule.current, itemContainingText("Youtube full link"))
            verifyContextMenuForLinksToOtherApps("youtube.com")
            clickContextMenuItem("Open link in external app")
            assertExternalAppOpens(YOUTUBE_APP)
        }
    }
}
