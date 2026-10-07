/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.browser.compose

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.tabstray.browser.compose.interactable.InteractableDragItemContainer
import org.mozilla.fenix.tabstray.browser.compose.interactable.createGridInteractionState
import org.mozilla.fenix.tabstray.controller.NoOpItemInteractionHandler

@RunWith(AndroidJUnit4::class)
class InteractableDragItemContainerTest {
    @get:Rule val composeTestRule = createComposeRule()

    private val keys = listOf("a", "b", "c", "d")
    private val decoratedTag = "decorated"

    @Test
    fun `GIVEN entering item key WHEN grid composes THEN only that item receives the decoration`() {
        composeTestRule.setContent {
            TestGrid(enteringItemKey = "b")
        }
        composeTestRule.onAllNodesWithTag(decoratedTag).assertCountEquals(1)
    }

    @Test
    fun `GIVEN no entering item key WHEN grid composes THEN no item receives a decoration`() {
        composeTestRule.setContent {
            TestGrid(enteringItemKey = null)
        }
        composeTestRule.onAllNodesWithTag(decoratedTag).assertCountEquals(0)
    }

    @Test
    fun `GIVEN an entering item key that does not match any item WHEN grid composes THEN no item receives a decoration`() {
        composeTestRule.setContent {
            TestGrid(enteringItemKey = "NotARealKey")
        }
        composeTestRule.onAllNodesWithTag(decoratedTag).assertCountEquals(0)
    }

    @Composable
    private fun TestGrid(enteringItemKey: String?) {
        val gridState = rememberLazyGridState()
        val interactionState =
            createGridInteractionState(
                gridState = gridState,
                itemInteractionHandler = NoOpItemInteractionHandler,
                ignoredItems = emptySet(),
                liveReorderEnabled = false,
            )
        LazyVerticalGrid(columns = GridCells.Fixed(2), state = gridState) {
            itemsIndexed(items = keys, key = { _, key -> key }) { index, key ->
                InteractableDragItemContainer(
                    state = interactionState,
                    key = key,
                    position = index,
                    swipingActive = false,
                    enteringItemKey = enteringItemKey,
                    enteringItemDecoration = {
                        Modifier.testTag(decoratedTag)
                    },
                ) {
                    Box(Modifier.size(24.dp))
                }
            }
        }
    }
}
