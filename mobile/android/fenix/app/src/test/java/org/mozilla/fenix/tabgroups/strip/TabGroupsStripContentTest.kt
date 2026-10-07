/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups.strip

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.test.assertEquals
import mozilla.components.compose.base.theme.Theme
import mozilla.components.compose.base.utils.LocalUnderTest
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.tabgroups.TabGroupsTestTag
import org.mozilla.fenix.tabgroups.strip.redux.TabGroupsStripState
import org.mozilla.fenix.theme.FirefoxTheme

@RunWith(AndroidJUnit4::class)
class TabGroupsStripContentTest {
    @get:Rule val composeTestRule = createComposeRule()

    private val state =
        TabGroupsStripState(
            tabs =
                listOf("1", "2", "3").map { id ->
                    TabGroupsStripState.Tab(
                        id = id,
                        url = "https://example.com/$id",
                        title = "Tab $id",
                        isFocused = id == "1",
                    )
                }
        )

    @Test
    fun `WHEN rendered THEN a favicon circle is shown for each tab`() {
        setContent {
            TabGroupsStripContent(state = state, onTabClick = {})
        }

        composeTestRule.onAllNodesWithTag(TabGroupsTestTag.TAB_GROUPS_STRIP_TAB).assertCountEquals(state.tabs.size)
    }

    @Test
    fun `WHEN a favicon circle is tapped THEN onTabClick is invoked with its tab id`() {
        var clickedId: String? = null
        setContent {
            TabGroupsStripContent(state = state, onTabClick = { clickedId = it })
        }

        composeTestRule.onAllNodesWithTag(TabGroupsTestTag.TAB_GROUPS_STRIP_TAB).onFirst().performClick()

        assertEquals("1", clickedId)
    }

    private fun setContent(content: @Composable () -> Unit) {
        composeTestRule.setContent {
            CompositionLocalProvider(LocalUnderTest provides true) {
                FirefoxTheme(theme = Theme.Light) {
                    content()
                }
            }
        }
    }
}
