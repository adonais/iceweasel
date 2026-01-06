/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:Suppress("DEPRECATION")

package org.mozilla.fenix.ui

import android.content.Context
import android.content.res.Configuration
import android.hardware.camera2.CameraManager
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.core.net.toUri
import androidx.test.espresso.Espresso
import androidx.test.filters.SdkSuppress
import androidx.test.rule.ActivityTestRule
import mozilla.components.concept.engine.utils.EngineReleaseChannel
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assume
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.FenixApplication
import org.mozilla.fenix.IntentReceiverActivity
import org.mozilla.fenix.R
import org.mozilla.fenix.customannotations.SkipLeaks
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.helpers.AppAndSystemHelper.enableOrDisableBackGestureNavigationOnDevice
import org.mozilla.fenix.helpers.AppAndSystemHelper.grantSystemPermission
import org.mozilla.fenix.helpers.AppAndSystemHelper.runWithCondition
import org.mozilla.fenix.helpers.AppAndSystemHelper.verifyKeyboardVisibility
import org.mozilla.fenix.helpers.DataGenerationHelper.createCustomTabIntent
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.MatcherHelper.itemWithText
import org.mozilla.fenix.helpers.MockBrowserDataHelper.createBookmarkItem
import org.mozilla.fenix.helpers.MockBrowserDataHelper.createHistoryItem
import org.mozilla.fenix.helpers.MockBrowserDataHelper.generateBookmarkFolder
import org.mozilla.fenix.helpers.MockBrowserDataHelper.setCustomSearchEngine
import org.mozilla.fenix.helpers.SearchDispatcher
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.helpers.TestAssetHelper.htmlControlsFormAsset
import org.mozilla.fenix.helpers.TestAssetHelper.loremIpsumAsset
import org.mozilla.fenix.helpers.TestAssetHelper.waitingTimeLong
import org.mozilla.fenix.helpers.TestHelper
import org.mozilla.fenix.helpers.TestHelper.clickSnackbarButton
import org.mozilla.fenix.helpers.TestHelper.exitMenu
import org.mozilla.fenix.helpers.TestHelper.verifyDarkThemeApplied
import org.mozilla.fenix.helpers.TestHelper.verifyLightThemeApplied
import org.mozilla.fenix.helpers.TestSetup
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.nimbus.FxNimbus
import org.mozilla.fenix.ui.robots.checkTextSizeOnWebsite
import org.mozilla.fenix.ui.robots.clickContextMenuItem
import org.mozilla.fenix.ui.robots.customTabScreen
import org.mozilla.fenix.ui.robots.homeScreen
import org.mozilla.fenix.ui.robots.longClickPageObject
import org.mozilla.fenix.ui.robots.navigationToolbar
import org.mozilla.fenix.ui.robots.searchScreen

class NavigationToolbarTestCompose : TestSetup() {
    private val customTabActionButton = "CustomActionButton"

    private lateinit var searchMockServer: MockWebServer

    private val bookmarkFolderName = "My Folder"

    private val queryString: String = "firefox"

    private val defaultSearchEngineList =
        listOf(
            "Bing",
            "DuckDuckGo",
            "Google",
        )

    private val generalEnginesList = listOf("DuckDuckGo", "Google", "Bing")
    private val topicEnginesList = listOf("Wikipedia (en)")

    private val firefoxSuggestHeader = getStringResource(R.string.firefox_suggest_header)

    private fun getUiTheme(): Boolean {
        val mode =
            composeTestRule.activity.resources?.configuration?.uiMode?.and(Configuration.UI_MODE_NIGHT_MASK)

        return when (mode) {
            Configuration.UI_MODE_NIGHT_YES -> true // dark theme is set
            Configuration.UI_MODE_NIGHT_NO -> false // dark theme is not set, using light theme
            else -> false // default option is light theme
        }
    }

