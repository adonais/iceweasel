/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.ADDRESSBAR_HORIZONTAL_DIVIDER
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.ADDRESSBAR_PROGRESSBAR
import mozilla.components.compose.browser.toolbar.concept.PageOrigin
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.ProgressBarConfig
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Bottom
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Top
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private const val TOOLBAR = "TOOLBAR"

@RunWith(RobolectricTestRunner::class)
class BrowserDisplayToolbarTest {

    @get:Rule val composeTestRule = createComposeRule()

    private var gravity: ToolbarGravity by mutableStateOf(Top)
    private var showDivider by mutableStateOf(true)

    @Test
    fun `WHEN the divider visibility is not specified THEN the divider is shown for both toolbar positions`() {
        composeTestRule.setContent {
            BrowserDisplayToolbar(
                pageOrigin = pageOrigin,
                gravity = gravity,
                progressBarConfig = null,
                onInteraction = {},
            )
        }

        listOf(Top, Bottom).forEach {
            gravity = it
            composeTestRule.onNodeWithTag(ADDRESSBAR_HORIZONTAL_DIVIDER).assertExists()
        }
    }

    @Test
    fun `WHEN the divider is shown THEN it is on the edge of the toolbar facing the webpage`() {
        setToolbar()

        gravity = Top
        assertEquals(toolbarBounds().bottom, dividerBounds().bottom)

        gravity = Bottom
        assertEquals(toolbarBounds().top, dividerBounds().top)
    }

    @Test
    fun `WHEN the divider is hidden THEN it is not shown for both toolbar positions`() {
        showDivider = false
        setToolbar()

        listOf(Top, Bottom).forEach {
            gravity = it
            composeTestRule.onNodeWithTag(ADDRESSBAR_HORIZONTAL_DIVIDER).assertDoesNotExist()
        }
    }

    @Test
    fun `WHEN the divider is hidden THEN the toolbar size and the progress bar stay the same`() {
        setToolbar(progressBarConfig = ProgressBarConfig(progress = 50))

        listOf(Top, Bottom).forEach {
            gravity = it
            showDivider = true
            val toolbarBoundsWithDivider = toolbarBounds()
            val progressBarBoundsWithDivider = progressBarBounds()

            showDivider = false

            assertEquals(toolbarBoundsWithDivider, toolbarBounds())
            assertEquals(progressBarBoundsWithDivider, progressBarBounds())
        }
    }

    private fun setToolbar(progressBarConfig: ProgressBarConfig? = null) {
        composeTestRule.setContent {
            Box(modifier = Modifier.testTag(TOOLBAR)) {
                BrowserDisplayToolbar(
                    pageOrigin = pageOrigin,
                    gravity = gravity,
                    progressBarConfig = progressBarConfig,
                    onInteraction = {},
                    showDivider = showDivider,
                )
            }
        }
    }

    private fun toolbarBounds() = composeTestRule.onNodeWithTag(TOOLBAR).getUnclippedBoundsInRoot()

    private fun dividerBounds() =
        composeTestRule.onNodeWithTag(ADDRESSBAR_HORIZONTAL_DIVIDER).getUnclippedBoundsInRoot()

    private fun progressBarBounds() = composeTestRule.onNodeWithTag(ADDRESSBAR_PROGRESSBAR).getUnclippedBoundsInRoot()

    private val pageOrigin =
        PageOrigin(
            title = null,
            url = "https://www.mozilla.org",
            onClick = object : BrowserToolbarEvent {},
        )
}
