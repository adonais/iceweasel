/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.browser.compose

import androidx.compose.foundation.lazy.grid.LazyGridItemInfo
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.toOffset
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.tabstray.browser.compose.interactable.GridInteractionState
import org.mozilla.fenix.tabstray.browser.compose.interactable.GridInteractionStateImpl
import org.mozilla.fenix.tabstray.browser.compose.interactable.GridItemOffset
import org.mozilla.fenix.tabstray.browser.compose.interactable.InteractionMode
import org.mozilla.fenix.tabstray.browser.compose.interactable.InteractionState
import org.mozilla.fenix.tabstray.browser.compose.interactable.InteractionType
import org.mozilla.fenix.tabstray.browser.compose.interactable.closestDistanceTo
import org.mozilla.fenix.tabstray.browser.compose.interactable.closestPointTo
import org.mozilla.fenix.tabstray.browser.compose.interactable.gatherCandidates
import org.mozilla.fenix.tabstray.controller.NoOpTabInteractionHandler
import org.mozilla.fenix.tabstray.controller.TabInteractionHandler
import kotlin.test.assertEquals
import kotlin.test.assertNull

class InteractableGridTest {
    private val testDispatcher = StandardTestDispatcher()
    private val scope = TestScope(testDispatcher)
    private val defaultIgnoredItems = setOf(TabKeys.HEADER, TabKeys.SPAN)

