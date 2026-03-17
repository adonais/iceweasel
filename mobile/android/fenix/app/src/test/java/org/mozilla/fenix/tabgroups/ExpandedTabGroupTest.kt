package org.mozilla.fenix.tabgroups

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SheetState
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Surface
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.data.createTabGroup
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme

@RunWith(AndroidJUnit4::class)
class ExpandedTabGroupTest {
    @get:Rule
    val composeTestRule = createComposeRule()
    val testGroupTitle = "Test Tab Group"

    @OptIn(ExperimentalMaterial3Api::class)
    @Test
    fun bottomSheetIsInitializedPartiallyExpanded() {
        var sheetState: SheetState? = null
        composeTestRule.setContent {
            sheetState = rememberModalBottomSheetState(
                skipPartiallyExpanded = false,
            )
            FirefoxTheme(theme = Theme.Light) {
                Surface {
                    ExpandedTabGroup(
                        group = fakeTabGroup(),
                        focusedTabId = null,
                        sheetState = sheetState,
                    )
                }
            }
        }
        composeTestRule.runOnIdle {
            assertTrue(sheetState?.currentValue == SheetValue.PartiallyExpanded)
            assertTrue(sheetState?.isVisible == true)
        }
    }

    @OptIn(ExperimentalMaterial3Api::class)
    @Test
    fun verifyVisibleItems() {
        var sheetState: SheetState? = null
        composeTestRule.setContent {
            sheetState = rememberModalBottomSheetState(
                skipPartiallyExpanded = false,
            )
            FirefoxTheme(theme = Theme.Light) {
                Surface {
                    ExpandedTabGroup(
                        group = fakeTabGroup(),
                        focusedTabId = null,
                        sheetState = sheetState,
                    )
                }
            }
        }
        composeTestRule.runOnIdle {
            composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_GROUP_BOTTOM_SHEET_ROOT)
                .assertIsDisplayed()
            composeTestRule.onNodeWithTag(TabsTrayTestTag.BOTTOM_SHEET_SHARE_BUTTON)
                .assertIsDisplayed()
            composeTestRule.onNodeWithTag(TabsTrayTestTag.BOTTOM_SHEET_THREE_DOT_BUTTON)
                .assertIsDisplayed()
            composeTestRule.onNodeWithTag(TabsTrayTestTag.BOTTOM_SHEET_CIRCLE).assertIsDisplayed()
            composeTestRule.onNodeWithText(testGroupTitle).assertIsDisplayed()
        }
    }

    private fun fakeTabGroup(): TabsTrayItem.TabGroup {
        return createTabGroup(
            title = testGroupTitle,
            tabs = hashSetOf(), // empty list because thumbnail loading throws an exception
        )
    }
}
