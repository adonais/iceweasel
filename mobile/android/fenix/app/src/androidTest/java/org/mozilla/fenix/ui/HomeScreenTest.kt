/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.FenixTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.HomeActivityTestRule
import org.mozilla.fenix.helpers.RetryTestRule
import org.mozilla.fenix.helpers.RetryableComposeTestRule
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.helpers.TestHelper.waitUntilSnackbarGone
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.homeScreen
import org.mozilla.fenix.ui.robots.navigationToolbar

/**
 *  Tests for verifying the presence of home screen and first-run homescreen elements
 *
 *  Note: For private browsing, navigation bar and tabs see separate test class
 *
 */

class HomeScreenTest {
    @get:Rule(order = 0)
    val retryTestRule = RetryTestRule(3)

    @get:Rule(order = 1)
    val fenixTestRule: FenixTestRule = FenixTestRule()

    @get:Rule(order = 2)
    val retryableComposeTestRule = RetryableComposeTestRule<HomeActivity, HomeActivityIntentTestRule> {
        AndroidComposeTestRule(
            HomeActivityIntentTestRule.withDefaultSettingsOverrides(),
        ) { it.activity }
    }

    @get:Rule(order = 3)
    val memoryLeaksRule = DetectMemoryLeaksRule()

    private val mockWebServer get() = fenixTestRule.mockWebServer

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/235396
    @Ignore("Failing, see https://bugzilla.mozilla.org/show_bug.cgi?id=2028550")
    @Test
    fun homeScreenItemsTest() {
        // Workaround to make sure the Pocket articles are populated before starting the test.
        homeScreen(retryableComposeTestRule.current) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.goBack(retryableComposeTestRule.current) {
            verifyHomeWordmark()
            verifyHomePrivateBrowsingButton()
            verifyExistingTopSitesTabs("Wikipedia")
            verifyExistingTopSitesTabs("Google")
            verifyCollectionsHeader()
            verifyNoCollectionsText()
            verifyThoughtProvokingStories(true)
            verifyNavigationToolbar()
            verifyHomeMenuButton()
            verifyTabCounter("0")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/244199
    @Test
    fun privateBrowsingHomeScreenItemsTest() {
        homeScreen(retryableComposeTestRule.current) {
        }.togglePrivateBrowsingMode()

        homeScreen(retryableComposeTestRule.current) {
            verifyPrivateBrowsingHomeScreenItems()
        }.openPrivateBrowsingModeLearnMoreLink {
            verifyUrl("common-myths-about-private-browsing")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1364362
    @SmokeTest
    @Test
    fun verifyJumpBackInSectionTest() {
        retryableComposeTestRule.current.activityRule.applySettingsExceptions {
            it.isRecentlyVisitedFeatureEnabled = false
            it.isPocketEnabled = false
        }

        val firstWebPage = mockWebServer.getGenericAsset(4)
        val secondWebPage = mockWebServer.getGenericAsset(1)

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(firstWebPage.url) {
            verifyPageContent(firstWebPage.content)
            verifyUrl(firstWebPage.url.toString())
        }.goToHomescreen {
            verifyJumpBackInSectionIsDisplayed()
            verifyJumpBackInItemTitle(retryableComposeTestRule.current, firstWebPage.title)
            verifyJumpBackInItemWithUrl(retryableComposeTestRule.current, firstWebPage.url.toString())
            verifyJumpBackInShowAllButton()
        }.clickJumpBackInShowAllButton {
            verifyExistingOpenTabs(firstWebPage.title)
        }.closeTabDrawer {
        }

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(secondWebPage.url) {
            verifyPageContent(secondWebPage.content)
            verifyUrl(secondWebPage.url.toString())
        }.goToHomescreen {
            verifyJumpBackInSectionIsDisplayed()
            verifyJumpBackInItemTitle(retryableComposeTestRule.current, secondWebPage.title)
            verifyJumpBackInItemWithUrl(retryableComposeTestRule.current, secondWebPage.url.toString())
        }.openTabDrawer {
            closeTabWithTitle(secondWebPage.title)
            waitUntilSnackbarGone()
            verifyExistingOpenTabs(firstWebPage.title)
        }.closeTabDrawer {
        }

        homeScreen(retryableComposeTestRule.current) {
            verifyJumpBackInSectionIsDisplayed()
            verifyJumpBackInItemTitle(retryableComposeTestRule.current, firstWebPage.title)
            verifyJumpBackInItemWithUrl(retryableComposeTestRule.current, firstWebPage.url.toString())
        }.openTabDrawer {
            closeTab()
        }

        homeScreen(retryableComposeTestRule.current) {
            verifyJumpBackInSectionIsNotDisplayed()
        }
    }
}
