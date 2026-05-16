package org.mozilla.fenix.tabgroups

import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import junit.framework.TestCase.assertTrue
import mozilla.components.compose.base.utils.LocalUnderTest
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.data.createTab
import org.mozilla.fenix.tabstray.data.createTabGroup
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme

@RunWith(AndroidJUnit4::class)
class ExpandedTabGroupTest {
    @get:Rule
    val composeTestRule = createComposeRule()
    val testGroupTitle = "Test Tab Group"

    @Test
    fun verifyVisibleItems() {
        composeTestRule.setContent {
            FirefoxTheme(theme = Theme.Light) {
                Surface {
                    ExpandedTabGroup(
                        group = fakeTabGroup(),
                        onItemClick = {},
                        onTabClose = {},
                        onDeleteTabGroup = {},
                        editTabGroupClick = {},
                    )
                }
            }
        }
        composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_GROUP_BOTTOM_SHEET_ROOT)
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag(TabsTrayTestTag.BOTTOM_SHEET_SHARE_BUTTON)
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_GROUP_THREE_DOT_BUTTON)
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag(
            TabsTrayTestTag.BOTTOM_SHEET_CIRCLE,
            useUnmergedTree = true,
        ).assertIsDisplayed()
    }

    @Test
    fun verifyMenuItems() {
        composeTestRule.setContent {
            FirefoxTheme(theme = Theme.Light) {
                Surface {
                    ExpandedTabGroup(
                        group = fakeTabGroup(),
                        onItemClick = {},
                        onTabClose = {},
                        onDeleteTabGroup = {},
                        editTabGroupClick = {},
                    )
                }
            }
        }
        composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_GROUP_THREE_DOT_BUTTON)
            .performClick()
        composeTestRule.onNodeWithTag(TabsTrayTestTag.EDIT_TAB_GROUP).assertIsDisplayed()
        composeTestRule.onNodeWithTag(TabsTrayTestTag.CLOSE_TAB_GROUP).assertIsDisplayed()
        composeTestRule.onNodeWithTag(TabsTrayTestTag.DELETE_TAB_GROUP).assertIsDisplayed()
    }

    @Test
    fun verifyTabGroupItemClick() {
        var itemClicked = false
        val tab = createTab(url = "test tab")

        composeTestRule.setContent {
            CompositionLocalProvider(LocalUnderTest provides true) {
                FirefoxTheme(theme = Theme.Light) {
                    Surface {
                        ExpandedTabGroup(
                            group = fakeTabGroup(tabs = mutableListOf(tab)),
                            onItemClick = {
                                if (it == tab) {
                                    itemClicked = true
                                }
                            },
                            onTabClose = {},
                            onDeleteTabGroup = {},
                            editTabGroupClick = {},
                        )
                    }
                }
            }
        }
        composeTestRule
            .onNodeWithTag(TabsTrayTestTag.TAB_ITEM_ROOT)
            .performClick()

        assertTrue(itemClicked)
    }

    @Test
    fun verifyTabGroupItemCloseClick() {
        var itemClosed = false
        val tab = createTab(url = "test tab")

        composeTestRule.setContent {
            CompositionLocalProvider(LocalUnderTest provides true) {
                FirefoxTheme(theme = Theme.Light) {
                    Surface {
                        ExpandedTabGroup(
                            group = fakeTabGroup(tabs = mutableListOf(tab)),
                            onItemClick = {},
                            onTabClose = {
                                if (it == tab) {
                                    itemClosed = true
                                }
                            },
                            onDeleteTabGroup = {},
                            editTabGroupClick = {},
                        )
                    }
                }
            }
        }
        composeTestRule
            .onNodeWithTag(TabsTrayTestTag.TAB_ITEM_CLOSE)
            .performClick()

        assertTrue(itemClosed)
    }

    @Test
    fun verifyDeleteTabGroupClick() {
        var deleteClicked = false
        val group = fakeTabGroup()

        composeTestRule.setContent {
            CompositionLocalProvider(LocalUnderTest provides true) {
                FirefoxTheme(theme = Theme.Light) {
                    Surface {
                        ExpandedTabGroup(
                            group = group,
                            onItemClick = {},
                            onTabClose = {},
                            onDeleteTabGroup = {
                                deleteClicked = true
                            },
                            editTabGroupClick = {},
                        )
                    }
                }
            }
        }

        composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_GROUP_THREE_DOT_BUTTON)
            .performClick()
        composeTestRule.onNodeWithTag(TabsTrayTestTag.DELETE_TAB_GROUP)
            .performClick()

        assertTrue(deleteClicked)
    }

    @Test
    fun verifyEditTabGroupClick() {
        var editClicked = false

        composeTestRule.setContent {
            CompositionLocalProvider(LocalUnderTest provides true) {
                FirefoxTheme(theme = Theme.Light) {
                    Surface {
                        ExpandedTabGroup(
                            group = fakeTabGroup(),
                            onItemClick = {},
                            onTabClose = {},
                            onDeleteTabGroup = {},
                            editTabGroupClick = {
                                editClicked = true
                            },
                        )
                    }
                }
            }
        }

        composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_GROUP_THREE_DOT_BUTTON)
            .performClick()
        composeTestRule.onNodeWithTag(TabsTrayTestTag.EDIT_TAB_GROUP)
            .performClick()

        assertTrue(editClicked)
    }

    private fun fakeTabGroup(
        tabs: MutableList<TabsTrayItem.Tab> = mutableListOf(),
    ): TabsTrayItem.TabGroup {
        return createTabGroup(
            title = testGroupTitle,
            tabs = tabs,
        )
    }
}
