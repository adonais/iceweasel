/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.concept.engine.utils.ABOUT_HOME_URL
import org.junit.Assert
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.compose.TabThumbnailImageData
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.data.TabGroupTheme
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.ui.tabitems.TabsTrayItemClickHandler
import org.mozilla.fenix.tabstray.ui.tabitems.TabsTrayItemSelectionState
import org.mozilla.fenix.theme.FirefoxTheme

@RunWith(AndroidJUnit4::class)
class TabGroupCardTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun verifyUIElementsPresent() {
        composeTestRule.setContent {
            FirefoxTheme {
                ComposableUnderTest()
            }
        }
        composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_GROUP_THREE_DOT_BUTTON)
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag(
            TabsTrayTestTag.TAB_GROUP_THUMBNAIL_FIRST,
            useUnmergedTree = true,
        ).assertIsDisplayed()
        composeTestRule.onNodeWithTag(
            TabsTrayTestTag.TAB_GROUP_THUMBNAIL_SECOND,
            useUnmergedTree = true,
        )
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag(
            TabsTrayTestTag.TAB_GROUP_THUMBNAIL_THIRD,
            useUnmergedTree = true,
        ).assertIsDisplayed()
        composeTestRule.onNodeWithTag(
            TabsTrayTestTag.TAB_GROUP_THUMBNAIL_FOURTH,
            useUnmergedTree = true,
        )
            .assertIsDisplayed()
    }

    @Test
    fun verifyClick() {
        var clicked = false
        var argumentReceived: String? = null
        composeTestRule.setContent {
            FirefoxTheme {
                ComposableUnderTest(
                    onClick = { arg ->
                        clicked = true
                        argumentReceived = arg
                    },
                )
            }
        }
        composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_ITEM_ROOT).performClick()
        Assert.assertTrue(clicked)
        Assert.assertEquals("Test", argumentReceived)
    }

    @Test
    fun verifyLongClick() {
        var longClicked = false
        var argumentReceived: String? = null
        composeTestRule.setContent {
            FirefoxTheme {
                ComposableUnderTest(
                    onLongClick = { arg ->
                        longClicked = true
                        argumentReceived = arg
                    },
                )
            }
        }
        composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_ITEM_ROOT).performTouchInput {
            longClick()
        }
        Assert.assertTrue(longClicked)
        Assert.assertEquals("Test", argumentReceived)
    }

    @Composable
    private fun ComposableUnderTest(
        onClick: (String) -> Unit = {},
        onLongClick: (String) -> Unit = {},
    ) {
        TabGroupCard(
            group = TabsTrayItem.TabGroup(
                title = "Group 1",
                theme = TabGroupTheme.default,
                tabs = hashSetOf(),
            ),
            thumbnails = listOf(
                TabThumbnailImageData(
                    tabId = "123",
                    isPrivate = false,
                    tabUrl = ABOUT_HOME_URL,
                    tabIcon = null,
                ),
                TabThumbnailImageData(
                    tabId = "123",
                    isPrivate = false,
                    tabUrl = ABOUT_HOME_URL,
                    tabIcon = null,
                ),
                TabThumbnailImageData(
                    tabId = "123",
                    isPrivate = false,
                    tabUrl = ABOUT_HOME_URL,
                    tabIcon = null,
                ),
                TabThumbnailImageData(
                    tabId = "123",
                    isPrivate = false,
                    tabUrl = ABOUT_HOME_URL,
                    tabIcon = null,
                ),
            ),
            selectionState = TabsTrayItemSelectionState(),
            thumbnailSizePx = 12,
            clickHandler = TabsTrayItemClickHandler(
                onClick = { onClick("Test") },
                onLongClick = { onLongClick("Test") },
                onCloseClick = {}, // Not implemented yet
            ),
        )
    }
}
