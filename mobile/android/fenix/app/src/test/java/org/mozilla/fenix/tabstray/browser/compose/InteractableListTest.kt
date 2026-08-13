/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.browser.compose

import androidx.compose.foundation.lazy.LazyListItemInfo
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.unit.IntSize
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.tabstray.browser.compose.interactable.InteractionMode
import org.mozilla.fenix.tabstray.browser.compose.interactable.InteractionState
import org.mozilla.fenix.tabstray.browser.compose.interactable.InteractionType
import org.mozilla.fenix.tabstray.browser.compose.interactable.ListInteractionState
import org.mozilla.fenix.tabstray.browser.compose.interactable.ListInteractionStateImpl
import org.mozilla.fenix.tabstray.browser.compose.interactable.ListItemOffset
import org.mozilla.fenix.tabstray.browser.compose.interactable.closestDistanceTo
import org.mozilla.fenix.tabstray.browser.compose.interactable.closestPointTo
import org.mozilla.fenix.tabstray.browser.compose.interactable.gatherCandidates
import org.mozilla.fenix.tabstray.controller.NoOpTabInteractionHandler
import org.mozilla.fenix.tabstray.controller.TabInteractionHandler
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull

class InteractableListTest {
    private val testDispatcher = StandardTestDispatcher()
    private val scope = TestScope(testDispatcher)

    private val defaultIgnoredItems = setOf(TabKeys.HEADER, TabKeys.SPAN)

