/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import android.content.pm.ActivityInfo
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import org.junit.Test
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.customannotations.Critical
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.AppAndSystemHelper.setScreenOrientation
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.helpers.SwipeDirection
import org.mozilla.fenix.ui.efficiency.selectors.TabDrawerSelectors
import org.mozilla.fenix.ui.efficiency.selectors.WebCompatReporterSelectors

class ReportBrokenSiteTest : BaseTest() {

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3080112
    @SmokeTest
    @Test
    fun verifyTheReportBrokenSiteSubMenuOptionTest() {
        val defaultWebPage = mockWebServer.getGenericAsset(1)

        on.browserPage.navigateToPage(defaultWebPage.url.toString())
        on.webCompatReporter
            .navigateToPage()
            .mozVerify(WebCompatReporterSelectors.URL_LABEL)
            .mozVerify(WebCompatReporterSelectors.REPORTED_SITE_URL(defaultWebPage.url.toString()))
            .mozVerify(WebCompatReporterSelectors.WHATS_BROKEN_LABEL)
            .mozVerify(WebCompatReporterSelectors.DESCRIPTION)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4227146
    @SmokeTest
    @Test
    fun verifyTheReportBrokenSiteURLIsSuccessfullyEditedTest() {
        val defaultWebPage = mockWebServer.getGenericAsset(1)

        on.browserPage.navigateToPage(defaultWebPage.url.toString())
        on.webCompatReporter
            .navigateToPage()
            .mozClick(WebCompatReporterSelectors.REPORTED_SITE_URL(defaultWebPage.url.toString()))
            .mozClear(WebCompatReporterSelectors.EDIT_SITE_URL_DIALOG_TEXT_FIELD)
            .mozEnterText("https://www.example.com", WebCompatReporterSelectors.EDIT_SITE_URL_DIALOG_TEXT_FIELD)
            .mozClick(WebCompatReporterSelectors.EDIT_SITE_URL_DIALOG_SAVE_BUTTON)
            .mozVerify(WebCompatReporterSelectors.REPORTED_SITE_URL("https://www.example.com"))
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4227137
    @SmokeTest
    @Test
    fun verifyTheReportBrokenSiteFormAfterSelectingReasonTest() {
        val defaultWebPage = mockWebServer.getGenericAsset(1)

        on.browserPage.navigateToPage(defaultWebPage.url.toString())
        on.webCompatReporter
            .navigateToPage()
            .mozClick(WebCompatReporterSelectors.REPORTED_BROKEN_SITE_REASON("Site doesn’t load"))
            .mozVerify(WebCompatReporterSelectors.REPORTED_SITE_URL(defaultWebPage.url.toString()))
            .mozVerify(WebCompatReporterSelectors.REPORTED_BROKEN_SITE_REASON("Site doesn’t load"))
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.REPORTER_FORM)
            .mozVerifyElementIsNotChecked(WebCompatReporterSelectors.ITEMS_BLOCKED_BY_TRACKING_PROTECTION_CHECKBOX)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4227142
    @Critical
    @Test
    fun verifyTheReportBrokenSiteFormAfterSelectingReasonInLandscapeTest() {
        @Suppress("UNCHECKED_CAST")
        val orientationRule = composeRule as AndroidComposeTestRule<HomeActivityIntentTestRule, HomeActivity>

        val defaultWebPage = mockWebServer.getGenericAsset(1)

        on.browserPage.navigateToPage(defaultWebPage.url.toString())
        on.webCompatReporter.navigateToPage()

        setScreenOrientation(orientationRule, ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE)

        on.webCompatReporter
            .mozClick(WebCompatReporterSelectors.REPORTED_BROKEN_SITE_REASON("Site doesn’t load"))
            .mozVerify(WebCompatReporterSelectors.REPORTED_SITE_URL(defaultWebPage.url.toString()))
            .mozVerify(WebCompatReporterSelectors.REPORTED_BROKEN_SITE_REASON("Site doesn’t load"))
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.REPORTER_FORM)
            .mozVerifyElementIsNotChecked(WebCompatReporterSelectors.ITEMS_BLOCKED_BY_TRACKING_PROTECTION_CHECKBOX)

        setScreenOrientation(orientationRule, ActivityInfo.SCREEN_ORIENTATION_PORTRAIT)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4227141
    @Critical
    @Test
    fun verifyThatTheBrokenSiteFormSubmissionCanBeCanceledTest() {
        val defaultWebPage = mockWebServer.getGenericAsset(1)

        on.browserPage.navigateToPage(defaultWebPage.url.toString())
        on.webCompatReporter
            .navigateToPage()
            .mozClick(WebCompatReporterSelectors.REPORTED_BROKEN_SITE_REASON("Site doesn’t load"))
            .mozClick(WebCompatReporterSelectors.CLOSE_REPORT_BUTTON)
        on.browserPage.navigateToPage()
        on.webCompatReporter
            .navigateToPage()
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.REPORTER_VIEW_ITEMS)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4227139
    @Critical
    @Test
    fun verifyTheSiteIsDeceptiveReasonTest() {
        val defaultWebPage = mockWebServer.getGenericAsset(1)

        on.browserPage.navigateToPage(defaultWebPage.url.toString())
        on.webCompatReporter
            .navigateToPage()
            .mozClick(WebCompatReporterSelectors.REPORTED_BROKEN_SITE_REASON("This site is deceptive"))
        on.browserPage.navigateToPage().verifyUrl("safebrowsing.google.com/safebrowsing/report_phish/")
        on.tabDrawer.navigateToPage().mozClick(TabDrawerSelectors.TAB_ITEM_WITH_TITLE(defaultWebPage.title))
        on.browserPage.navigateToPage()
        on.webCompatReporter
            .navigateToPage()
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.REPORTER_VIEW_ITEMS)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4227138
    @Critical
    @Test
    fun verifyTheSomethingElseReasonTest() {
        val defaultWebPage = mockWebServer.getGenericAsset(1)

        on.browserPage.navigateToPage(defaultWebPage.url.toString())
        on.webCompatReporter
            .navigateToPage()
            .mozClick(WebCompatReporterSelectors.REPORTED_BROKEN_SITE_REASON("Something else"))
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.SOMETHING_ELSE_REASON_FORM)
            .mozVerify(WebCompatReporterSelectors.DESCRIBE_PROBLEM_ERROR_MESSAGE)
            .mozVerifyElementIsNotEnabled(WebCompatReporterSelectors.SEND_REPORT_BUTTON)
            .mozClearAndEnterText("Prolonged page loading time", WebCompatReporterSelectors.DESCRIPTION_INPUT_BOX)
            .mozVerifyElementIsEnabled(WebCompatReporterSelectors.SEND_REPORT_BUTTON)
            .mozVerifyElementAbsent(WebCompatReporterSelectors.DESCRIBE_PROBLEM_ERROR_MESSAGE)
            .mozClick(WebCompatReporterSelectors.SEND_REPORT_BUTTON)
            .mozVerify(WebCompatReporterSelectors.REPORT_SENT_SNACK_BAR_MESSAGE)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4227136
    @Critical
    @Test
    fun verifyTheReportBrokenSiteFormWithNoReasonSelectedTest() {
        val defaultWebPage = mockWebServer.getGenericAsset(1)

        on.browserPage.navigateToPage(defaultWebPage.url.toString())
        on.webCompatReporter
            .navigateToPage()
            .mozVerify(WebCompatReporterSelectors.REPORTED_SITE_URL(defaultWebPage.url.toString()))
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.REPORTER_VIEW_ITEMS)
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.BROKEN_SITE_REASONS)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4227147
    @Critical
    @Test
    fun verifyTheReportBrokenSiteURLIsNotSavedOnDismissTest() {
        val defaultWebPage = mockWebServer.getGenericAsset(1)

        on.browserPage.navigateToPage(defaultWebPage.url.toString())
        on.webCompatReporter
            .navigateToPage()
            .mozClick(WebCompatReporterSelectors.REPORTED_SITE_URL(defaultWebPage.url.toString()))
            .mozClear(WebCompatReporterSelectors.EDIT_SITE_URL_DIALOG_TEXT_FIELD)
            .mozEnterText("https://www.example.com", WebCompatReporterSelectors.EDIT_SITE_URL_DIALOG_TEXT_FIELD)
            .mozClick(WebCompatReporterSelectors.EDIT_SITE_URL_DIALOG_DISMISS_BUTTON)
            .mozVerify(WebCompatReporterSelectors.REPORTED_SITE_URL(defaultWebPage.url.toString()))
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4227140
    @Critical
    @Test
    fun verifyTheReportBrokenSiteFormAfterChangingTheReasonTest() {
        val defaultWebPage = mockWebServer.getGenericAsset(1)

        on.browserPage.navigateToPage(defaultWebPage.url.toString())
        on.webCompatReporter
            .navigateToPage()
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.REPORTER_VIEW_ITEMS)
            .mozClick(WebCompatReporterSelectors.REPORTED_BROKEN_SITE_REASON("Something else"))
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.SOMETHING_ELSE_REASON_FORM)
            .mozClearAndEnterText("Prolonged page loading time", WebCompatReporterSelectors.DESCRIPTION_INPUT_BOX)
            .mozClick(WebCompatReporterSelectors.CLEAR_SELECTED_REASON_BUTTON)
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.REPORTER_VIEW_ITEMS)
            .mozVerifyElementsByGroupAbsent(WebCompatReporterSelectors.Group.REPORTER_FORM_ONLY_ITEMS)
            .mozClick(WebCompatReporterSelectors.REPORTED_BROKEN_SITE_REASON("Site doesn’t load"))
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.REPORTER_FORM)
            .mozVerifyAnyContainsText(WebCompatReporterSelectors.DESCRIPTION_INPUT_BOX, "Prolonged page loading time")
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4227541
    @Critical
    @Test
    fun verifyThePreviewReportBottomSheetTest() {
        val defaultWebPage = mockWebServer.getGenericAsset(1)

        on.browserPage.navigateToPage(defaultWebPage.url.toString())
        on.webCompatReporter
            .navigateToPage()
            .mozClick(WebCompatReporterSelectors.REPORTED_BROKEN_SITE_REASON("Something else"))
            .mozClick(WebCompatReporterSelectors.PREVIEW_REPORT_BUTTON)
            .mozVerifyElementsByGroup(WebCompatReporterSelectors.Group.REPORT_PREVIEW_ITEMS)

        PREVIEW_SECTIONS.forEach { (button, group) ->
            on.webCompatReporter
                .mozClick(button)
                .mozVerify(WebCompatReporterSelectors.REPORT_PREVIEW_OPTION_CHEVRON(button.value, true))
                .mozVerifyElementsByGroup(group)
                .mozClick(button)
                .mozVerify(WebCompatReporterSelectors.REPORT_PREVIEW_OPTION_CHEVRON(button.value, false))
        }

        on.webCompatReporter.mozSwipeElementUntilAbsent(
            WebCompatReporterSelectors.REPORT_PREVIEW_HANDLE,
            SwipeDirection.DOWN,
            maxSwipes = 3,
        )
    }

    companion object {
        // Each collapsible section of the report preview bottom sheet, paired with the details group it reveals.
        val PREVIEW_SECTIONS =
            listOf(
                WebCompatReporterSelectors.REPORT_PREVIEW_BASIC_BUTTON to
                    WebCompatReporterSelectors.Group.REPORT_PREVIEW_BASIC_DETAILS,
                WebCompatReporterSelectors.REPORT_PREVIEW_ANTITRACKING_BUTTON to
                    WebCompatReporterSelectors.Group.REPORT_PREVIEW_ANTITRACKING_DETAILS,
                WebCompatReporterSelectors.REPORT_PREVIEW_GRAPHICS_BUTTON to
                    WebCompatReporterSelectors.Group.REPORT_PREVIEW_GRAPHICS_DETAILS,
                WebCompatReporterSelectors.REPORT_PREVIEW_BROWSER_INFO_BUTTON to
                    WebCompatReporterSelectors.Group.REPORT_PREVIEW_BROWSER_INFO_DETAILS,
                WebCompatReporterSelectors.REPORT_PREVIEW_APP_BUTTON to
                    WebCompatReporterSelectors.Group.REPORT_PREVIEW_APP_DETAILS,
                WebCompatReporterSelectors.REPORT_PREVIEW_SYSTEM_BUTTON to
                    WebCompatReporterSelectors.Group.REPORT_PREVIEW_SYSTEM_DETAILS,
                WebCompatReporterSelectors.REPORT_PREVIEW_PREFS_BUTTON to
                    WebCompatReporterSelectors.Group.REPORT_PREVIEW_PREFS_DETAILS,
                WebCompatReporterSelectors.REPORT_PREVIEW_TAB_INFO_BUTTON to
                    WebCompatReporterSelectors.Group.REPORT_PREVIEW_TAB_INFO_DETAILS,
                WebCompatReporterSelectors.REPORT_PREVIEW_FRAMEWORKS_BUTTON to
                    WebCompatReporterSelectors.Group.REPORT_PREVIEW_FRAMEWORKS_DETAILS,
            )
    }
}