    @Test
    fun `GIVEN a point is inside the Rect THEN closestDistanceTo returns 0`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        assertEquals(0f, rect.closestDistanceTo(Offset(50f, 50f)))
    }

    @Test
    fun `GIVEN a point is to the right of a rect THEN closestDistanceTo returns squared distance from right edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        // (110 - 100) ^2 = 100
        assertEquals(100f, rect.closestDistanceTo(Offset(110f, 50f)))
    }

    @Test
    fun `GIVEN a point is to the left of a rect THEN closestDistanceTo returns squared distance from left edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        // (110 - 100) ^2 = 100
        assertEquals(100f, rect.closestDistanceTo(Offset(-10f, 50f)))
    }

    @Test
    fun `GIVEN a point is to the top of a rect THEN closestDistanceTo returns squared distance from top edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        // (110 - 100) ^2 = 100
        assertEquals(100f, rect.closestDistanceTo(Offset(50f, -10f)))
    }

    @Test
    fun `GIVEN a point is to the bottom of a rect THEN closestDistanceTo returns squared distance from bottom edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        // (110 - 100) ^2 = 100
        assertEquals(100f, rect.closestDistanceTo(Offset(50f, 110f)))
    }

    @Test
    fun `Given a point is inside a Rect THEN closestPointTo returns the same point`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        val point = Offset(50f, 50f)
        assertEquals(point, rect.closestPointTo(point))
    }

    @Test
    fun `Given a point is to the right of a rect THEN closestPointTo returns the right edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        val point = rect.closestPointTo(Offset(110f, 50f))
        assertEquals(point.x, rect.right)
    }

    @Test
    fun `Given a point is to the top of a rect THEN closestPointTo returns the top edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        val point = rect.closestPointTo(Offset(50f, -10f))
        assertEquals(point.y, rect.top)
    }

    @Test
    fun `Given a point is to the left of a rect THEN closestPointTo returns the left edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        val point = rect.closestPointTo(Offset(-10f, 50f))
        assertEquals(point.x, rect.left)
    }

    @Test
    fun `Given a point is to the bottom of a rect THEN closestPointTo returns the bottom edge`() {
        val rect = Rect(
            left = 0f,
            top = 0f,
            right = 100f,
            bottom = 100f,
        )
        val point = rect.closestPointTo(Offset(50f, 110f))
        assertEquals(point.y, rect.bottom)
    }

    @Test
    fun `GIVEN a visible GridItem WHEN gatherCandidates is called THEN Overlap, None, Left and Right gutter candidates are created`() {
        val gridState = mockGridState(listOf(mockGridItem("key"), mockGridItem(TabKeys.TAB_BETA)))

        val candidates = gatherCandidates(
            gridState = gridState,
            draggedItemOffset = fakeDraggedGridItemOffset(),
            draggedItem = fakeGridActiveState(),
            ignoredItems = defaultIgnoredItems,
        )

        assertEquals(4, candidates.size)
        assertTrue(candidates.any { it.type is InteractionType.Overlap })
        assertTrue(candidates.any { it.type is InteractionType.LeftGutter })
        assertTrue(candidates.any { it.type is InteractionType.RightGutter })
        assertTrue(candidates.any { it.type is InteractionType.None })
    }

    @Test
    fun `GIVEN the first visible item is not the first in the list AND dragged item is at top of viewport WHEN gatherCandidates is called THEN top Scroll candidate is created`() {
        val gridState = mockGridState(
            listOf(
                mockGridItem("key"),
                mockGridItem(TabKeys.TAB_BETA),
                mockGridItem("key3"),
            ),
            firstVisibleIndex = 1,
        )

        val candidates = gatherCandidates(
            gridState = gridState,
            draggedItemOffset = fakeDraggedGridItemOffset(),
            draggedItem = fakeGridActiveState(),
            ignoredItems = defaultIgnoredItems,
        )

        assertEquals(1, candidates.count { it.type is InteractionType.Scroll })
    }

    @Test
    fun `GIVEN the last visible item is not the last in the list AND dragged item is at bottom of viewport WHEN gatherCandidates is called THEN bottom Scroll candidate is created`() {
        val gridState = mockGridState(
            listOf(
                mockGridItem("key"),
                mockGridItem(TabKeys.TAB_BETA),
                mockGridItem("key3"),
            ),
            firstVisibleIndex = 0,
            totalItems = 10,
        )

        val draggedItem = InteractionState.Grid.Active(
            index = 0,
            key = "key",
            initialOffset = Offset(10f, 10f),
        )
        val candidates = gatherCandidates(
            gridState = gridState,
            draggedItemOffset = GridItemOffset(
                draggedItem = draggedItem,
                draggingItemOffset = Offset(10f, 10f),
                itemSize = IntSize(10, 10),
            ),
            draggedItem = draggedItem,
            ignoredItems = defaultIgnoredItems,
        )

        assertEquals(1, candidates.count { it.type is InteractionType.Scroll })
    }

    @Test
    fun `GIVEN an ignored GridItem THEN no candidates are generated`() {
        val gridState = mockGridState(mockItems = listOf(mockGridItem("ignored")))

        val candidates = gatherCandidates(
            gridState = gridState,
            draggedItemOffset = fakeDraggedGridItemOffset(),
            draggedItem = fakeGridActiveState(),
            ignoredItems = setOf("ignored"),
        )

        assertTrue(candidates.isEmpty())
    }

    @Test
    fun `GIVEN an empty GridItem list THEN no candidates are generated`() {
        val gridState = mockGridState(mockItems = emptyList())

        val candidates = gatherCandidates(
            gridState = gridState,
            draggedItemOffset = fakeDraggedGridItemOffset(),
            draggedItem = fakeGridActiveState(),
            ignoredItems = setOf("ignored"),
        )

        assertTrue(candidates.isEmpty())
    }

    @Test
    fun `GIVEN an item is dragged onto another AND live reorder is disabled WHEN onDragEnd is called THEN onDrop is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = IntOffset(0, 110)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = IntOffset(20, 110),
            includeHeader = true,
            liveReorderEnabled = false,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toOffset(), false)
        reorderState.dragRight(distance = 20f, preserveSelectMode = false) // 20 to the right
        reorderState.onDragEnd()

        verify { handler.onDrop(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA) }
    }

    @Test
    fun `GIVEN an item is dragged onto another AND live reorder is enabled WHEN onDragEnd is called THEN onDrop is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = IntOffset(0, 0)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = IntOffset(20, 0),
            liveReorderEnabled = true,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toOffset(), false)
        reorderState.dragRight(distance = 20f, preserveSelectMode = false)
        reorderState.onDragEnd()

        verify { handler.onDrop(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA) }
    }

    @Test
    fun `GIVEN an item is dragged to the right of another WHEN onDragEnd is called THEN onMove is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = IntOffset(10, 110)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = IntOffset(30, 110),
            itemSize = IntSize(10, 110),
            includeHeader = true,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toOffset(), false)
        reorderState.dragRight(distance = 50f, preserveSelectMode = false)
        reorderState.onDragEnd()

        verify { handler.onMove(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA, true) }
    }

    @Test
    fun `GIVEN live reorder is disabled WHEN an item is dragged to the right of another THEN onMove is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = IntOffset(10, 0)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = IntOffset(30, 0),
            liveReorderEnabled = false,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toOffset(), false)
        reorderState.dragRight(distance = 50f, preserveSelectMode = false)

        verify(exactly = 0) { handler.onMove(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA, true) }
    }

    @Test
    fun `GIVEN live reorder is enabled WHEN an item is dragged to the right of another THEN onMove is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = IntOffset(10, 0)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = IntOffset(30, 0),
            liveReorderEnabled = true,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toOffset(), false)
        reorderState.dragRight(distance = 50f, preserveSelectMode = false)

        verify { handler.onMove(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA, true) }
    }

    @Test
    fun `GIVEN live reorder is enabled THEN multiple drag events do not invoke multiple moves`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = IntOffset(10, 0)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = IntOffset(30, 0),
            liveReorderEnabled = true,
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toOffset(), false)
        reorderState.dragRight(distance = 50f, preserveSelectMode = false)
        reorderState.dragRight(distance = 0f, preserveSelectMode = false)
        reorderState.dragRight(distance = 0f, preserveSelectMode = false)

        verify(exactly = 1) { handler.onMove(TabKeys.TAB_ALPHA, TabKeys.TAB_BETA, true) }
    }

    @Test
    fun `GIVEN an item is dragged to the left of another WHEN onDragEnd is called THEN onMove is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val draggedItemOffset = IntOffset(30, 110)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = IntOffset(10, 110),
            betaTabOffset = draggedItemOffset,
            itemSize = IntSize(10, 110),
            includeHeader = true,
        )

        reorderState.onTouchSlopPassed(draggedItemOffset.toOffset(), false)
        reorderState.dragLeft(distance = 10f, preserveSelectMode = false)
        reorderState.onDragEnd()

        verify { handler.onMove(TabKeys.TAB_BETA, TabKeys.TAB_ALPHA, false) }
    }

    @Test
    fun `GIVEN live reorder disabled WHEN an item is dragged to the left of another THEN onMove is not called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val draggedItemOffset = IntOffset(30, 0)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = IntOffset(10, 0),
            betaTabOffset = draggedItemOffset,
            liveReorderEnabled = false,
        )

        reorderState.onTouchSlopPassed(draggedItemOffset.toOffset(), false)
        reorderState.dragLeft(10f, preserveSelectMode = false)

        verify(exactly = 0) { handler.onMove(TabKeys.TAB_BETA, TabKeys.TAB_ALPHA, false) }
    }

    @Test
    fun `GIVEN live reorder enabled WHEN an item is dragged to the left of another THEN onMove is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val draggedItemOffset = IntOffset(30, 0)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = IntOffset(10, 0),
            betaTabOffset = draggedItemOffset,
            liveReorderEnabled = true,
        )

        reorderState.onTouchSlopPassed(draggedItemOffset.toOffset(), false)
        reorderState.dragLeft(30f, preserveSelectMode = false)

        verify { handler.onMove(TabKeys.TAB_BETA, TabKeys.TAB_ALPHA, false) }
    }

    @Test
    fun `GIVEN a drag is in progress and the dragged item is not visible when onDragEnd is called THEN the state is reset`() {
        val reorderState = fakeGridReorderState(gridState = mockGridState(mockItems = emptyList()))

        reorderState.onTouchSlopPassed(Offset.Zero, false)
        reorderState.onDragEnd()

        assertEquals(InteractionState.Grid.None, reorderState.draggedItem)
        assertEquals(InteractionState.Grid.None, reorderState.hoveredItem)
        assertNull(reorderState.highlightedRect)
        assertEquals(InteractionMode.Grid.None, reorderState.interactionMode)
    }

    @Test
    fun `GIVEN a drag is in progress and the dragged item is not visible when onDragEnd is called THEN onDragCancelled is called`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val draggedItemOffset = IntOffset(30, 0)
        val reorderState = fakeGridReorderState(
            mockGridState(mockItems = listOf(mockGridItem(key = TabKeys.TAB_BETA, offset = draggedItemOffset))),
            handler = handler,
        )

        reorderState.onTouchSlopPassed(draggedItemOffset.toOffset(), false)
        reorderState.onDrag(offset = Offset(50f, 50f), preserveSelectMode = false)
        reorderState.onDragEnd()

        verify { handler.onDragCancel() }
    }

    @Test
    fun `WHEN an item is dragged GIVEN preserveSelectMode is true THEN onDragStart is called with the same flag`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = IntOffset(10, 0)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = IntOffset(30, 0),
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toOffset(), true)
        reorderState.dragRight(distance = 50f, preserveSelectMode = true)

        verify { handler.onDragStart(sourceKey = TabKeys.TAB_ALPHA, preserveSelectMode = true) }
    }

    @Test
    fun `WHEN an item is dragged GIVEN preserveSelectMode is false THEN onDragStart is called with the same flag`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = IntOffset(10, 0)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = IntOffset(30, 0),
        )

        reorderState.onTouchSlopPassed(dragItemOffset.toOffset(), false)
        reorderState.dragRight(distance = 50f, preserveSelectMode = false)

        verify { handler.onDragStart(sourceKey = TabKeys.TAB_ALPHA, preserveSelectMode = false) }
    }

    @Test
    fun `WHEN a drag is cancelled THEN the handler is invoked with a drag cancel call`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val dragItemOffset = IntOffset(10, 0)
        val reorderState = twoTabReorderState(
            handler = handler,
            alphaTabOffset = dragItemOffset,
            betaTabOffset = IntOffset(30, 0),
        )

        reorderState.onTouchSlopPassed(offset = dragItemOffset.toOffset(), shouldLongPress = false)
        reorderState.onDrag(offset = Offset(50f, 50f), preserveSelectMode = false)
        reorderState.onDragCancelled()

        verify { handler.onDragCancel() }
    }

    @Test
    fun `WHEN a large ignored item is placed in the TabsTray THEN the item size is the size of a normal tab`() {
        val handler = mockk<TabInteractionHandler>(relaxed = true)
        val reorderState = fakeGridReorderState(
            mockGridState(
                mockItems = listOf(
                    mockGridItem(key = TabKeys.HEADER, index = 0, size = IntSize(1248, 168), offset = IntOffset(0, 0)),
                    mockGridItem(key = TabKeys.TAB_ALPHA, index = 1, size = IntSize(600, 750), offset = IntOffset(0, 918)),
                    mockGridItem(key = TabKeys.TAB_BETA, index = 2, size = IntSize(600, 750), offset = IntOffset(600, 918)),
                    mockGridItem(key = "span", index = 3, size = IntSize(1248, 10), offset = IntOffset(600, 2000)),
                ),
            ),
            handler = handler,
        )

        assertEquals(expected = IntSize(600, 750), actual = reorderState.itemSize)
    }

    @Test
    fun `WHEN reset is called THEN the state is reset`() {
        val reorderState = fakeGridReorderState(mockGridState())
        reorderState.onTouchSlopPassed(Offset(50f, 50f), false)
        reorderState.onDrag(offset = Offset(50f, 50f), preserveSelectMode = false)

        reorderState.reset()

        assertEquals(InteractionState.Grid.None, reorderState.draggedItem)
        assertEquals(InteractionState.Grid.None, reorderState.hoveredItem)
        assertNull(reorderState.highlightedRect)
        assertEquals(InteractionMode.Grid.None, reorderState.interactionMode)
        assertEquals(reorderState.previousItemAnimatableOffset.value, Offset.Zero)
    }

    private fun mockGridItem(
        key: String = "key",
        index: Int = 1,
        size: IntSize = IntSize(10, 10),
        offset: IntOffset = IntOffset(0, 0),
    ): LazyGridItemInfo {
        return mockk<LazyGridItemInfo> {
            every { this@mockk.key } returns key
            every { this@mockk.index } returns index
            every { this@mockk.size } returns size
            every { this@mockk.offset } returns offset
        }
    }

    private fun mockHeaderItem(): LazyGridItemInfo =
        mockGridItem(key = TabKeys.HEADER, index = 0, size = IntSize(1000, 100), offset = IntOffset(0, 0))

    private fun twoTabReorderState(
        handler: TabInteractionHandler,
        alphaTabOffset: IntOffset,
        betaTabOffset: IntOffset,
        itemSize: IntSize = IntSize(10, 10),
        includeHeader: Boolean = false,
        liveReorderEnabled: Boolean = false,
    ): GridInteractionState {
        val items = buildList {
            if (includeHeader) {
                add(mockHeaderItem())
            }
            add(mockGridItem(key = TabKeys.TAB_ALPHA, index = 1, size = itemSize, offset = alphaTabOffset))
            add(mockGridItem(key = TabKeys.TAB_BETA, index = 2, size = itemSize, offset = betaTabOffset))
        }
        return fakeGridReorderState(
            mockGridState(mockItems = items),
            handler = handler,
            liveReorderEnabled = liveReorderEnabled,
        )
    }

    private fun mockGridState(
        mockItems: List<LazyGridItemInfo> = emptyList(),
        firstVisibleIndex: Int = 0,
        totalItems: Int = mockItems.size,
    ): LazyGridState {
        return mockk<LazyGridState> {
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

    private fun fakeGridReorderState(
        gridState: LazyGridState,
        handler: TabInteractionHandler = NoOpTabInteractionHandler,
        liveReorderEnabled: Boolean = false,
    ): GridInteractionState {
        return GridInteractionStateImpl(
            gridState = gridState,
            tabInteractionHandler = handler,
            scope = scope,
            touchSlop = 0f,
            ignoredItems = defaultIgnoredItems,
            onLongPress = { _ -> },
            hapticFeedback = mockk<HapticFeedback> {
                every { performHapticFeedback(any()) } just Runs
            },
            dragAndDropEnabled = true,
            liveReorderEnabled = liveReorderEnabled,
        )
    }

    private fun GridInteractionState.dragRight(distance: Float, preserveSelectMode: Boolean) {
        this.onDrag(offset = Offset(distance, 0f), preserveSelectMode = preserveSelectMode)
    }

    private fun GridInteractionState.dragLeft(distance: Float, preserveSelectMode: Boolean) {
        this.onDrag(offset = Offset(-distance, 0f), preserveSelectMode = preserveSelectMode)
    }
}