    @get:Rule
    val composeTestRule =
        AndroidComposeTestRule(
            HomeActivityIntentTestRule(
                isComposableToolbarEnabled = true,
                isMenuRedesignEnabled = true,
                isPWAsPromptEnabled = false,
                isWallpaperOnboardingEnabled = false,
                isOpenInAppBannerEnabled = false,
                isMicrosurveyEnabled = false,
                isTermsOfServiceAccepted = true,
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

    @Before
    override fun setUp() {
        super.setUp()
        searchMockServer = MockWebServer().apply {
            dispatcher = SearchDispatcher()
            start()
        }
    }

    @After
    override fun tearDown() {
        super.tearDown()
        searchMockServer.shutdown()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135074
    @SmokeTest
    @Test
    fun verifySecurePageSecuritySubMenuTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val defaultWebPage = "https://mozilla-mobile.github.io/testapp/loginForm"
            val defaultWebPageTitle = "Login_form"

            navigationToolbar {
            }.enterURLAndEnterToBrowserWithComposableToolbar(
                composeTestRule,
                defaultWebPage.toUri(),
            ) {
                verifyPageContent("Login Form")
            }.openSiteSecuritySheetWithComposableToolbar(composeTestRule) {
                verifyQuickActionSheet(defaultWebPage, true)
                openSecureConnectionSubMenu(true)
                verifySecureConnectionSubMenu(defaultWebPageTitle, defaultWebPage, true)
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135075
    @SmokeTest
    @Test
    fun verifyInsecurePageSecuritySubMenuTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val defaultWebPage = mockWebServer.getGenericAsset(1)

            navigationToolbar {
            }.enterURLAndEnterToBrowserWithComposableToolbar(composeTestRule, defaultWebPage.url) {
                verifyPageContent(defaultWebPage.content)
            }.openSiteSecuritySheetWithComposableToolbar(composeTestRule) {
                verifyQuickActionSheet(defaultWebPage.url.toString(), false)
                openSecureConnectionSubMenu(false)
                verifySecureConnectionSubMenu(
                    defaultWebPage.title,
                    defaultWebPage.url.toString(),
                    false,
                )
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135076
    @SmokeTest
    @Test
    @SkipLeaks
    fun verifyClearCookiesFromQuickSettingsTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val loginPage = "https://mozilla-mobile.github.io/testapp/loginForm"
            val originWebsite = "mozilla-mobile.github.io"

            navigationToolbar {
            }.enterURLAndEnterToBrowserWithComposableToolbar(composeTestRule, loginPage.toUri()) {
                waitForPageToLoad(waitingTimeLong)
            }.openSiteSecuritySheetWithComposableToolbar(composeTestRule) {
                clickQuickActionSheetClearSiteData()
                verifyClearSiteDataPrompt(originWebsite)
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135005
    @SmokeTest
    @Test
    fun verifyFontSizingChangeTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            // Goes through the settings and changes the default text on a webpage, then verifies if the text has changed.
            val fenixApp = composeTestRule.activity.applicationContext as FenixApplication
            val webpage = mockWebServer.loremIpsumAsset.url

            // This value will represent the text size percentage the webpage will scale to. The default value is 100%.
            val textSizePercentage = 180

            homeScreen {
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openSettings {
            }.openAccessibilitySubMenu {
                clickFontSizingSwitch()
                verifyEnabledMenuItems()
                changeTextSizeSlider(textSizePercentage)
                verifyTextSizePercentage(textSizePercentage)
            }.goBack {
            }.goBack {
            }
            navigationToolbar {
            }.enterURLAndEnterToBrowserWithComposableToolbar(composeTestRule, webpage) {
                checkTextSizeOnWebsite(textSizePercentage, fenixApp.components)
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openSettings {
            }.openAccessibilitySubMenu {
                clickFontSizingSwitch()
                verifyMenuItemsAreDisabled()
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135034
    @SmokeTest
    @Test
    fun verifySearchForBookmarkedItemsTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val firstWebPage = mockWebServer.getGenericAsset(1)
            val secondWebPage = mockWebServer.htmlControlsFormAsset

            val newFolder = generateBookmarkFolder(title = bookmarkFolderName, position = null)
            createBookmarkItem(firstWebPage.url.toString(), firstWebPage.title, null, newFolder)
            createBookmarkItem(secondWebPage.url.toString(), secondWebPage.title, null)

            homeScreen {
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openBookmarks(composeTestRule) {
            }.clickSearchButton {
                // Search for a valid term
                typeSearchWithComposableToolbar(composeTestRule, firstWebPage.title)
                verifySearchSuggestionsAreDisplayed(composeTestRule, firstWebPage.url.toString())
                verifySuggestionsAreNotDisplayed(composeTestRule, secondWebPage.url.toString())
                // Search for invalid term
                typeSearchWithComposableToolbar(composeTestRule, "Android")
                verifySuggestionsAreNotDisplayed(composeTestRule, firstWebPage.url.toString())
                verifySuggestionsAreNotDisplayed(composeTestRule, secondWebPage.url.toString())
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135037
    @SmokeTest
    @Test
    fun verifyTheCustomTabsMainMenuItemsTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val customMenuItem = "TestMenuItem"
            val customTabPage = mockWebServer.getGenericAsset(1)

            intentReceiverActivityTestRule.launchActivity(
                createCustomTabIntent(
                    customTabPage.url.toString(),
                    customMenuItem,
                ),
            )

            customTabScreen {
                verifyCustomTabCloseButtonWithComposableToolbar(composeTestRule)
            }.openMainMenuWithComposableToolbar(composeTestRule) {
                verifyRedesignedCustomTabsMainMenuItemsExist(customMenuItem, true)
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135106
    @SmokeTest
    @Test
    fun verifyShowSearchSuggestionsToggleTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
                // The Google related suggestions aren't always displayed on cold run
                // Bugzilla ticket: https://bugzilla.mozilla.org/show_bug.cgi?id=1813587
                clickSearchSelectorButtonWithComposableToolbar(composeTestRule)
                selectTemporarySearchMethodWithComposableToolbar(composeTestRule, "DuckDuckGo")
                typeSearchWithComposableToolbar(composeTestRule, "mozilla ")
                verifySearchSuggestionsAreDisplayed(composeTestRule, "mozilla firefox")
            }.dismissSearchBar {
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openSettings {
            }.openSearchSubMenu {
                toggleShowSearchSuggestions()
            }.goBack {
            }.goBack {
            }.openSearchWithComposableToolbar(composeTestRule) {
                // The Google related suggestions aren't always displayed on cold run
                // Bugzilla ticket: https://bugzilla.mozilla.org/show_bug.cgi?id=1813587
                clickSearchSelectorButtonWithComposableToolbar(composeTestRule)
                selectTemporarySearchMethodWithComposableToolbar(composeTestRule, "DuckDuckGo")
                typeSearchWithComposableToolbar(composeTestRule, "mozilla")
                verifySuggestionsWithComposableToolbarAreNotDisplayed(composeTestRule)
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135025
    @SmokeTest
    @Test
    fun verifyTheDefaultSearchEngineCanBeChangedTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            // Goes through the settings and changes the default search engine, then verifies it has changed.
            defaultSearchEngineList.forEach {
                homeScreen {
                }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
                }.openSettings {
                }.openSearchSubMenu {
                    openDefaultSearchEngineMenu()
                    changeDefaultSearchEngine(it)
                    exitMenu()
                }
                searchScreen {
                    verifySearchEngineIconWithComposableToolbar(
                        composeTestRule = composeTestRule,
                        name = it,
                    )
                }
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135009
    @SmokeTest
    @Test
    fun scanQRCodeToOpenAWebpageTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val cameraManager =
                TestHelper.appContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            Assume.assumeTrue(cameraManager.cameraIdList.isNotEmpty())

            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
                clickScanButtonWithComposableToolbar(composeTestRule)
                grantSystemPermission()
                verifyScannerOpen()
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135051
    @SmokeTest
    @Test
    fun verifyHistorySearchWithBrowsingHistoryTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val firstPageUrl = searchMockServer.getGenericAsset(1)
            val secondPageUrl = searchMockServer.getGenericAsset(2)

            createHistoryItem(firstPageUrl.url.toString())
            createHistoryItem(secondPageUrl.url.toString())

            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
                clickSearchSelectorButtonWithComposableToolbar(composeTestRule)
                selectTemporarySearchMethodWithComposableToolbar(
                    composeTestRule,
                    searchEngineName = "History",
                )
                typeSearchWithComposableToolbar(composeTestRule, searchTerm = "Mozilla")
                verifySuggestionsAreNotDisplayed(rule = composeTestRule, "Mozilla")
                clickClearButtonWithComposableToolbar(composeTestRule)
                typeSearchWithComposableToolbar(composeTestRule, searchTerm = "generic")
                // verifyTypedToolbarText("generic", exists = true)
                verifySearchSuggestionsAreDisplayed(
                    rule = composeTestRule,
                    searchSuggestions = arrayOf(
                        firstPageUrl.url.toString(),
                        secondPageUrl.url.toString(),
                    ),
                )
            }.clickSearchSuggestion(firstPageUrl.url.toString()) {
                verifyUrlWithComposableToolbar(composeTestRule, firstPageUrl.url.toString())
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135109
    // Verifies a temporary change of search engine from the Search shortcut menu
    @SmokeTest
    @Test
    fun searchEnginesCanBeChangedTemporarilyFromSearchSelectorMenuTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                    composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            (generalEnginesList + topicEnginesList).forEach {
                homeScreen {
                }.openSearchWithComposableToolbar(composeTestRule) {
                    clickSearchSelectorButtonWithComposableToolbar(composeTestRule)
                    verifySearchShortcutListWithComposableToolbar(composeTestRule, it)
                    selectTemporarySearchMethodWithComposableToolbar(composeTestRule, it)
                    verifySearchEngineIconWithComposableToolbar(composeTestRule, it)
                }.submitQueryWithComposableToolbar(composeTestRule, "mozilla ") {
                    verifyUrlWithComposableToolbar(composeTestRule, "mozilla")
                }.goToHomescreenWithComposableToolbar(composeTestRule) {
                }
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135027
    @SmokeTest
    @Test
    fun searchHistoryNotRememberedInPrivateBrowsingTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            TestHelper.appContext.settings().shouldShowSearchSuggestionsInPrivate = true

            val firstPageUrl = searchMockServer.getGenericAsset(1)
            val searchEngineName = "TestSearchEngine"

            setCustomSearchEngine(searchMockServer, searchEngineName)
            createBookmarkItem(firstPageUrl.url.toString(), firstPageUrl.title, 1u)

            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
            }.submitQueryWithComposableToolbar(composeTestRule, "test page 1") {
            }.goToHomescreenWithComposableToolbar(composeTestRule) {
                togglePrivateBrowsingModeOnOff(composeTestRule)
            }.openSearchWithComposableToolbar(composeTestRule) {
            }.submitQueryWithComposableToolbar(composeTestRule, "test page 2") {
            }.openSearchWithComposableToolbar(composeTestRule) {
                typeSearchWithComposableToolbar(composeTestRule, searchTerm = "test page")
                verifyTheSuggestionsHeader(composeTestRule, firefoxSuggestHeader)
                verifyTheSuggestionsHeader(composeTestRule, "TestSearchEngine search")
                verifySearchSuggestionsAreDisplayed(
                    rule = composeTestRule,
                    searchSuggestions = arrayOf(
                        "test page 1",
                        firstPageUrl.url.toString(),
                    ),
                )
                // 2 search engine suggestions and 2 browser suggestions (1 history, 1 bookmark)
                verifySearchSuggestionsCount(
                    composeTestRule,
                    numberOfSuggestions = 4,
                    searchTerm = "test page",
                )
                verifySuggestionsAreNotDisplayed(
                    composeTestRule,
                    searchSuggestions = arrayOf(
                        "test page 2",
                    ),
                )
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135012
    @SmokeTest
    @Test
    fun searchResultsOpenedInNewTabsGenerateSearchGroupsTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val firstPageUrl = searchMockServer.getGenericAsset(1).url
            val secondPageUrl = searchMockServer.getGenericAsset(2).url
            val searchEngineName = "TestSearchEngine"
            // setting our custom mockWebServer search URL
            setCustomSearchEngine(searchMockServer, searchEngineName)

            // Performs a search and opens 2 dummy search results links to create a search group
            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
            }.submitQueryWithComposableToolbar(composeTestRule, queryString) {
                longClickPageObject(itemWithText("Link 1"))
                clickContextMenuItem("Open link in new tab")
                clickSnackbarButton(composeTestRule, "SWITCH")
                verifyUrlWithComposableToolbar(composeTestRule, firstPageUrl.toString())
                Espresso.pressBack()
                longClickPageObject(itemWithText("Link 2"))
                clickContextMenuItem("Open link in new tab")
                clickSnackbarButton(composeTestRule, "SWITCH")
                verifyUrlWithComposableToolbar(composeTestRule, secondPageUrl.toString())
            }.goToHomescreenWithComposableToolbar(composeTestRule) {
                verifyRecentlyVisitedSearchGroupDisplayed(
                    composeTestRule,
                    shouldBeDisplayed = true,
                    searchTerm = queryString,
                    groupSize = 3,
                )
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135013
    @SmokeTest
    @Test
    fun searchGroupIsNotGeneratedForLinksOpenedInPrivateTabsTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            // setting our custom mockWebServer search URL
            val searchEngineName = "TestSearchEngine"
            setCustomSearchEngine(searchMockServer, searchEngineName)

            // Performs a search and opens 2 dummy search results links to create a search group
            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
            }.submitQueryWithComposableToolbar(composeTestRule, queryString) {
                longClickPageObject(itemWithText("Link 1"))
                clickContextMenuItem("Open link in private tab")
                longClickPageObject(itemWithText("Link 2"))
                clickContextMenuItem("Open link in private tab")
            }.openTabDrawerWithComposableToolbar(composeTestRule) {
            }.toggleToPrivateTabs {
            }.openPrivateTab(0) {
            }.openTabDrawerWithComposableToolbar(composeTestRule) {
            }.openPrivateTab(1) {
            }.goToHomescreenWithComposableToolbar(composeTestRule, isPrivateModeEnabled = true) {
                togglePrivateBrowsingModeOnOff(composeTestRule = composeTestRule)
                verifyRecentlyVisitedSearchGroupDisplayed(
                    composeTestRule,
                    shouldBeDisplayed = false,
                    searchTerm = queryString,
                    groupSize = 3,
                )
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openHistory {
                verifyHistoryItemExists(shouldExist = false, item = "3 sites")
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135071
    // Swipes the nav bar left/right to switch between tabs
    @SmokeTest
    @Test
    @SkipLeaks
    fun swipeToSwitchTabTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val firstWebPage = mockWebServer.getGenericAsset(1)
            val secondWebPage = mockWebServer.getGenericAsset(2)

            // Disable the back gesture from the edge of the screen on the device.
            enableOrDisableBackGestureNavigationOnDevice(backGestureNavigationEnabled = false)

            navigationToolbar {
            }.enterURLAndEnterToBrowserWithComposableToolbar(composeTestRule, firstWebPage.url) {
            }.openTabDrawerWithComposableToolbar(composeTestRule) {
            }.openNewTab {
            }.submitQueryWithComposableToolbar(composeTestRule, secondWebPage.url.toString()) {
                swipeNavBarRightWithComposableToolbar(composeTestRule, secondWebPage.url.toString())
                verifyUrlWithComposableToolbar(composeTestRule, firstWebPage.url.toString())
                swipeNavBarLeftWithComposableToolbar(composeTestRule, firstWebPage.url.toString())
                verifyUrlWithComposableToolbar(composeTestRule, secondWebPage.url.toString())
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135000
    @Test
    fun changeThemeOfTheAppTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            homeScreen {
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openSettings {
            }.openCustomizeSubMenu {
                verifyThemes()
                selectDarkMode()
                verifyDarkThemeApplied(getUiTheme())
                selectLightMode()
                verifyLightThemeApplied(getUiTheme())
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135001
    @Test
    fun setToolbarPositionTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            homeScreen {
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openSettings {
            }.openCustomizeSubMenu {
                verifyAddressBarPositionPreference("Top")
                clickBottomToolbarToggle()
                verifyAddressBarPositionPreference("Bottom")
            }.goBack {
            }.goBack {
                verifyComposableToolbarPosition(bottomPosition = true)
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openSettings {
            }.openCustomizeSubMenu {
                clickTopToolbarToggle()
                verifyAddressBarPositionPreference("Top")
                exitMenu()
            }
            homeScreen {
                verifyComposableToolbarPosition(bottomPosition = false)
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135099
    @Test
    fun verifyEnabledUrlAutocompleteToggleTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            // Currently part of an experiment https://bugzilla.mozilla.org/show_bug.cgi?id=1842106
            // Check if "Top domain" suggestions for the address bar's autocomplete are enabled
            if (FxNimbus.features.suggestShippedDomains.value().enabled) {
                // If true it will use the hardcoded list of "top domain" suggestions for the address bar's autocomplete suggestions
                homeScreen {
                }.openSearchWithComposableToolbar(composeTestRule) {
                    typeSearchWithComposableToolbar(composeTestRule, "mo")
                    verifyTypedToolbarTextWithComposableToolbar(composeTestRule, "monster.com", exists = true)
                    typeSearchWithComposableToolbar(composeTestRule, "moz")
                    verifyTypedToolbarTextWithComposableToolbar(composeTestRule, "mozilla.org", exists = true)
                }
            } else {
                // The suggestions for the address bar's autocomplete will take use of the user's local browsing history and bookmarks
                createHistoryItem("https://github.com/mozilla-mobile/fenix")
                createBookmarkItem(
                    "https://github.com/mozilla-mobile/focus-android",
                    "focus-android",
                    1u,
                )

                homeScreen {
                }.openSearchWithComposableToolbar(composeTestRule) {
                    typeSearchWithComposableToolbar(composeTestRule, "moz")
                    // "Top domain" suggestions from the address bar's autocomplete are disabled, "moz" shouldn't autocomplete to mozilla.org
                    verifyTypedToolbarTextWithComposableToolbar(composeTestRule, "mozilla.org", exists = false)
                    // The address bar's autocomplete should take use of the browsing history
                    // Autocomplete with the history items url
                    typeSearchWithComposableToolbar(composeTestRule, "github.com/mozilla-mobile/f")
                    verifyTypedToolbarTextWithComposableToolbar(
                        composeTestRule,
                        "github.com/mozilla-mobile/fenix",
                        exists = true,
                    )
                    // The address bar's autocomplete should also take use of the saved bookmarks
                    // Autocomplete with the bookmarked items url
                    typeSearchWithComposableToolbar(composeTestRule, "github.com/mozilla-mobile/fo")
                    verifyTypedToolbarTextWithComposableToolbar(
                        composeTestRule,
                        "github.com/mozilla-mobile/focus-android",
                        exists = true,
                    )
                    // It should not autocomplete with links that are not part of browsing history or bookmarks
                    typeSearchWithComposableToolbar(composeTestRule, "github.com/mozilla-mobile/fi")
                    verifyTypedToolbarTextWithComposableToolbar(
                        composeTestRule,
                        "github.com/mozilla-mobile/firefox-android",
                        exists = false,
                    )
                }
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135102
    @Test
    fun disableSearchBrowsingHistorySuggestionsToggleTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val websiteURL = mockWebServer.getGenericAsset(1).url.toString()

            createHistoryItem(websiteURL)

            homeScreen {
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openSettings {
            }.openSearchSubMenu {
                switchSearchHistoryToggle()
                exitMenu()
            }

            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
                typeSearchWithComposableToolbar(composeTestRule, "test")
                verifySuggestionsAreNotDisplayed(
                    composeTestRule,
                    "Firefox Suggest",
                    websiteURL,
                )
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135103
    @Test
    fun disableSearchBookmarksToggleTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val website = mockWebServer.getGenericAsset(1)

            createBookmarkItem(website.url.toString(), website.title, 1u)

            homeScreen {
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openSettings {
            }.openSearchSubMenu {
                switchSearchBookmarksToggle()
                // We want to avoid confusion between history and bookmarks searches,
                // so we'll disable this too.
                switchSearchHistoryToggle()
                exitMenu()
            }

            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
                typeSearchWithComposableToolbar(composeTestRule, "test")
                verifySuggestionsAreNotDisplayed(
                    composeTestRule,
                    "Firefox Suggest",
                    website.title,
                )
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135105
    @SdkSuppress(minSdkVersion = 34)
    @Test
    fun verifyShowVoiceSearchToggleTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
                verifyVoiceSearchButtonWithComposableToolbar(composeTestRule, isDisplayed = true)
                startVoiceSearchWithComposableToolbar(composeTestRule)
                closeVoiceSearchDialog()
            }.dismissSearchBar {
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openSettings {
            }.openSearchSubMenu {
                toggleVoiceSearch()
                exitMenu()
            }
            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
                verifyVoiceSearchButtonWithComposableToolbar(composeTestRule, isDisplayed = false)
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135107
    @Test
    fun doNotAllowSearchSuggestionsInPrivateBrowsingTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            homeScreen {
                togglePrivateBrowsingModeOnOff(composeTestRule = composeTestRule)
            }.openSearchWithComposableToolbar(composeTestRule) {
                typeSearchWithComposableToolbar(composeTestRule, "mozilla")
                verifyAllowSuggestionsInPrivateModeDialogWithComposableToolbar(composeTestRule)
                denySuggestionsInPrivateMode()
                verifySuggestionsAreNotDisplayed(composeTestRule, "mozilla firefox")
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135006
    @Test
    fun verifyClearSearchButtonTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
                typeSearchWithComposableToolbar(composeTestRule, queryString)
                clickClearButtonWithComposableToolbar(composeTestRule)
                verifySearchBarPlaceholderWithComposableToolbar(composeTestRule, "Search or enter address")
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135044
    @Test
    fun verifySearchForHistoryItemsTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val firstWebPage = mockWebServer.getGenericAsset(1)
            val secondWebPage = mockWebServer.htmlControlsFormAsset

            navigationToolbar {
            }.enterURLAndEnterToBrowserWithComposableToolbar(composeTestRule, firstWebPage.url) {
            }
            navigationToolbar {
            }.enterURLAndEnterToBrowserWithComposableToolbar(composeTestRule, secondWebPage.url) {
            }.openThreeDotMenuWithComposableToolbar(composeTestRule) {
            }.openHistory {
            }.clickSearchButton {
                // Search for a valid term
                typeSearchWithComposableToolbar(composeTestRule, firstWebPage.title)
                verifySearchSuggestionsAreDisplayed(composeTestRule, firstWebPage.url.toString())
                verifySuggestionsAreNotDisplayed(composeTestRule, secondWebPage.url.toString())
                clickClearButtonWithComposableToolbar(composeTestRule)
                // Search for invalid term
                typeSearchWithComposableToolbar(composeTestRule, "Android")
                verifySuggestionsAreNotDisplayed(composeTestRule, firstWebPage.url.toString())
                verifySuggestionsAreNotDisplayed(composeTestRule, secondWebPage.url.toString())
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135049
    @Test
    fun verifyHistorySearchWithoutBrowsingHistoryTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
                clickSearchSelectorButtonWithComposableToolbar(composeTestRule)
                selectTemporarySearchMethodWithComposableToolbar(composeTestRule, "History")
                typeSearchWithComposableToolbar(composeTestRule, searchTerm = "Mozilla")
                verifySuggestionsAreNotDisplayed(rule = composeTestRule, "Mozilla")
                clickClearButtonWithComposableToolbar(composeTestRule)
                verifySearchBarPlaceholderWithComposableToolbar(composeTestRule, "Search history")
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135015
    @SdkSuppress(minSdkVersion = 34)
    @Test
    fun verifySearchBarItemsTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            navigationToolbar {
                verifyDefaultSearchEngineWithComposableToolbar(composeTestRule, "Google")
                verifySearchBarPlaceholderWithComposableToolbar(composeTestRule)
            }.clickURLBarWithComposableToolbar(composeTestRule) {
                verifyKeyboardVisibility(isExpectedToBeVisible = true)
                verifyScanButtonWithComposableToolbar(composeTestRule, isDisplayed = true)
                verifyVoiceSearchButtonVisibility(enabled = true)
                verifySearchBarPlaceholderWithComposableToolbar(composeTestRule, "Search or enter address")
                typeSearchWithComposableToolbar(composeTestRule, "mozilla ")
                verifyScanButtonWithComposableToolbar(composeTestRule, isDisplayed = false)
                verifyVoiceSearchButtonVisibility(enabled = true)
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135016
    @Test
    fun verifySearchSelectorMenuItemsTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            homeScreen {
            }.openSearchWithComposableToolbar(composeTestRule) {
                clickSearchSelectorButtonWithComposableToolbar(composeTestRule)
                verifySearchShortcutListWithComposableToolbar(
                    composeTestRule = composeTestRule,
                    *generalEnginesList.toTypedArray(),
                    *topicEnginesList.toTypedArray(),
                    "Bookmarks",
                    "Tabs",
                    "History",
                    "Search settings",
                )
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135021
    @SdkSuppress(minSdkVersion = 34)
    @Test
    fun verifyTabsSearchItemsTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            searchScreen {
                clickSearchSelectorButtonWithComposableToolbar(composeTestRule)
                selectTemporarySearchMethodWithComposableToolbar(composeTestRule, "Tabs")
                verifyVoiceSearchButtonWithComposableToolbar(composeTestRule, isDisplayed = true)
                verifySearchBarPlaceholderWithComposableToolbar(composeTestRule, "Search tabs")
                verifyScanButtonWithComposableToolbar(composeTestRule, isDisplayed = false)
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135048
    @SdkSuppress(minSdkVersion = 34)
    @Test
    fun verifyHistorySearchItemsTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            searchScreen {
                clickSearchSelectorButtonWithComposableToolbar(composeTestRule)
                selectTemporarySearchMethodWithComposableToolbar(composeTestRule, "History")
                verifyVoiceSearchButtonWithComposableToolbar(composeTestRule, isDisplayed = true)
                verifySearchBarPlaceholderWithComposableToolbar(composeTestRule, "Search history")
                verifyScanButtonWithComposableToolbar(composeTestRule, isDisplayed = false)
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3135036
    @Test
    fun verifyCustomTabViewItemsTest() {
        runWithCondition(
            composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.BETA &&
                composeTestRule.activity.components.core.engine.version.releaseChannel !== EngineReleaseChannel.RELEASE,
        ) {
            val customTabPage = mockWebServer.getGenericAsset(1)

            intentReceiverActivityTestRule.launchActivity(
                createCustomTabIntent(
                    pageUrl = customTabPage.url.toString(),
                    customActionButtonDescription = customTabActionButton,
                ),
            )

            customTabScreen {
                verifyCustomTabCloseButtonWithComposableToolbar(composeTestRule)
                verifyCustomTabsSiteInfoButtonWithComposableToolbar(composeTestRule)
                verifyCustomTabToolbarTitleWithComposableToolbar(composeTestRule, customTabPage.title)
                verifyCustomTabUrlWithComposableToolbar(composeTestRule, customTabPage.url.toString())
                verifyCustomTabActionButtonWithComposableToolbar(composeTestRule, customTabActionButton)
                verifyCustomTabsShareButtonWithComposableToolbar(composeTestRule)
                verifyMainMenuComposeButtonWithComposableToolbar(composeTestRule)
                clickCustomTabCloseButtonWithComposableToolbar(composeTestRule)
            }
            homeScreen {
                verifyHomeScreenAppBarItems()
            }
        }
    }
}
