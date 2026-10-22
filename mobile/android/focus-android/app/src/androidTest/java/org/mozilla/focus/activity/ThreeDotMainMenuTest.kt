/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
package org.mozilla.focus.activity

import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.platform.app.InstrumentationRegistry.getInstrumentation
import androidx.test.uiautomator.By
import androidx.test.uiautomator.SearchCondition
import androidx.test.uiautomator.Searchable
import androidx.test.uiautomator.Until
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mozilla.focus.R
import org.mozilla.focus.activity.robots.browserScreen
import org.mozilla.focus.activity.robots.homeScreen
import org.mozilla.focus.activity.robots.searchScreen
import org.mozilla.focus.helpers.FeatureSettingsHelper
import org.mozilla.focus.helpers.FocusTestRule
import org.mozilla.focus.helpers.MainActivityFirstrunTestRule
import org.mozilla.focus.helpers.RetryTestRule
import org.mozilla.focus.helpers.TestAssetHelper.getGenericTabAsset
import org.mozilla.focus.helpers.TestHelper
import org.mozilla.focus.testAnnotations.SmokeTest

/** Verifies main menu items on the homescreen and on a browser page. */
class ThreeDotMainMenuTest {
    private val featureSettingsHelper = FeatureSettingsHelper()

    @get:Rule(order = 0) val focusTestRule: FocusTestRule = FocusTestRule()

    private val webServerRule
        get() = focusTestRule.mockWebServerRule

    @get:Rule val mActivityTestRule = MainActivityFirstrunTestRule(showFirstRun = false)

    @Rule @JvmField val retryTestRule = RetryTestRule(3)

    @Before
    fun setUp() {
        featureSettingsHelper.setCfrForTrackingProtectionEnabled(false)
    }

    @After
    fun tearDown() {
        featureSettingsHelper.resetAllFeatureFlags()
    }

    @SmokeTest
    @Test
    fun homeScreenMenuItemsTest() {
        homeScreen {}
            .openMainMenu {
                verifyHelpPageLinkExists()
                verifySettingsButtonExists()
            }
    }

    @SmokeTest
    @Test
    fun dismissAndReopenHomeMenuWithKeyboardTest() {
        homeScreen {}.openSearchBar {}
        waitForKeyboardVisibility(true)

        homeScreen {}
            .openMainMenu {
                verifyHelpPageLinkExists()
                verifySettingsButtonExists()
                waitForKeyboardVisibility(false)
                TestHelper.mDevice.pressBack()
            }

        assertTrue(
            TestHelper.mDevice.wait(
                Until.gone(By.text(TestHelper.getStringResource(R.string.menu_help))),
                TestHelper.waitingTime,
            )
        )
        homeScreen {
            verifyEmptySearchBar()
        }
            .openMainMenu {
                verifyHelpPageLinkExists()
            }
            .openSettings {
                verifySettingsMenuItems()
            }
    }

    @SmokeTest
    @Test
    fun browserMenuItemsTest() {
        val pageUrl = webServerRule.server.getGenericTabAsset(1).url

        searchScreen {}
            .loadPage(pageUrl) {
                verifyPageContent("Tab 1")
            }
            .openMainMenu {
                verifyShareButtonExists()
                verifyAddToHomeButtonExists()
                verifyFindInPageExists()
                verifyOpenInButtonExists()
                verifyRequestDesktopSiteExists()
                verifySettingsButtonExists()
                verifyReportSiteIssueButtonExists()
            }
    }

    @SmokeTest
    @Test
    fun dismissAndReopenBrowserMenuTest() {
        val page = webServerRule.server.getGenericTabAsset(1)

        searchScreen {}
            .loadPage(page.url) {
                verifyPageContent(page.content)
            }
            .openMainMenu {
                verifyFindInPageExists()
                TestHelper.mDevice.pressBack()
            }

        browserScreen {
            verifyPageURL(page.url)
        }
            .openMainMenu {
                verifySettingsButtonExists()
            }
            .openSettings {
                verifySettingsMenuItems()
            }
    }

    @SmokeTest
    @Test
    fun shareTabTest() {
        val pageUrl = webServerRule.server.getGenericTabAsset(1).url

        searchScreen {}
            .loadPage(pageUrl) {
                progressBar.waitUntilGone(TestHelper.waitingTime)
            }
            .openMainMenu {}
            .openShareScreen {
                verifyShareAppsListOpened()
                TestHelper.mDevice.pressBack()
            }
    }

    @SmokeTest
    @Test
    fun findInPageTest() {
        val pageUrl = webServerRule.server.getGenericTabAsset(1).url

        searchScreen {}
            .loadPage(pageUrl) {
                progressBar.waitUntilGone(TestHelper.waitingTime)
            }
            .openMainMenu {}
            .openFindInPage {
                enterFindInPageQuery("tab")
                verifyFindInPageResult("1/3")
                clickFindInPageNextButton()
                verifyFindInPageResult("2/3")
                clickFindInPageNextButton()
                verifyFindInPageResult("3/3")
                clickFindInPagePrevButton()
                verifyFindInPageResult("2/3")
                clickFindInPagePrevButton()
                verifyFindInPageResult("1/3")
                closeFindInPage()
            }
    }

    @SmokeTest
    @Test
    fun switchDesktopModeTest() {
        val pageUrl = webServerRule.server.getGenericTabAsset(1).url

        searchScreen {}
            .loadPage(pageUrl) {
                progressBar.waitUntilGone(TestHelper.waitingTime)
                verifyPageContent("mobile-site")
            }
            .openMainMenu {}
            .switchDesktopSiteMode {
                progressBar.waitUntilGone(TestHelper.waitingTime)
                verifyPageContent("desktop-site")
            }
            .openMainMenu {
                verifyRequestDesktopSiteIsEnabled(true)
            }
            .switchDesktopSiteMode {
                verifyPageContent("mobile-site")
            }
            .openMainMenu {
                verifyRequestDesktopSiteIsEnabled(false)
            }
    }

    private fun waitForKeyboardVisibility(visible: Boolean) {
        assertTrue(
            "Expected keyboard visibility: $visible",
            TestHelper.mDevice.wait(
                object : SearchCondition<Boolean>() {
                    override fun apply(args: Searchable?): Boolean? {
                        var matches = false
                        getInstrumentation().runOnMainSync {
                            val insets = ViewCompat.getRootWindowInsets(mActivityTestRule.activity.window.decorView)
                            matches = insets?.isVisible(WindowInsetsCompat.Type.ime()) == visible
                        }
                        return matches
                    }
                },
                TestHelper.waitingTime,
            ),
        )
    }
}
