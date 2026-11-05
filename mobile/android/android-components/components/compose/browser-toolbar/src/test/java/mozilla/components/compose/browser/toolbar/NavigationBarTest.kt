/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import mozilla.components.compose.browser.toolbar.concept.Action
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButtonRes
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.NAVIGATION_BAR
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.NAVIGATION_BAR_HORIZONTAL_DIVIDER
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Bottom
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Top
import mozilla.components.ui.icons.R as iconsR
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class NavigationBarTest {

    @get:Rule val composeTestRule = createComposeRule()

    private var actions: List<Action> by mutableStateOf(emptyList())
    private var gravity: ToolbarGravity by mutableStateOf(Top)
    private var showDivider by mutableStateOf(true)

    @Test
    fun `WHEN the divider visibility is not specified THEN the divider is shown for both toolbar positions`() {
        composeTestRule.setContent {
            NavigationBar(actions = actions, toolbarGravity = gravity, onInteraction = {})
        }

        listOf(emptyList(), listOf(action)).forEach {
            actions = it

            gravity = Top
            divider().assertExists()

            gravity = Bottom
            divider().assertExists()
        }
    }

    @Test
    fun `WHEN the divider is shown THEN it is on the top edge of the navigation bar for both toolbar positions`() {
        setNavigationBar()

        listOf(Top, Bottom).forEach {
            gravity = it

            assertEquals(
                composeTestRule.onNodeWithTag(NAVIGATION_BAR).getUnclippedBoundsInRoot().top,
                divider().getUnclippedBoundsInRoot().top,
            )
        }
    }

    @Test
    fun `WHEN the divider is hidden THEN it is not shown for both toolbar positions`() {
        showDivider = false
        setNavigationBar()

        listOf(emptyList(), listOf(action)).forEach {
            actions = it

            gravity = Top
            divider().assertDoesNotExist()

            gravity = Bottom
            divider().assertDoesNotExist()
        }
    }

    @Test
    fun `WHEN the divider is hidden THEN the navigation bar size stays the same`() {
        actions = listOf(action)
        setNavigationBar()

        listOf(Top, Bottom).forEach {
            gravity = it
            showDivider = true
            val boundsWithDivider = composeTestRule.onNodeWithTag(NAVIGATION_BAR).getUnclippedBoundsInRoot()

            showDivider = false

            assertEquals(boundsWithDivider, composeTestRule.onNodeWithTag(NAVIGATION_BAR).getUnclippedBoundsInRoot())
        }
    }

    private fun setNavigationBar() {
        composeTestRule.setContent {
            NavigationBar(
                actions = actions,
                toolbarGravity = gravity,
                showDivider = showDivider,
                onInteraction = {},
            )
        }
    }

    private fun divider() = composeTestRule.onNodeWithTag(NAVIGATION_BAR_HORIZONTAL_DIVIDER, useUnmergedTree = true)

    private val action =
        ActionButtonRes(
            drawableResId = iconsR.drawable.mozac_ic_bookmark_fill_24,
            contentDescription = android.R.string.untitled,
            onClick = object : BrowserToolbarEvent {},
        )
}
