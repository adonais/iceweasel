/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.ADDRESSBAR_EDIT_MODE
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.ADDRESSBAR_EDIT_MODE_HORIZONTAL_DIVIDER
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.ADDRESSBAR_HORIZONTAL_DIVIDER
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.EnterEditMode
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.ExitEditMode
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BrowserToolbarTest {

    @get:Rule val composeTestRule = createComposeRule()

    private val store = BrowserToolbarStore()

    @Test
    fun `WHEN the divider visibility is not specified THEN the divider is shown while displaying and while editing`() {
        composeTestRule.setContent {
            BrowserToolbar(store = store)
        }

        composeTestRule.onNodeWithTag(ADDRESSBAR_HORIZONTAL_DIVIDER).assertExists()

        store.dispatch(EnterEditMode(isPrivate = false))
        composeTestRule.onNodeWithTag(ADDRESSBAR_EDIT_MODE).assertExists()
        composeTestRule.onNodeWithTag(ADDRESSBAR_EDIT_MODE_HORIZONTAL_DIVIDER).assertExists()
    }

    @Test
    fun `WHEN the divider is hidden THEN no divider is shown before, during and after editing`() {
        composeTestRule.setContent {
            BrowserToolbar(store = store, showDivider = false)
        }

        composeTestRule.onNodeWithTag(ADDRESSBAR_HORIZONTAL_DIVIDER).assertDoesNotExist()

        store.dispatch(EnterEditMode(isPrivate = false))
        composeTestRule.onNodeWithTag(ADDRESSBAR_EDIT_MODE).assertExists()
        composeTestRule.onNodeWithTag(ADDRESSBAR_EDIT_MODE_HORIZONTAL_DIVIDER).assertDoesNotExist()

        store.dispatch(ExitEditMode)
        composeTestRule.onNodeWithTag(ADDRESSBAR_EDIT_MODE).assertDoesNotExist()
        composeTestRule.onNodeWithTag(ADDRESSBAR_HORIZONTAL_DIVIDER).assertDoesNotExist()
    }
}
