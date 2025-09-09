/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:Suppress("DEPRECATION")

package org.mozilla.fenix.ui

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.core.net.toUri
import androidx.test.rule.ActivityTestRule
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.IntentReceiverActivity
import org.mozilla.fenix.R
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.AppAndSystemHelper.assertExternalAppOpens
import org.mozilla.fenix.helpers.AppAndSystemHelper.assertNativeAppOpens
import org.mozilla.fenix.helpers.AppAndSystemHelper.assertYoutubeAppOpens
import org.mozilla.fenix.helpers.AppAndSystemHelper.clickSystemHomeScreenShortcutAddButton
import org.mozilla.fenix.helpers.Constants.PackageName.GOOGLE_DOCS
import org.mozilla.fenix.helpers.Constants.PackageName.PRINT_SPOOLER
import org.mozilla.fenix.helpers.DataGenerationHelper.createCustomTabIntent
import org.mozilla.fenix.helpers.DataGenerationHelper.getRecommendedExtensionTitle
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.MatcherHelper
import org.mozilla.fenix.helpers.MatcherHelper.itemContainingText
import org.mozilla.fenix.helpers.MatcherHelper.itemWithResIdAndText
import org.mozilla.fenix.helpers.MockBrowserDataHelper
import org.mozilla.fenix.helpers.TestAssetHelper
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.helpers.TestAssetHelper.getPdfFormAsset
import org.mozilla.fenix.helpers.TestAssetHelper.waitingTime
import org.mozilla.fenix.helpers.TestAssetHelper.waitingTimeLong
import org.mozilla.fenix.helpers.TestAssetHelper.waitingTimeVeryShort
import org.mozilla.fenix.helpers.TestHelper.closeApp
import org.mozilla.fenix.helpers.TestHelper.exitMenu
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.helpers.TestHelper.restartApp
import org.mozilla.fenix.helpers.TestHelper.verifySnackBarText
import org.mozilla.fenix.helpers.TestHelper.waitForAppWindowToBeUpdated
import org.mozilla.fenix.helpers.TestHelper.waitUntilSnackbarGone
import org.mozilla.fenix.helpers.TestSetup
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.browserScreen
import org.mozilla.fenix.ui.robots.clickPageObject
import org.mozilla.fenix.ui.robots.customTabScreen
import org.mozilla.fenix.ui.robots.homeScreen
import org.mozilla.fenix.ui.robots.navigationToolbar

class MainMenuTestCompose : TestSetup() {
    @get:Rule
    val composeTestRule =
        AndroidComposeTestRule(
            HomeActivityIntentTestRule(
                skipOnboarding = true,
                isMenuRedesignEnabled = true,
                isMenuRedesignCFREnabled = false,
                isPageLoadTranslationsPromptEnabled = false,
            ),
        ) { it.activity }

    @get:Rule
    val intentReceiverActivityTestRule = ActivityTestRule(
        IntentReceiverActivity::class.java,
        true,
        false,
    )

