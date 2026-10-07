/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.data.createTabGroup
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState
import org.mozilla.fenix.tabstray.ui.tabpage.TabGroupsPage
import org.mozilla.fenix.theme.FirefoxTheme

@RunWith(AndroidJUnit4::class)
class TabGroupsPageTest {

    @get:Rule val composeTestRule = createComposeRule()

    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun verifyEmptyState() {
        composeTestRule.setContent {
            FirefoxTheme {
                TabGroupsPage(
                    state = TabsTrayState.TabGroupState(),
                    onTabGroupClick = {},
                    onEditTabGroupClick = {},
                    onShareTabGroupClick = {},
                    onDeleteTabGroupClick = {},
                    onCollectionsMigrationCardDismiss = {},
                )
            }
        }

        composeTestRule.onNodeWithTag(TabsTrayTestTag.EMPTY_TAB_GROUPS_LIST).assertIsDisplayed()
    }

    @Test
    fun verifyTabGroupClick() {
        val group = createTabGroup(title = "Group 1")
        var groupClicked = false
        var clickedGroup: TabsTrayItem.TabGroup? = null

        composeTestRule.setContent {
            FirefoxTheme {
                TabGroupsPage(
                    state = TabsTrayState.TabGroupState(groups = listOf(group)),
                    onTabGroupClick = {
                        groupClicked = true
                        clickedGroup = it
                    },
                    onEditTabGroupClick = {},
                    onShareTabGroupClick = {},
                    onDeleteTabGroupClick = {},
                    onCollectionsMigrationCardDismiss = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("${TabsTrayTestTag.TAB_GROUP_ROOT}.${group.id}").performClick()

        assertTrue(groupClicked)
        assertEquals(group, clickedGroup)
    }

    @Test
    fun verifyDeleteTabGroupClick() {
        val group = createTabGroup(title = "Group 1")
        var deleteClicked = false
        var clickedGroup: TabsTrayItem.TabGroup? = null

        composeTestRule.setContent {
            FirefoxTheme {
                TabGroupsPage(
                    state = TabsTrayState.TabGroupState(groups = listOf(group)),
                    onTabGroupClick = {},
                    onDeleteTabGroupClick = {
                        deleteClicked = true
                        clickedGroup = it
                    },
                    onEditTabGroupClick = {},
                    onShareTabGroupClick = {},
                    onCollectionsMigrationCardDismiss = {},
                )
            }
        }

        composeTestRule.onAllNodesWithTag(TabsTrayTestTag.TAB_GROUP_THREE_DOT_BUTTON)[0].performClick()
        composeTestRule.onNodeWithTag(TabsTrayTestTag.DELETE_TAB_GROUP).performClick()

        assertTrue(deleteClicked)
        assertEquals(group, clickedGroup)
    }

    @Test
    fun verifyEditTabGroupClick() {
        val group = createTabGroup(title = "Group 1")
        var editClicked = false
        var clickedGroup: TabsTrayItem.TabGroup? = null

        composeTestRule.setContent {
            FirefoxTheme {
                TabGroupsPage(
                    state = TabsTrayState.TabGroupState(groups = listOf(group)),
                    onTabGroupClick = {},
                    onDeleteTabGroupClick = {},
                    onEditTabGroupClick = {
                        editClicked = true
                        clickedGroup = it
                    },
                    onShareTabGroupClick = {},
                    onCollectionsMigrationCardDismiss = {},
                )
            }
        }

        composeTestRule.onAllNodesWithTag(TabsTrayTestTag.TAB_GROUP_THREE_DOT_BUTTON)[0].performClick()
        composeTestRule.onNodeWithTag(TabsTrayTestTag.EDIT_TAB_GROUP).performClick()

        assertTrue(editClicked)
        assertEquals(group, clickedGroup)
    }

    @Test
    fun verifyCollectionsMigrationCardHiddenByDefault() {
        val group = createTabGroup(title = "Group 1")

        composeTestRule.setContent {
            FirefoxTheme {
                TabGroupsPage(
                    state = TabsTrayState.TabGroupState(groups = listOf(group)),
                    onTabGroupClick = {},
                    onEditTabGroupClick = {},
                    onShareTabGroupClick = {},
                    onDeleteTabGroupClick = {},
                    onCollectionsMigrationCardDismiss = {},
                )
            }
        }

        composeTestRule.onNodeWithTag(TabsTrayTestTag.COLLECTIONS_MIGRATION_CARD).assertDoesNotExist()
    }

    @Test
    fun verifyCollectionsMigrationCardDisplayed() {
        val group = createTabGroup(title = "Group 1")
        val title = context.getString(R.string.collections_migration_homepage_banner_title)
        val message = context.getString(R.string.collections_migration_homepage_card_message)

        composeTestRule.setContent {
            FirefoxTheme {
                TabGroupsPage(
                    state =
                        TabsTrayState.TabGroupState(
                            groups = listOf(group),
                            showCollectionsMigrationCard = true,
                        ),
                    onTabGroupClick = {},
                    onEditTabGroupClick = {},
                    onShareTabGroupClick = {},
                    onDeleteTabGroupClick = {},
                    onCollectionsMigrationCardDismiss = {},
                )
            }
        }

        composeTestRule.onNodeWithTag(TabsTrayTestTag.COLLECTIONS_MIGRATION_CARD).assertIsDisplayed()
        composeTestRule.onNodeWithText(title).assertIsDisplayed()
        composeTestRule.onNodeWithText(message).assertIsDisplayed()
    }

    @Test
    fun verifyCollectionsMigrationCardDismiss() {
        val group = createTabGroup(title = "Group 1")
        var dismissed = false

        composeTestRule.setContent {
            FirefoxTheme {
                TabGroupsPage(
                    state =
                        TabsTrayState.TabGroupState(
                            groups = listOf(group),
                            showCollectionsMigrationCard = true,
                        ),
                    onTabGroupClick = {},
                    onEditTabGroupClick = {},
                    onShareTabGroupClick = {},
                    onDeleteTabGroupClick = {},
                    onCollectionsMigrationCardDismiss = { dismissed = true },
                )
            }
        }

        composeTestRule
            .onNode(hasClickAction() and hasAnyAncestor(hasTestTag(TabsTrayTestTag.COLLECTIONS_MIGRATION_CARD)))
            .performClick()

        assertTrue(dismissed)
    }
}
