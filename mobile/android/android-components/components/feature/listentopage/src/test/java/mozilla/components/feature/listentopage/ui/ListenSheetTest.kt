/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.ui

import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.feature.listentopage.ArticleProgress
import mozilla.components.feature.listentopage.PlaybackSpeed
import mozilla.components.feature.listentopage.R
import mozilla.components.feature.listentopage.VoiceState
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ListenSheetTest {

    @get:Rule val composeTestRule = createComposeRule()

    private val forward = testContext.getString(R.string.mozac_feature_listentopage_forward_30_sec)
    private val rewind = testContext.getString(R.string.mozac_feature_listentopage_back_10_sec)

    private fun setContent(expanded: Boolean, onExpandClicked: () -> Unit = {}) {
        composeTestRule.setContent {
            AcornTheme {
                ListenSheet(
                    article = ArticleDetails(title = TITLE, site = "bbc.co.uk"),
                    articleProgressState = remember { mutableStateOf(ArticleProgress()) },
                    playing = false,
                    speed = PlaybackSpeed.Default,
                    voiceState = VoiceState(),
                    onAction = {},
                    onExpandClicked = onExpandClicked,
                    expanded = expanded,
                )
            }
        }
    }

    @Test
    fun `WHEN the sheet is expanded THEN the full controls are shown`() {
        setContent(expanded = true)

        composeTestRule.onNodeWithContentDescription(rewind).assertExists()
        composeTestRule.onNodeWithContentDescription(forward).assertExists()
    }

    @Test
    fun `WHEN the sheet is compact THEN only the compact controls are shown`() {
        setContent(expanded = false)

        composeTestRule.onNodeWithContentDescription(rewind).assertExists()
        composeTestRule.onNodeWithContentDescription(forward).assertDoesNotExist()
    }

    @Test
    fun `GIVEN the sheet is compact WHEN the article heading is clicked THEN expanding is requested`() {
        var expandClicked = false
        setContent(expanded = false, onExpandClicked = { expandClicked = true })

        composeTestRule.onNodeWithText(TITLE).performClick()

        assertTrue(expandClicked)
    }

    private companion object {
        const val TITLE = "Match Preview: Wrexham AFC vs Sunderland AFC"
    }
}