    @get:Rule
    val memoryLeaksRule = DetectMemoryLeaksRule()

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080168
    @SmokeTest
    @Test
    fun verifyTheHomepageRedesignedMenuItemsTest() {
        homeScreen {
        }.openThreeDotMenu(composeTestRule) {
            verifyHomeMainMenuItems()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080124
    @SmokeTest
    @Test
    fun verifyTheWebpageRedesignedMenuItemsTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            verifyPageMainMenuItems()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080133
    @SmokeTest
    @Test
    fun verifySwitchToDesktopSiteIsDisabledOnPDFsTest() {
        val pdfPage = TestAssetHelper.getPdfFormAsset(mockWebServer)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(pdfPage.url) {
            waitForPageToLoad()
            verifyPageContent(pdfPage.content)
        }.openThreeDotMenu(composeTestRule) {
            verifySwitchToDesktopSiteButtonIsEnabled(isEnabled = false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080130
    @SmokeTest
    @Test
    fun verifyTheFindInPageMenuItemTest() {
        val testPage = getGenericAsset(mockWebServer, 3)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
            mDevice.waitForIdle()
        }.openThreeDotMenu(composeTestRule) {
        }.clickFindInPageButton {
            verifyFindInPageNextButton()
            verifyFindInPagePrevButton()
            verifyFindInPageCloseButton()
            enterFindInPageQuery("a")
            verifyFindInPageResult("1/3")
            clickFindInPageNextButton()
            verifyFindInPageResult("2/3")
            clickFindInPageNextButton()
            verifyFindInPageResult("3/3")
            clickFindInPagePrevButton()
            verifyFindInPageResult("2/3")
            clickFindInPagePrevButton()
            verifyFindInPageResult("1/3")
        }.closeFindInPageWithCloseButton {
            verifyFindInPageBar(false)
        }.openThreeDotMenu(composeTestRule) {
        }.clickFindInPageButton {
            enterFindInPageQuery("3")
            verifyFindInPageResult("1/1")
        }.closeFindInPageWithBackButton {
            verifyFindInPageBar(false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080136
    @SmokeTest
    @Test
    fun verifyTheHistoryMenuItemTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.openHistory {
            verifyHistoryMenuView()
        }.goBack {
            verifyPageContent(testPage.content)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080138
    @SmokeTest
    @Test
    fun verifyTheDownloadsMenuItemTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.openDownloads {
            verifyEmptyDownloadsList(composeTestRule)
            exitMenu()
        }.exitDownloadsManagerToBrowser(composeTestRule) {
            verifyPageContent(testPage.content)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080139
    @SmokeTest
    @Test
    fun verifyThePasswordsMenuItemTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.openPasswords {
            verifySecurityPromptForLogins()
            tapSetupLater()
            verifyEmptySavedLoginsListView()
            exitMenu()
        }
        browserScreen {
            verifyPageContent(testPage.content)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080095
    // Verifies the main menu of a custom tab with a custom menu item
    @SmokeTest
    @Test
    fun verifyTheCustomTabsMainMenuItemsTest() {
        val customMenuItem = "TestMenuItem"
        val customTabPage = getGenericAsset(mockWebServer, 1)

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                customTabPage.url.toString(),
                customMenuItem,
            ),
        )

        customTabScreen {
            verifyCustomTabCloseButton()
        }.openMainMenuFromRedesignedToolbar {
            verifyRedesignedCustomTabsMainMenuItemsExist(customMenuItem, true)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080100
    // The test opens a link in a custom tab then sends it to the browser
    @SmokeTest
    @Test
    fun verifyOpenInFirefoxMainMenuTest() {
        val customTabPage = getGenericAsset(mockWebServer, 1)

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                customTabPage.url.toString(),
            ),
        )

        customTabScreen {
            verifyCustomTabCloseButton()
        }.openMainMenuFromRedesignedToolbar {
        }.clickOpenInBrowserButtonFromRedesignedToolbar(composeTestRule) {
            verifyPageContent(customTabPage.content)
            verifyTabCounter("1")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080151
    @SmokeTest
    @Test
    fun verifyRecommendedExtensionsListWhileNoExtensionIsInstalledTest() {
        val genericURL = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.openExtensionsFromMainMenu {
            verifyRecommendedAddonsViewFromRedesignedMainMenu(composeTestRule)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080160
    @SmokeTest
    @Test
    fun verifyTheExtensionsMenuListAfterRemovingAnExtensionTest() {
        var recommendedExtensionTitle = ""
        val genericURL = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericURL.url) {
            verifyPageContent(genericURL.content)
        }.openThreeDotMenu(composeTestRule) {
            verifyTryRecommendedExtensionButton()
        }.openExtensionsFromMainMenu {
            recommendedExtensionTitle = getRecommendedExtensionTitle(composeTestRule)
            installRecommendedAddon(recommendedExtensionTitle, composeTestRule)
            verifyAddonPermissionPrompt(recommendedExtensionTitle)
            acceptPermissionToInstallAddon()
            verifyAddonInstallCompletedPrompt(
                recommendedExtensionTitle,
                composeTestRule.activityRule,
            )
            closeAddonInstallCompletePrompt()
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.openExtensionsFromMainMenu {
            clickManageExtensionsButtonFromRedesignedMainMenu(composeTestRule)
        }.openDetailedMenuForAddon(recommendedExtensionTitle) {
        }.removeAddon(composeTestRule.activityRule) {
        }.goBackToHomeScreen {
        }
        browserScreen {
        }.openThreeDotMenu(composeTestRule) {
            verifyTryRecommendedExtensionButton()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080163
    @SmokeTest
    @Test
    fun verifyTheManageExtensionsItemTest() {
        var recommendedExtensionTitle = ""
        val genericURL = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericURL.url) {
            verifyPageContent(genericURL.content)
        }.openThreeDotMenu(composeTestRule) {
            verifyTryRecommendedExtensionButton()
        }.openExtensionsFromMainMenu {
            recommendedExtensionTitle = getRecommendedExtensionTitle(composeTestRule)
            installRecommendedAddon(recommendedExtensionTitle, composeTestRule)
            verifyAddonPermissionPrompt(recommendedExtensionTitle)
            acceptPermissionToInstallAddon()
            verifyAddonInstallCompletedPrompt(
                recommendedExtensionTitle,
                composeTestRule.activityRule,
            )
            closeAddonInstallCompletePrompt()
        }
        browserScreen {
            waitForPageToLoad()
        }.openThreeDotMenu(composeTestRule) {
            waitForAppWindowToBeUpdated()
        }.openExtensionsFromMainMenu {
            clickManageExtensionsButtonFromRedesignedMainMenu(composeTestRule)
            verifyAddonsListIsDisplayed(shouldBeDisplayed = true)
            verifyAddonIsInstalled(recommendedExtensionTitle)
            verifyEnabledTitleDisplayed()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080129
    @Ignore("Failing, see https://bugzilla.mozilla.org/show_bug.cgi?id=1968653")
    @SmokeTest
    @Test
    fun verifyTheBookmarkPageMenuOptionTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            clickSaveButton()
        }.clickBookmarkThisPageButton {
        }.openThreeDotMenu(composeTestRule) {
            clickSaveButton()
        }.clickEditBookmarkButton(composeTestRule) {
            verifyEditBookmarksView()
            clickDeleteBookmarkButtonInEditMode()
        }
        browserScreen {
        }.openThreeDotMenu(composeTestRule) {
            clickSaveButton()
            verifyBookmarkThisPageButton()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080113
    @SmokeTest
    @Test
    fun verifyTheAddToShortcutsSubMenuOptionTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
            verifyPageContent(testPage.content)
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.clickAddToShortcutsButton {
            verifySnackBarText(getStringResource(R.string.snackbar_added_to_shortcuts))
        }.goToHomescreen(composeTestRule) {
            verifyExistingTopSitesTabs(composeTestRule, testPage.title)
        }.openTopSiteTabWithTitle(composeTestRule, testPage.title) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.clickRemoveFromShortcutsButton {
            verifySnackBarText(getStringResource(R.string.snackbar_top_site_removed))
        }.goToHomescreen(composeTestRule) {
            verifyNotExistingTopSiteItem(composeTestRule, testPage.title)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080114
    @SmokeTest
    @Test
    fun verifyTheAddToHomeScreenSubMenuOptionTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.clickAddToHomeScreenButton {
            clickCancelShortcutButton()
        }
        browserScreen {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.clickAddToHomeScreenButton {
            clickAddShortcutButton()
            clickSystemHomeScreenShortcutAddButton()
        }.openHomeScreenShortcut(testPage.title) {
            verifyPageContent(testPage.content)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080115
    @SmokeTest
    @Test
    fun verifyTheSaveToCollectionSubMenuOptionTest() {
        val collectionTitle = "First Collection"
        val firstTestPage = getGenericAsset(mockWebServer, 1)
        val secondTestPage = getGenericAsset(mockWebServer, 2)

        composeTestRule.activityRule.applySettingsExceptions {
            // Disabling these features to have better visibility of the Collections view
            it.isRecentlyVisitedFeatureEnabled = false
            it.isRecentTabsFeatureEnabled = false
        }

        MockBrowserDataHelper
            .createCollection(
                Pair(firstTestPage.url.toString(), firstTestPage.title),
                title = collectionTitle,
            )

        navigationToolbar {
        }.enterURLAndEnterToBrowser(secondTestPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.clickSaveToCollectionButton {
        }.selectExistingCollection(collectionTitle) {
            verifySnackBarText("Tab saved!")
        }.goToHomescreen(composeTestRule) {
        }.expandCollection(composeTestRule, collectionTitle) {
            verifyTabSavedInCollection(composeTestRule, firstTestPage.title)
            verifyTabSavedInCollection(composeTestRule, secondTestPage.title)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080118
    @Ignore("Failing, see https://bugzilla.mozilla.org/show_bug.cgi?id=1968653")
    @SmokeTest
    @Test
    fun verifyTheSaveAsPDFSubMenuOptionTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            clickSaveButton()
        }.clickSaveAsPDFButton {
            verifyDownloadPrompt(testPage.title + ".pdf")
        }.clickDownload {
        }.clickOpen("application/pdf") {
            assertExternalAppOpens(GOOGLE_DOCS)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080111
    @SmokeTest
    @Test
    fun verifyTheTranslatePageSubMenuOptionTest() {
        val testPage = TestAssetHelper.getFirstForeignWebPageAsset(mockWebServer)

        navigationToolbar {
        }.enterURL(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.clickTranslateButton {
            verifyTranslationSheetIsDisplayed(isDisplayed = true)
        }.clickTranslateButton {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.clickTranslatedButton {
            verifyTranslationSheetIsDisplayed(isDisplayed = true)
        }.clickShowOriginalButton {
            verifyPageContent(testPage.content)
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
            verifyTranslatePageButton()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080128
    @SmokeTest
    @Test
    fun verifyTheShareButtonTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
            verifyPageContent(testPage.content)
        }.openThreeDotMenu(composeTestRule) {
        }.clickShareButton {
            verifyShareTabLayout()
            verifySharingWithSelectedApp(
                appName = "Gmail",
                content = testPage.url.toString(),
                subject = testPage.title,
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080117
    @SmokeTest
    @Test
    fun verifyTheOpenInAppSubMenuOptionIsEnabledTest() {
        val youtubeURL = "vnd.youtube://".toUri()

        navigationToolbar {
        }.enterURLAndEnterToBrowser(youtubeURL) {
            waitForPageToLoad(waitingTime)
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
            verifyOpenInAppButtonIsEnabled(appName = "YouTube", isEnabled = true)
            clickOpenInAppButton(appName = "YouTube")
            assertYoutubeAppOpens()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080131
    @SmokeTest
    @Test
    fun verifyDesktopSiteModeOnOffIsEnabledTest() {
        val defaultWebPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(defaultWebPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            verifySwitchToDesktopSiteButton()
            verifyDesktopSiteButtonState(isEnabled = false)
            clickSwitchToDesktopSiteButton()
        }
        browserScreen {
            waitForPageToLoad(pageLoadWaitingTime = waitingTimeLong)
        }.openThreeDotMenu(composeTestRule) {
            verifyDesktopSiteButtonState(isEnabled = true)
            clickSwitchToDesktopSiteButton()
        }
        browserScreen {
            waitForPageToLoad(pageLoadWaitingTime = waitingTimeLong)
        }.openThreeDotMenu(composeTestRule) {
            verifyDesktopSiteButtonState(isEnabled = false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080119
    @SmokeTest
    @Test
    fun verifyThePrintSubMenuOptionTest() {
        val defaultWebPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(defaultWebPage.url) {
            mDevice.waitForIdle()
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
            clickPrintContentButton()
            assertNativeAppOpens(PRINT_SPOOLER)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080156
    @SmokeTest
    @Test
    fun verifyTheExtensionInstallationTest() {
        var recommendedExtensionTitle = ""
        val genericURL = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.openExtensionsFromMainMenu {
            recommendedExtensionTitle = getRecommendedExtensionTitle(composeTestRule)
            installRecommendedAddon(recommendedExtensionTitle, composeTestRule)
            acceptPermissionToInstallAddon()
            verifyAddonInstallCompletedPrompt(
                recommendedExtensionTitle,
                composeTestRule.activityRule,
            )
            closeAddonInstallCompletePrompt()
        }
        browserScreen {
        }.openThreeDotMenu(composeTestRule) {
            verifyExtensionsButtonWithInstalledExtension(recommendedExtensionTitle)
        }.openExtensionsFromMainMenu {
            verifyDiscoverMoreExtensionsButton(composeTestRule, isDisplayed = false)
            verifyManageExtensionsButtonFromRedesignedMainMenu(composeTestRule, isDisplayed = true)
            verifyInstalledExtension(composeTestRule, recommendedExtensionTitle)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080181
    @SmokeTest
    @Test
    fun verifyTheHomePageSettingsMenuItemTest() {
        homeScreen {
        }.openThreeDotMenu(composeTestRule) {
        }.openSettings {
            verifySettingsToolbar()
        }.goBack {
            verifyHomeWordmark()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080121
    @Test
    fun verifyTheBrowserViewMainMenuCFRTest() {
        val genericURL = getGenericAsset(mockWebServer, 1)

        composeTestRule.activityRule.applySettingsExceptions {
            it.isMenuRedesignCFREnabled = true
        }
        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.openThreeDotMenu(composeTestRule) {
            verifyMainMenuCFR()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080898
    @Test
    fun verifyTheFindInPageOptionInPDFsTest() {
        val testPage = getGenericAsset(mockWebServer, 3)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
            clickPageObject(MatcherHelper.itemWithText("PDF form file"))
            clickPageObject(itemWithResIdAndText("android:id/button2", "CANCEL"))
        }.openThreeDotMenu(composeTestRule) {
        }.clickFindInPageButton {
            verifyFindInPageNextButton()
            verifyFindInPagePrevButton()
            verifyFindInPageCloseButton()
            enterFindInPageQuery("l")
            verifyFindInPageResult("1/2")
            clickFindInPageNextButton()
            verifyFindInPageResult("2/2")
            clickFindInPagePrevButton()
            verifyFindInPageResult("1/2")
        }.closeFindInPageWithCloseButton {
            verifyFindInPageBar(false)
        }.openThreeDotMenu(composeTestRule) {
        }.clickFindInPageButton {
            enterFindInPageQuery("p")
            verifyFindInPageResult("1/1")
        }.closeFindInPageWithBackButton {
            verifyFindInPageBar(false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080145
    @Test
    fun verifyTheQuitFirefoxMenuItemTest() {
        val genericURL = getGenericAsset(mockWebServer, 1)

        homeScreen {
        }.openThreeDotMenu(composeTestRule) {
        }.openSettings {
        }.openSettingsSubMenuDeleteBrowsingDataOnQuit {
            verifyDeleteBrowsingOnQuitEnabled(false)
            clickDeleteBrowsingOnQuitButtonSwitch()
            verifyDeleteBrowsingOnQuitEnabled(true)
        }.goBack {
            verifySettingsOptionSummary("Delete browsing data on quit", "On")
        }.goBack {
        }
        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.openThreeDotMenu(composeTestRule) {
            clickQuitFirefoxButton()
            restartApp(composeTestRule.activityRule)
        }
        homeScreen {
            verifyHomeWordmark()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080103
    @Test
    fun verifyTheDesktopSiteMenuItemInACustomTabTest() {
        val customTabPage = getGenericAsset(mockWebServer, 1)

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                customTabPage.url.toString(),
            ),
        )

        customTabScreen {
        }.openMainMenuFromRedesignedToolbar {
            verifySwitchToDesktopSiteButton(composeTestRule)
            verifyDesktopSiteButtonState(composeTestRule, isEnabled = false)
            clickSwitchToDesktopSiteButton(composeTestRule)
        }.openMainMenuFromRedesignedToolbar {
            verifyDesktopSiteButtonState(composeTestRule, isEnabled = true)
            clickSwitchToDesktopSiteButton(composeTestRule)
        }.openMainMenuFromRedesignedToolbar {
            verifyDesktopSiteButtonState(composeTestRule, isEnabled = false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080101
    @SmokeTest
    @Test
    fun verifyTheFindInPageMenuItemInACustomTabTest() {
        val customTabPage = getGenericAsset(mockWebServer, 3)

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                customTabPage.url.toString(),
            ),
        )

        customTabScreen {
        }.openMainMenuFromRedesignedToolbar {
        }.clickFindInPageButton(composeTestRule) {
            verifyFindInPageNextButton()
            verifyFindInPagePrevButton()
            verifyFindInPageCloseButton()
            enterFindInPageQuery("a")
            verifyFindInPageResult("1/3")
            clickFindInPageNextButton()
            verifyFindInPageResult("2/3")
            clickFindInPageNextButton()
            verifyFindInPageResult("3/3")
            clickFindInPagePrevButton()
            verifyFindInPageResult("2/3")
            clickFindInPagePrevButton()
            verifyFindInPageResult("1/3")
        }.closeFindInPageWithCloseButton {
            verifyFindInPageBar(false)
        }.openThreeDotMenu(composeTestRule) {
        }.clickFindInPageButton {
            enterFindInPageQuery("3")
            verifyFindInPageResult("1/1")
        }.closeFindInPageWithBackButton {
            verifyFindInPageBar(false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080107
    @Test
    fun verifyTheClosingBehaviourWhenTappingOutsideTheCustomTabMainMenuTest() {
        val customMenuItem = "TestMenuItem"
        val customTabPage = getGenericAsset(mockWebServer, 1)

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                customTabPage.url.toString(),
            ),
        )

        customTabScreen {
        }.openMainMenuFromRedesignedToolbar {
        }.clickOutsideTheMainMenu {
        }
        customTabScreen {
            verifyRedesignedCustomTabsMainMenuItemsExist(
                customMenuItem,
                false,
                waitingTimeVeryShort,
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080162
    @SmokeTest
    @Test
    fun verifyTheExtensionMenuListWhileExtensionsAreDisabledTest() {
        var recommendedExtensionTitle = ""
        val genericURL = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.openExtensionsFromMainMenu {
            recommendedExtensionTitle = getRecommendedExtensionTitle(composeTestRule)
            installRecommendedAddon(recommendedExtensionTitle, composeTestRule)
            acceptPermissionToInstallAddon()
            verifyAddonInstallCompletedPrompt(
                recommendedExtensionTitle,
                composeTestRule.activityRule,
            )
            closeAddonInstallCompletePrompt()
        }
        browserScreen {
        }.openThreeDotMenu(composeTestRule) {
        }.openExtensionsFromMainMenu {
            clickManageExtensionsButtonFromRedesignedMainMenu(composeTestRule)
        }.openDetailedMenuForAddon(recommendedExtensionTitle) {
            disableExtension()
            waitUntilSnackbarGone()
        }.goBack {
        }.goBackToBrowser {
        }.openThreeDotMenu(composeTestRule) {
            verifyNoExtensionsEnabledButton()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080153
    @Test
    fun verifyTheDiscoverMoreExtensionsSubMenuItemTest() {
        val genericURL = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(genericURL.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.openExtensionsFromMainMenu {
        }.clickDiscoverMoreExtensionsButton(composeTestRule) {
            verifyUrl("addons.mozilla.org/en-US/android")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080112
    @SmokeTest
    @Test
    fun verifyTheReportBrokenSiteSubMenuOptionTest() {
        val defaultWebPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(defaultWebPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.clickReportBrokenSiteButton {
            verifyWebCompatReporterViewItems(
                composeTestRule,
                websiteURL = defaultWebPage.url.toString(),
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2939173
    @Test
    fun verifyTheWhatIsBrokenErrorMessageTest() {
        val defaultWebPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(defaultWebPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.openReportBrokenSite {
            verifyWebCompatReporterViewItems(composeTestRule, defaultWebPage.url.toString())
            verifyWhatIsBrokenField(composeTestRule)
            verifySendButtonIsEnabled(composeTestRule, isEnabled = false)
            clickChooseReasonField(composeTestRule)
            clickSiteDoesNotLoadReason(composeTestRule)
            verifyChooseReasonErrorMessageIsNotDisplayed(composeTestRule)
            verifySendButtonIsEnabled(composeTestRule, isEnabled = true)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2939175
    @Test
    fun verifyThatTheBrokenSiteFormSubmissionCanBeCanceledTest() {
        val defaultWebPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(defaultWebPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.openReportBrokenSite {
            verifyWebCompatReporterViewItems(composeTestRule, defaultWebPage.url.toString())
            clickChooseReasonField(composeTestRule)
            clickSiteDoesNotLoadReason(composeTestRule)
            clickBrokenSiteFormCancelButton(composeTestRule)
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.openReportBrokenSite {
            verifyWhatIsBrokenField(composeTestRule)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2939176
    @Ignore("Failing, see https://bugzilla.mozilla.org/show_bug.cgi?id=1968653")
    @Test
    fun verifyTheBrokenSiteFormSubmissionWithOptionalFieldsTest() {
        val defaultWebPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(defaultWebPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            openToolsMenu()
        }.openReportBrokenSite {
            verifyWebCompatReporterViewItems(composeTestRule, defaultWebPage.url.toString())
            clickChooseReasonField(composeTestRule)
            clickSiteDoesNotLoadReason(composeTestRule)
            describeBrokenSiteProblem(
                composeTestRule,
                problemDescription = "Prolonged page loading time",
            )
            clickBrokenSiteFormSendButton(composeTestRule)
        }
        browserScreen {
            verifySnackBarText("Your report was sent")
        }.openThreeDotMenu(composeTestRule) {
            openToolsMenu()
        }.openReportBrokenSite {
            verifyWhatIsBrokenField(composeTestRule)
            verifyBrokenSiteProblem(
                composeTestRule,
                problemDescription = "Prolonged page loading time",
                isDisplayed = false,
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2939179
    @Test
    fun verifyThatTheBrokenSiteFormInfoPersistsTest() {
        val defaultWebPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(defaultWebPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.openReportBrokenSite {
            verifyWebCompatReporterViewItems(composeTestRule, defaultWebPage.url.toString())
            clickChooseReasonField(composeTestRule)
            clickSiteDoesNotLoadReason(composeTestRule)
            describeBrokenSiteProblem(
                composeTestRule,
                problemDescription = "Prolonged page loading time",
            )
        }.closeWebCompatReporter {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.openReportBrokenSite {
            verifyBrokenSiteProblem(
                composeTestRule,
                problemDescription = "Prolonged page loading time",
                isDisplayed = true,
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2939180
    @Test
    fun verifyTheBrokenSiteFormIsEmptyWithoutSubmittingThePreviousOneTest() {
        val firstWebPage = getGenericAsset(mockWebServer, 1)
        val secondWebPage = getGenericAsset(mockWebServer, 2)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(firstWebPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.openReportBrokenSite {
            verifyWebCompatReporterViewItems(composeTestRule, firstWebPage.url.toString())
            clickChooseReasonField(composeTestRule)
            clickSiteDoesNotLoadReason(composeTestRule)
            describeBrokenSiteProblem(
                composeTestRule,
                problemDescription = "Prolonged page loading time",
            )
        }.closeWebCompatReporter {
        }.openTabDrawer(composeTestRule) {
        }.openNewTab {
        }.submitQuery(secondWebPage.url.toString()) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.openReportBrokenSite {
            verifyWhatIsBrokenField(composeTestRule)
            verifyBrokenSiteProblem(
                composeTestRule,
                problemDescription = "Prolonged page loading time",
                isDisplayed = false,
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2939181
    @Test
    fun verifyThatTheBrokenSiteFormInfoIsErasedWhenKillingTheAppTest() {
        val defaultWebPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(defaultWebPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.openReportBrokenSite {
            verifyWebCompatReporterViewItems(composeTestRule, defaultWebPage.url.toString())
            clickChooseReasonField(composeTestRule)
            clickSiteDoesNotLoadReason(composeTestRule)
            describeBrokenSiteProblem(
                composeTestRule,
                problemDescription = "Prolonged page loading time",
            )
        }
        closeApp(composeTestRule.activityRule)
        restartApp(composeTestRule.activityRule)

        browserScreen {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.openReportBrokenSite {
            verifyWhatIsBrokenField(composeTestRule)
            verifyBrokenSiteProblem(
                composeTestRule,
                problemDescription = "Prolonged page loading time",
                isDisplayed = false,
            )
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2939182
    @Test
    fun verifyReportBrokenSiteFormNotDisplayedWhenTelemetryIsDisabledTest() {
        val defaultWebPage = getGenericAsset(mockWebServer, 1)

        homeScreen {
        }.openThreeDotMenu(composeTestRule) {
        }.openSettings {
        }.openSettingsSubMenuDataCollection {
            clickUsageAndTechnicalDataToggle(composeTestRule)
            verifyUsageAndTechnicalDataToggle(composeTestRule, isChecked = false)
        }
        exitMenu()
        navigationToolbar {
        }.enterURLAndEnterToBrowser(defaultWebPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            openMoreMenu()
        }.openReportBrokenSite {
            verifyUrl("webcompat.com/issues/new")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080172
    @SmokeTest
    @Test
    fun verifyTheExtensionsMenuOptionTest() {
        homeScreen {
        }.openThreeDotMenu(composeTestRule) {
        }.openExtensionsFromMainMenu {
            verifyAddonsListIsDisplayed(true)
        }.goBackToHomeScreen {
            verifyHomeComponent(composeTestRule)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080173
    @Test
    fun verifyTheHistoryMenuOptionTest() {
        homeScreen {
        }.openThreeDotMenu(composeTestRule) {
        }.openHistory {
            verifyEmptyHistoryView()
        }.goBackToHomeScreen {
            verifyHomeComponent(composeTestRule)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080174
    @Test
    fun verifyTheBookmarksMenuOptionTest() {
        homeScreen {
        }.openThreeDotMenu(composeTestRule) {
        }.openBookmarks(composeTestRule) {
            verifyEmptyBookmarksMenuView()
        }.goBackToHomeScreen {
            verifyHomeComponent(composeTestRule)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080175
    @Test
    fun verifyTheDownloadsMenuOptionTest() {
        homeScreen {
        }.openThreeDotMenu(composeTestRule) {
        }.openDownloads {
            verifyEmptyDownloadsList(composeTestRule)
        }.goBackToHomeScreen(composeTestRule) {
            verifyHomeComponent(composeTestRule)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080176
    @Test
    fun verifyThePasswordsMenuOptionTest() {
        homeScreen {
        }.openThreeDotMenu(composeTestRule) {
        }.openPasswords {
            verifySecurityPromptForLogins()
            tapSetupLater()
            verifyEmptySavedLoginsListView()
        }.goBackToHomeScreen {
            verifyHomeComponent(composeTestRule)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080177
    @Test
    fun verifyTheSignInMenuOptionTest() {
        homeScreen {
        }.openThreeDotMenu(composeTestRule) {
        }.clickSignInMainMenuButton(composeTestRule) {
            verifyTurnOnSyncMenu()
        }.goBackToHomeScreen {
            verifyHomeComponent(composeTestRule)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080182
    @Test
    fun verifyTheQuitMenuOptionTest() {
        homeScreen {
        }.openThreeDotMenu(composeTestRule) {
        }.openSettings {
        }.openSettingsSubMenuDeleteBrowsingDataOnQuit {
            verifyDeleteBrowsingOnQuitEnabled(false)
            clickDeleteBrowsingOnQuitButtonSwitch()
            verifyDeleteBrowsingOnQuitEnabled(true)
        }.goBack {
            verifySettingsOptionSummary("Delete browsing data on quit", "On")
        }.goBack {
        }.openThreeDotMenu(composeTestRule) {
            clickQuitFirefoxButton()
            restartApp(composeTestRule.activityRule)
        }
        homeScreen {
            verifyHomeComponent(composeTestRule)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080125
    @SmokeTest
    @Test
    fun verifyTheMainMenuBackButtonTest() {
        val firstWebPage = getGenericAsset(mockWebServer, 1)
        val nextWebPage = getGenericAsset(mockWebServer, 2)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(firstWebPage.url) {
        }.openNavigationToolbar {
        }.enterURLAndEnterToBrowser(nextWebPage.url) {
            verifyUrl(nextWebPage.url.toString())
        }.openThreeDotMenu(composeTestRule) {
        }.goToPreviousPage {
            mDevice.waitForIdle()
            verifyUrl(firstWebPage.url.toString())
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080126
    @SmokeTest
    @Test
    fun verifyTheMainMenuForwardButtonTest() {
        val firstWebPage = getGenericAsset(mockWebServer, 1)
        val nextWebPage = getGenericAsset(mockWebServer, 2)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(firstWebPage.url) {
        }.openNavigationToolbar {
        }.enterURLAndEnterToBrowser(nextWebPage.url) {
            verifyUrl(nextWebPage.url.toString())
        }.openThreeDotMenu(composeTestRule) {
        }.goToPreviousPage {
            mDevice.waitForIdle()
            verifyUrl(firstWebPage.url.toString())
        }.openThreeDotMenu(composeTestRule) {
        }.goForward {
            verifyUrl(nextWebPage.url.toString())
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080127
    @Test
    fun verifyTheRefreshButtonTest() {
        val refreshWebPage = TestAssetHelper.getRefreshAsset(mockWebServer)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(refreshWebPage.url) {
            verifyPageContent("DEFAULT")
        }.openThreeDotMenu(composeTestRule) {
        }.clickRefreshButton {
            verifyPageContent("REFRESHED")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080134
    @SmokeTest
    @Test
    fun verifyTheExtensionsMainMenuListTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.clickExtensionsChevronFromMainMenu {
            verifyRecommendedAddonsViewFromRedesignedMainMenu(composeTestRule)
            clickCollapseExtensionsChevronFromMainMenu(composeTestRule)
            verifyExtensionsMainMenuOptionIsCollapsed(composeTestRule, areExtensionsInstalled = false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080135
    @Test
    fun verifyTheMoreMainMenuListTest() {
        val firstTestPage = TestAssetHelper.getFirstForeignWebPageAsset(mockWebServer)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(firstTestPage.url) {
        }.openThreeDotMenu(composeTestRule) {
            clickMoreOptionChevron()
            verifyMoreMainMenuItems()
            clickLessOptionChevron()
            verifyPageMainMenuItems()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080137
    @SmokeTest
    @Test
    fun verifyTheBookmarksMainMenuItemTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.openBookmarks(composeTestRule) {
            verifyEmptyBookmarksMenuView()
        }.goBackToBrowserScreen {
            verifyPageContent(testPage.content)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080140
    @Test
    fun verifyTheSignInMainMenuItemTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.clickSignInMainMenuButton(composeTestRule) {
            verifyTurnOnSyncMenu()
        }.goBack {
            verifyPageContent(testPage.content)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080144
    @Test
    fun verifyTheSettingsMainMenuItemTest() {
        val testPage = getGenericAsset(mockWebServer, 1)

        navigationToolbar {
        }.enterURLAndEnterToBrowser(testPage.url) {
        }.openThreeDotMenu(composeTestRule) {
        }.openSettings {
            verifySettingsView()
        }.goBackToBrowser {
            verifyPageContent(testPage.content)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080096
    @SmokeTest
    @Test
    fun verifyTheMainMenuBackButtonFromCustomTabTest() {
        val customMenuItem = "TestMenuItem"
        val customTabPage = getGenericAsset(mockWebServer, 4)

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                customTabPage.url.toString(),
                customMenuItem,
            ),
        )

        customTabScreen {
            clickPageObject(itemContainingText("Link 1"))
        }.openMainMenuFromRedesignedToolbar {
        }.clickBackButtonFromMenu(composeTestRule) {
            waitForPageToLoad(waitingTime)
        }

        browserScreen {
            verifyPageContent(customTabPage.content)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080097
    @SmokeTest
    @Test
    fun verifyTheMainMenuForwardButtonFromCustomTabTest() {
        val customMenuItem = "TestMenuItem"
        val firstCustomTabPage = getGenericAsset(mockWebServer, 4)
        val secondCustomTabPage = getGenericAsset(mockWebServer, 1)

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                firstCustomTabPage.url.toString(),
                customMenuItem,
            ),
        )

        customTabScreen {
            clickPageObject(itemContainingText("Link 1"))
        }.openMainMenuFromRedesignedToolbar {
        }.clickBackButtonFromMenu(composeTestRule) {
            waitForPageToLoad(waitingTime)
            verifyPageContent(firstCustomTabPage.content)
        }

        customTabScreen {
        }.openMainMenuFromRedesignedToolbar {
        }.clickForwardButtonFromMenu(composeTestRule) {
            waitForPageToLoad(waitingTime)
            verifyPageContent(secondCustomTabPage.content)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080098
    @Test
    fun verifyTheMainMenuRefreshButtonFromCustomTabTest() {
        val customMenuItem = "TestMenuItem"
        val customTabPage = TestAssetHelper.getRefreshAsset(mockWebServer)

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                customTabPage.url.toString(),
                customMenuItem,

                ),
        )

        browserScreen {
            verifyPageContent("DEFAULT")
        }
        customTabScreen {
        }.openMainMenuFromRedesignedToolbar {
        }.clickRefreshButton(composeTestRule) {
            verifyPageContent("REFRESHED")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080099
    @Test
    fun verifyTheMainMenuShareButtonFromCustomTabTest() {
        val customMenuItem = "TestMenuItem"
        val customTabPage = getGenericAsset(mockWebServer, 1)

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                customTabPage.url.toString(),
                customMenuItem,

                ),
        )

        customTabScreen {
        }.openMainMenuFromRedesignedToolbar {
        }.clickShareButtonFromRedesignedMenu(composeTestRule) {
            verifyShareTabLayout()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080102
    @Test
    fun verifySwitchToDesktopSiteIsDisabledOnPDFsFromCustomTabTest() {
        val customMenuItem = "TestMenuItem"
        val customTabPDF = getPdfFormAsset(mockWebServer)

        intentReceiverActivityTestRule.launchActivity(
            createCustomTabIntent(
                customTabPDF.url.toString(),
                customMenuItem,

                ),
        )

        browserScreen {
            verifyPageContent(customTabPDF.content)
        }

        customTabScreen {
        }.openMainMenuFromRedesignedToolbar {
            verifySwitchToDesktopSiteButton(composeTestRule)
            verifyDesktopSiteButtonState(composeTestRule, isEnabled = false)
        }
    }
}
