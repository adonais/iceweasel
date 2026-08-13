/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import android.content.Context
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.webcompat.BrokenSiteReporterTestTags
import org.mozilla.fenix.webcompat.store.WebCompatReporterState
import org.mozilla.fenix.webcompat.store.WebCompatReporterState.BrokenSiteReason
import org.mozilla.fenix.webcompat.store.WebCompatReporterStore
import org.mozilla.fenix.webcompat.ui.WebCompatReporter

@RunWith(AndroidJUnit4::class)
class WebCompatReporterBrokenSiteReasonTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun selectedReasonClickedClearsReasonSelectionTest() {
        val selectedReason = BrokenSiteReason.Media
        val context = ApplicationProvider.getApplicationContext<Context>()
        val selectedReasonText = context.getString(selectedReason.displayStringId)
        val selectedReasonListItemTag =
            "${BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_REASON_OPTION}-$selectedReasonText"

        val clearIconDescription = context.getString(R.string.webcompat_reporter_clear_reason_content_description)

        val store = WebCompatReporterStore(
            initialState = WebCompatReporterState(
                enteredUrl = "https://www.example.com",
                reason = selectedReason,
            ),
        )

        composeTestRule.setContent {
            FirefoxTheme {
                WebCompatReporter(store = store)
            }
        }

        composeTestRule
            .onNodeWithContentDescription(clearIconDescription)
            .assertExists()
            .performClick()

        assertNull(store.state.reason)

        composeTestRule
            .onNodeWithTag(BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_SELECTED_REASON)
            .assertDoesNotExist()

        composeTestRule
            .onNodeWithTag(selectedReasonListItemTag)
            .assertExists()
    }

    @Test
    fun optionalFieldsVisibleOnlyWhenReasonSelectedTest() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val reasonToSelect = BrokenSiteReason.Slow
        val reasonToSelectText = context.getString(reasonToSelect.displayStringId)
        val reasonListItemTag =
            "${BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_REASON_OPTION}-$reasonToSelectText"

        val clearIconDescription = context.getString(org.mozilla.fenix.R.string.webcompat_reporter_clear_reason_content_description)

        val store = WebCompatReporterStore(
            initialState = WebCompatReporterState(
                enteredUrl = "https://www.example.com",
                reason = null,
            ),
        )

        composeTestRule.setContent {
            FirefoxTheme {
                WebCompatReporter(store = store)
            }
        }

        composeTestRule
            .onNodeWithTag(BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_DESCRIPTION_INPUT)
            .assertDoesNotExist()

        composeTestRule
            .onNodeWithTag(reasonListItemTag)
            .performClick()

        composeTestRule
            .onNodeWithTag(BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_DESCRIPTION_INPUT)
            .assertExists()

        composeTestRule
            .onNodeWithContentDescription(clearIconDescription)
            .performClick()

        composeTestRule
            .onNodeWithTag(BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_DESCRIPTION_INPUT)
            .assertDoesNotExist()
    }
}