    @Test
    fun `GIVEN a y value is inside the Rect THEN closestDistanceTo returns 0`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        assertEquals(0f, rect.closestDistanceTo(50f))
    }

    @Test
    fun `GIVEN a y value is to the top of a rect THEN closestDistanceTo returns squared distance from top edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        assertEquals(100f, rect.closestDistanceTo(-10f))
    }

    @Test
    fun `GIVEN a y value is to the bottom of a rect THEN closestDistanceTo returns squared distance from bottom edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        assertEquals(100f, rect.closestDistanceTo(110f))
    }

    @Test
    fun `Given a y value is inside a Rect THEN closestPointTo returns the same value`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        val y = 50f
        assertEquals(y, rect.closestPointTo(y))
    }

    @Test
    fun `Given a y value is to the top of a rect THEN closestPointTo returns the top edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        val y = rect.closestPointTo(-10f)
        assertEquals(y, rect.top)
    }

    @Test
    fun `Given a point is to the bottom of a rect THEN closestPointTo returns the bottom edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        val y = rect.closestPointTo(110f)
        assertEquals(y, rect.bottom)
    }

    @Test
    fun `GIVEN a visible ListItem WHEN gatherCandidates is called THEN Overlap, Top and Bottom gutter candidates are created`() {
        val listState = mockListState(listOf(mockListItem("key"), mockListItem(TabKeys.TAB_BETA)))

        val candidates = gatherCandidates(
            listState = listState,
            draggedItemOffset = fakeDraggedListItemOffset(),
            draggedItem = fakeListActiveState(),
            ignoredItems = defaultIgnoredItems,
        )

        assertEquals(3, candidates.size)
        assertTrue(candidates.any { it.type is InteractionType.Overlap })
        assertTrue(candidates.any { it.type is InteractionType.TopGutter })
        assertTrue(candidates.any { it.type is InteractionType.BottomGutter })
    }

    @Test
    fun `GIVEN the first visible item is not the first in the list AND dragged item is at top of viewport WHEN gatherCandidates is called THEN top Scroll candidate is created`() {
        val listState = mockListState(
            listOf(
                mockListItem("key"),
                mockListItem(TabKeys.TAB_BETA),
                mockListItem("key3"),
            ),
            firstVisibleIndex = 1,
        )

        val candidates = gatherCandidates(
            listState = listState,
            draggedItemOffset = fakeDraggedListItemOffset(),
            draggedItem = fakeListActiveState(),
            ignoredItems = defaultIgnoredItems,
        )

        assertEquals(1, candidates.count { it.type is InteractionType.Scroll })
    }

    @Test
    fun `GIVEN the last visible item is not the last in the list AND dragged item is at bottom of viewport WHEN gatherCandidates is called THEN bottom Scroll candidate is created`() {
        val listState = mockListState(
            listOf(
                mockListItem("key"),
                mockListItem(TabKeys.TAB_BETA),
                mockListItem("key3"),
            ),
            firstVisibleIndex = 0,
            totalItems = 10,
        )

        val draggedItem = InteractionState.List.Active(
            index = 0,
            key = "key",
            initialOffset = 10f,
        )
        val candidates = gatherCandidates(
            listState = listState,
            draggedItemOffset = ListItemOffset(
                draggedItem = draggedItem,
                draggingItemOffset = 10f,
                itemSize = 10,
            ),
            draggedItem = draggedItem,
            ignoredItems = defaultIgnoredItems,
        )

        assertEquals(1, candidates.count { it.type is InteractionType.Scroll })
    }

    @Test
    fun `GIVEN an ignored ListItem THEN no candidates are generated`() {
        val listState = mockListState(mockItems = listOf(mockListItem("ignored")))

        val candidates = gatherCandidates(
            listState = listState,
            draggedItemOffset = fakeDraggedListItemOffset(),
            draggedItem = fakeListActiveState(),
            ignoredItems = setOf("ignored"),
        )

        assertTrue(candidates.isEmpty())
    }

    @Test
    fun `GIVEN an empty list THEN no candidates are generated`() {
        val listState = mockListState(mockItems = emptyList())

        val candidates = gatherCandidates(
            listState = listState,
            draggedItemOffset = fakeDraggedListItemOffset(),
            draggedItem = fakeListActiveState(),
            ignoredItems = defaultIgnoredItems,
        )

        assertTrue(candidates.isEmpty())
    }

    @Test
    fun `GIVEN liveReorderEnabled is false WHEN an item is dragged onto another WHEN onDragEnd is called THEN onDrop is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 120
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 140,
            includeHeader = true,
            liveReorderEnabled = false,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), false)
        reorderState.dragDown(distance = 20f, preserveSelectMode = false) // 20 down
        reorderState.onDragEnd()

        verify { handler.onDrop(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA) }
    }

    @Test
    fun `GIVEN liveReorderEnabled is true WHEN an item is dragged onto another WHEN onDragEnd is called THEN onDrop is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 120
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 140,
            includeHeader = true,
            liveReorderEnabled = true,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), false)
        reorderState.dragDown(distance = 20f, preserveSelectMode = false) // 20 down
        reorderState.onDragEnd()

        verify { handler.onDrop(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA) }
    }

    @Test
    fun `GIVEN drag and drop disabled and an item is dragged onto another WHEN onDragEnd is called THEN onDrop is not called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 120
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 140,
            includeHeader = true,
            dragAndDropEnabled = false,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), false)
        reorderState.dragDown(distance = 20f, preserveSelectMode = false) // 20 down
        reorderState.onDragEnd()

        verify(exactly = 0) { handler.onDrop(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA) }
        verify { handler.onMove(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA, false) }
    }

    @Test
    fun `GIVEN liveReorderEnabled is false WHEN an item is dragged to the bottom of another WHEN onDrag is called THEN onMove is not called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 110
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 130,
            includeHeader = true,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), false)
        reorderState.dragDown(distance = 50f, preserveSelectMode = false) // 50 down

        verify(exactly = 0) { handler.onMove(any<String>(), any<String>(), any<Boolean>()) }
    }

    @Test
    fun `GIVEN liveReorderEnabled is true WHEN an item is dragged to the bottom of another WHEN onDrag is called THEN onMove is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 110
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 130,
            includeHeader = true,
            liveReorderEnabled = true,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), false)
        reorderState.dragDown(distance = 50f, preserveSelectMode = false) // 50 down

        verify { handler.onMove(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA, true) }
    }

    @Test
    fun `GIVEN liveReorderEnabled is false WHEN an item is dragged to the bottom of another WHEN onDragEnd is called THEN onMove is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 110
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 130,
            includeHeader = true,
            liveReorderEnabled = false,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), false)
        reorderState.dragDown(distance = 50f, preserveSelectMode = false) // 50 down
        reorderState.onDragEnd()

        verify { handler.onMove(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA, true) }
    }

    @Test
    fun `GIVEN liveReorderEnabled is false WHEN an item is dragged to the top of another WHEN onDrag is called THEN onMove is not called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 30
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = 10,
            betaTabOffset = dragItemOffset,
            liveReorderEnabled = false,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), false)
        reorderState.dragUp(distance = 30f, preserveSelectMode = false) // 30 up

        verify(exactly = 0) { handler.onMove(any<String>(), any<String>(), any<Boolean>()) }
    }

    @Test
    fun `GIVEN liveReorderEnabled is true WHEN an item is dragged to the top of another WHEN onDrag is called THEN onMove is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 30
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = 10,
            betaTabOffset = dragItemOffset,
            liveReorderEnabled = true,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), false)
        reorderState.dragUp(distance = 30f, preserveSelectMode = false) // 30 up

        verify { handler.onMove(TabKeys.TAB_BETA, TabKeys.TAB_ALPHA, false) }
    }

    @Test
    fun `GIVEN liveReorderEnabled is false WHEN an item is dragged to the top of another WHEN onDragEnd is called THEN onMove is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 30
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = 10,
            betaTabOffset = dragItemOffset,
            liveReorderEnabled = false,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), false)
        reorderState.dragUp(distance = 30f, preserveSelectMode = false) // 30 up
        reorderState.onDragEnd()

        verify { handler.onMove(TabKeys.TAB_BETA, TabKeys.TAB_ALPHA, false) }
    }

    @Test
    fun `GIVEN liveReorderEnabled is true WHEN multiple drag events to the same position occur THEN only one onMove is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 30
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = 10,
            betaTabOffset = dragItemOffset,
            liveReorderEnabled = true,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), false)
        reorderState.dragUp(distance = 30f, preserveSelectMode = false) // 30 up
        reorderState.dragDown(distance = 0f, preserveSelectMode = false)
        reorderState.dragDown(distance = 0f, preserveSelectMode = false)

        verify(exactly = 1) { handler.onMove(TabKeys.TAB_BETA, TabKeys.TAB_ALPHA, false) }
    }

    @Test
    fun `GIVEN a drag is in progress and the dragged item is not visible when onDragEnd is called THEN the state is reset`() {
        val reorderState = fakeListInteractionState(listState = mockListState(mockItems = emptyList()))

        reorderState.onTouchSlopPassed(0f, false)
        reorderState.onDragEnd()

        assertEquals(InteractionState.List.None, reorderState.draggedItem)
        assertEquals(InteractionState.List.None, reorderState.hoveredItem)
        assertNull(reorderState.highlightedRect)
        assertEquals(InteractionMode.List.None, reorderState.interactionMode)
    }

    @Test
    fun `GIVEN a drag is in progress and the dragged item is not visible when onDragEnd is called THEN onDragCancelled is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val draggedItemOffset = 30
        val reorderState = fakeListInteractionState(
            mockListState(mockItems = listOf(mockListItem(key = TabKeys.TAB_BETA, offset = draggedItemOffset))),
            handler = handler,
        )

        reorderState.onTouchSlopPassed(draggedItemOffset.toFloat(), false)
        reorderState.dragDown(distance = 50f, preserveSelectMode = false)
        reorderState.onDragEnd()

        verify { handler.onDragCancel() }
    }

    @Test
    fun `WHEN an item is dragged GIVEN preserveSelectMode is true THEN onDragStart is called with the same flag`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 10
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 30,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), true)
        reorderState.dragDown(distance = 50f, preserveSelectMode = true) // 50 down

        verify { handler.onDragStart(sourceKey = TabKeys.TAB_ALPHA, preserveSelectMode = true) }
    }

    @Test
    fun `WHEN an item is dragged GIVEN preserveSelectMode is false THEN onDragStart is called with the same flag`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 10
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 30,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), true)
        reorderState.dragDown(distance = 50f, preserveSelectMode = false) // 50 down

        verify { handler.onDragStart(sourceKey = TabKeys.TAB_ALPHA, preserveSelectMode = false) }
    }

    @Test
    fun `WHEN a drag is cancelled THEN the handler is invoked with a drag cancel call`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 10
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 30,
        )

        reorderState.onTouchSlopPassed(offset = dragItemOffset.toFloat(), shouldLongPress = false)
        reorderState.dragDown(distance = 50f, preserveSelectMode = false)
        reorderState.onDragCancelled()

        verify { handler.onDragCancel() }
    }

    @Test
    fun `WHEN a drag starts and the pointer does not move THEN the moved parameter is false`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 10
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 30,
        )

        reorderState.onTouchSlopPassed(offset = dragItemOffset.toFloat(), shouldLongPress = false)

        assertIs<InteractionState.List.Active>(reorderState.draggedItem)
        assertFalse(reorderState.draggedItem.moved)
    }

    @Test
    fun `WHEN a drag starts and the pointer moves THEN the moved parameter is true`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 10
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 30,
        )

        reorderState.onTouchSlopPassed(offset = dragItemOffset.toFloat(), shouldLongPress = false)
        reorderState.dragDown(distance = 40f, preserveSelectMode = true)

        assertIs<InteractionState.List.Active>(reorderState.draggedItem)
        assertTrue(reorderState.draggedItem.moved)
    }

    @Test
    fun `GIVEN an in progress drag WHEN onCancelled is called THEN the dragged item is reset to None and moved is false`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 10
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 30,
        )

        reorderState.onTouchSlopPassed(offset = dragItemOffset.toFloat(), shouldLongPress = false)
        reorderState.dragDown(distance = 40f, preserveSelectMode = true)
        reorderState.onDragCancelled()

        assertIs<InteractionState.List.None>(reorderState.draggedItem)
        assertFalse(reorderState.draggedItem.moved)
    }

    @Test
    fun `GIVEN a large ignored header item WHEN itemSize is called it retrieves a regular tab item size`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val reorderState = fakeListInteractionState(
            mockListState(
                mockItems = listOf(
                    mockListItem(key = TabKeys.HEADER, index = 1, size = 10000, offset = 0),
                    mockListItem(key = TabKeys.TAB_ALPHA, offset = 10),
                    mockListItem(key = TabKeys.TAB_BETA, offset = 30),
                ),
            ),
            handler = handler,
        )

        assertEquals(reorderState.itemSize, 10)
    }

    @Test
    fun `GIVEN a hovered item WHEN the mode changes THEN the hovered item is reset`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = 120
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = 140,
            includeHeader = true,
            liveReorderEnabled = false,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toFloat(), false)
        reorderState.dragDown(distance = 20f, preserveSelectMode = false) // 20 down
        assertIs<InteractionState.List.Active>(reorderState.hoveredItem)

        reorderState.dragUp(distance = 20f, preserveSelectMode = false)

        assertIs<InteractionState.List.None>(reorderState.hoveredItem)
    }

    @Test
    fun `WHEN reset is called THEN the state is reset`() {
        val reorderState = fakeListInteractionState(listState = mockListState())
        reorderState.onTouchSlopPassed(0f, false)
        reorderState.onDragEnd()

        reorderState.reset()

        assertEquals(InteractionState.List.None, reorderState.draggedItem)
        assertEquals(InteractionState.List.None, reorderState.hoveredItem)
        assertNull(reorderState.highlightedRect)
        assertEquals(InteractionMode.List.None, reorderState.interactionMode)
        assertEquals(reorderState.previousItemAnimatableOffset.value, 0f)
    }

    private fun mockListItem(
        key: String = "key",
        index: Int = 1,
        size: Int = 10,
        offset: Int = 0,
    ): LazyListItemInfo {
        return mockk<LazyListItemInfo> {
            every { this@mockk.key } returns key
            every { this@mockk.index } returns index
            every { this@mockk.size } returns size
            every { this@mockk.offset } returns offset
        }
    }

    private fun mockHeaderItem(): LazyListItemInfo =
        mockListItem(key = TabKeys.HEADER, index = 0, size = 100, offset = 0)

    private fun twoTabReorderState(
        handler: TabInteractionHandler,
        alphaTabOffset: Int,
        betaTabOffset: Int,
        includeHeader: Boolean = false,
        dragAndDropEnabled: Boolean = true,
        liveReorderEnabled: Boolean = false,
    ): ListInteractionState {
        val items = buildList {
            if (includeHeader) {
                add(mockHeaderItem())
            }
            add(mockListItem(key = TabKeys.TAB_ALPHA, index = 1, offset = alphaTabOffset))
            add(mockListItem(key = TabKeys.TAB_BETA, index = 2, offset = betaTabOffset))
        }
        return fakeListInteractionState(
            mockListState(mockItems = items),
            handler = handler,
            dragAndDropEnabled = dragAndDropEnabled,
            liveReorderEnabled = liveReorderEnabled,
        )
    }

    private fun mockListState(
        mockItems: List<LazyListItemInfo> = emptyList(),
        firstVisibleIndex: Int = 0,
        totalItems: Int = mockItems.size,
    ): LazyListState {
        return mockk<LazyListState> {
            every { firstVisibleItemIndex } returns firstVisibleIndex
            every { layoutInfo } returns
                mockk {
                    every { visibleItemsInfo } returns mockItems
                    every { viewportSize } returns IntSize(10, 10)
                    every { firstVisibleItemIndex } returns firstVisibleIndex
                    every { totalItemsCount } returns totalItems
                    every { mainAxisItemSpacing } returns 10
                    every { beforeContentPadding } returns 10
                    every { viewportStartOffset } returns 0
                    every { viewportEndOffset } returns 10
                }
            every { isScrollInProgress } returns false
        }
    }

    private fun fakeListInteractionState(
        listState: LazyListState,
        handler: TabInteractionHandler = NoOpTabInteractionHandler,
        dragAndDropEnabled: Boolean = true,
        liveReorderEnabled: Boolean = false,
    ): ListInteractionState {
        return ListInteractionStateImpl(
            listState = listState,
            tabInteractionHandler = handler,
            scope = scope,
            touchSlop = 0f,
            ignoredItems = defaultIgnoredItems,
            onLongPress = { _ -> },
            hapticFeedback = mockk<HapticFeedback> {
                every { performHapticFeedback(any()) } just Runs
            },
            dragAndDropEnabled = dragAndDropEnabled,
            liveReorderEnabled = liveReorderEnabled,
        )
    }

    private fun ListInteractionState.dragDown(distance: Float, preserveSelectMode: Boolean) {
        this.onDrag(offset = distance, preserveSelectMode = preserveSelectMode)
    }

    private fun ListInteractionState.dragUp(distance: Float, preserveSelectMode: Boolean) {
        this.onDrag(offset = -distance, preserveSelectMode = preserveSelectMode)
    }
}
