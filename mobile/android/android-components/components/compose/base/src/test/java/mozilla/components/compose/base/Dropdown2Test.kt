/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.base

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.text.Text
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class Dropdown2Test {
    @get:Rule val composeTestRule = createComposeRule()

    @Test
    fun `WHEN the dropdown is clicked THEN the dropdown items are displayed`() {
        composeTestRule.setContent {
            Dropdown2(
                label = "Dropdown label",
                placeholder = "Dropdown placeholder",
                dropdownItems =
                    listOf(
                        MenuItem.CheckableItem(
                            text = Text.String("Item 1"),
                            isChecked = false,
                            onClick = {},
                        )
                    ),
                modifier = Modifier.testTag("dropdown"),
            )
        }
        composeTestRule.onNodeWithText("Dropdown placeholder").assertExists()
        composeTestRule.onNodeWithText("Dropdown label").assertExists()

        composeTestRule.onNodeWithTag("dropdown").performClick()
        composeTestRule.onNodeWithText("Item 1").assertExists()
    }

    @Test
    fun `WHEN the dropdown is opened THEN the selected item is displayed in the dropdown and context menu`() {
        composeTestRule.setContent {
            Dropdown2(
                label = "Dropdown label",
                placeholder = "Dropdown placeholder",
                dropdownItems =
                    listOf(
                        MenuItem.CheckableItem(
                            text = Text.String("Item 1"),
                            isChecked = true,
                            onClick = {},
                            testTag = "item1",
                        ),
                        MenuItem.CheckableItem(
                            text = Text.String("Item 2"),
                            isChecked = false,
                            onClick = {},
                            testTag = "item2",
                        ),
                    ),
                modifier = Modifier.testTag("dropdown"),
            )
        }
        composeTestRule.onNodeWithText("Item 1").assertExists()

        composeTestRule.onNodeWithTag("dropdown").performClick()
        composeTestRule.onNodeWithTag("item1").assertExists()
        composeTestRule.onNodeWithTag("item2").assertExists()
    }

    @Test
    fun `WHEN a dropdown item is selected THEN the selected item changes`() {
        var selectedIndex by mutableStateOf(0)
        composeTestRule.setContent {
            Dropdown2(
                label = "Dropdown label",
                placeholder = "Dropdown placeholder",
                dropdownItems =
                    listOf("Item 1", "Item 2").mapIndexed { index, item ->
                        MenuItem.CheckableItem(
                            text = Text.String(item),
                            isChecked = index == selectedIndex,
                            onClick = { selectedIndex = index },
                            testTag = "item${index + 1}",
                        )
                    },
                modifier = Modifier.testTag("dropdown"),
            )
        }
        composeTestRule.onNodeWithText("Item 1").assertExists()

        composeTestRule.onNodeWithTag("dropdown").performClick()
        composeTestRule.onNodeWithTag("item1").assertExists()
        composeTestRule.onNodeWithTag("item2").assertExists().performClick()

        composeTestRule.onNodeWithTag("item2").assertDoesNotExist() // menu dismissed
        composeTestRule.onNodeWithText("Item 2").assertExists()
    }
}
