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
import org.mozilla.fenix.helpers.AppAndSystemHelper.openAppFromExternalLink
import org.mozilla.fenix.helpers.FenixTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.HomeActivityTestRule
import org.mozilla.fenix.helpers.RetryTestRule
import org.mozilla.fenix.helpers.RetryableComposeTestRule
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.helpers.TestHelper.restartApp
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.browserScreen
import org.mozilla.fenix.ui.robots.homeScreen
import org.mozilla.fenix.ui.robots.navigationToolbar

/**
 *  Tests for verifying the Homepage settings menu
 *
 */
class SettingsHomepageTest {
    @get:Rule(order = 0)
    val retryTestRule = RetryTestRule(3)

    @get:Rule(order = 1)
    val fenixTestRule: FenixTestRule = FenixTestRule()

    private val mockWebServer get() = fenixTestRule.mockWebServer

    @get:Rule(order = 2)
    val retryableComposeTestRule = RetryableComposeTestRule<HomeActivity, HomeActivityIntentTestRule> {
        AndroidComposeTestRule(
            HomeActivityIntentTestRule.withDefaultSettingsOverrides(),
        ) { it.activity }
    }

    @get:Rule(order = 3)
    val memoryLeaksRule = DetectMemoryLeaksRule()

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1564843
    @Ignore("Failing, see https://bugzilla.mozilla.org/show_bug.cgi?id=2028550")
    @Test
    fun verifyHomepageSettingsTest() {
        homeScreen(retryableComposeTestRule.current) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openHomepageSubMenu {
            verifyHomePageView()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1564859
    @Test
    fun verifyShortcutOptionTest() {
        // en-US defaults
        val defaultTopSites = arrayOf(
            "Wikipedia",
            "Google",
        )
        val genericURL = mockWebServer.getGenericAsset(1)

        homeScreen(retryableComposeTestRule.current) {
            defaultTopSites.forEach { item ->
                verifyExistingTopSitesTabs(item)
            }
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openHomepageSubMenu {
            clickShortcutsButton()
        }.goBack {
        }.goBack(retryableComposeTestRule.current) {
            defaultTopSites.forEach { item ->
                verifyNotExistingTopSiteItem(item)
            }
        }
        // Disabling the "Shortcuts" homepage setting option should remove the "Add to shortcuts" from main menu option
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.openThreeDotMenu {
            clickTheMoreButton()
            verifyAddToShortcutsButton(isDisplayed = false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1565003
    @Test
    fun verifyRecentlyVisitedOptionTest() {
        retryableComposeTestRule.current.activityRule.applySettingsExceptions {
            it.isRecentTabsFeatureEnabled = false
        }
        val genericURL = mockWebServer.getGenericAsset(1)

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.goToHomescreen {
            verifyRecentlyVisitedSectionIsDisplayed(true)
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openHomepageSubMenu {
            clickRecentlyVisited()
        }.goBack {
        }.goBack(retryableComposeTestRule.current) {
            verifyRecentlyVisitedSectionIsDisplayed(false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1564999
    @SmokeTest
    @Test
    fun jumpBackInOptionTest() {
        val genericURL = mockWebServer.getGenericAsset(1)

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.goToHomescreen {
            verifyJumpBackInSectionIsDisplayed()
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openHomepageSubMenu {
            clickJumpBackInButton()
        }.goBack {
        }.goBack(retryableComposeTestRule.current) {
            verifyJumpBackInSectionIsNotDisplayed()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1565000
    @SmokeTest
    @Test
    fun recentBookmarksOptionTest() {
        val genericURL = mockWebServer.getGenericAsset(1)

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.openThreeDotMenu {
        }.clickBookmarkThisPageButton {
        }.goToHomescreen {
            verifyBookmarksSectionIsDisplayed(exists = true)
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openHomepageSubMenu {
            clickRecentBookmarksButton()
        }.goBack {
        }.goBack(retryableComposeTestRule.current) {
            verifyBookmarksSectionIsDisplayed(exists = false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1569831
    @SmokeTest
    @Test
    fun verifyOpeningScreenOptionsTest() {
        val genericURL = mockWebServer.getGenericAsset(1)

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
            verifySettingsOptionSummary("Homepage", "Open on homepage after four hours")
        }.openHomepageSubMenu {
            verifySelectedOpeningScreenOption("Homepage after four hours of inactivity")
            clickOpeningScreenOption("Homepage")
            verifySelectedOpeningScreenOption("Homepage")
        }

        restartApp(retryableComposeTestRule.current.activityRule)

        homeScreen(retryableComposeTestRule.current) {
            verifyHomeScreen()
        }.openThreeDotMenu {
        }.clickSettingsButton {
            verifySettingsOptionSummary("Homepage", "Open on homepage")
        }.openHomepageSubMenu {
            clickOpeningScreenOption("Last tab")
            verifySelectedOpeningScreenOption("Last tab")
        }.goBack {
            verifySettingsOptionSummary("Homepage", "Open on last tab")
        }

        restartApp(retryableComposeTestRule.current.activityRule)

        browserScreen(retryableComposeTestRule.current) {
            verifyUrl(genericURL.url.toString())
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1569843
    @Test
    fun verifyOpeningScreenAfterLaunchingExternalLinkTest() {
        val genericPage = mockWebServer.getGenericAsset(1)

        homeScreen(retryableComposeTestRule.current) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openHomepageSubMenu {
            clickOpeningScreenOption("Homepage")
        }.goBackToHomeScreen(retryableComposeTestRule.current) {
        }

        retryableComposeTestRule.current.activityRule.applySettingsExceptions {
            it.isTermsOfServiceAccepted = true

            with(retryableComposeTestRule.current.activityRule) {
                finishActivity()
                mDevice.waitForIdle()
                openAppFromExternalLink(retryableComposeTestRule.current, genericPage.url.toString())
            }
        }

        browserScreen(retryableComposeTestRule.current) {
            verifyPageContent(genericPage.content)
        }
    }
}
