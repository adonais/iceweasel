/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs.ui

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.support.test.robolectric.testContext
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.settings.labs.FeatureKey
import org.mozilla.fenix.settings.labs.LabsFeature
import org.mozilla.fenix.settings.labs.store.DialogState
import org.mozilla.fenix.settings.labs.store.LabsState
import org.mozilla.fenix.settings.labs.store.LabsStore
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme

@RunWith(AndroidJUnit4::class)
class FirefoxLabsScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `WHEN a feature has no feedback URL THEN the share feedback link is not displayed`() {
        val store = LabsStore(
            initialState = LabsState(
                labsFeatures = listOf(
                    LabsFeature(
                        key = FeatureKey.HOMEPAGE_AS_A_NEW_TAB,
                        name = R.string.firefox_labs_homepage_as_a_new_tab,
                        description = R.string.firefox_labs_homepage_as_a_new_tab_description,
                        enabled = false,
                        feedbackUrl = null,
                    ),
                ),
                dialogState = DialogState.Closed,
            ),
        )

        composeTestRule.setContent {
            FirefoxTheme(theme = Theme.Light) {
                FirefoxLabsScreen(
                    store = store,
                    onNavigationIconClick = {},
                    onShareFeedbackClick = {},
                )
            }
        }

        composeTestRule.onNodeWithContentDescription(
            testContext.getString(
                R.string.firefox_labs_share_feedback_content_description,
                testContext.getString(R.string.firefox_labs_homepage_as_a_new_tab),
            ),
        ).assertDoesNotExist()
    }

    @Test
    fun `WHEN a feature has a feedback URL THEN the share feedback link is displayed`() {
        val store = LabsStore(
            initialState = LabsState(
                labsFeatures = listOf(
                    LabsFeature(
                        key = FeatureKey.HOMEPAGE_AS_A_NEW_TAB,
                        name = R.string.firefox_labs_homepage_as_a_new_tab,
                        description = R.string.firefox_labs_homepage_as_a_new_tab_description,
                        enabled = false,
                        feedbackUrl = "https://connect.mozilla.org/",
                    ),
                ),
                dialogState = DialogState.Closed,
            ),
        )

        composeTestRule.setContent {
            FirefoxTheme(theme = Theme.Light) {
                FirefoxLabsScreen(
                    store = store,
                    onNavigationIconClick = {},
                    onShareFeedbackClick = {},
                )
            }
        }

        composeTestRule.onNodeWithContentDescription(
            testContext.getString(
                R.string.firefox_labs_share_feedback_content_description,
                testContext.getString(R.string.firefox_labs_homepage_as_a_new_tab),
            ),
        ).assertExists()
    }
}
