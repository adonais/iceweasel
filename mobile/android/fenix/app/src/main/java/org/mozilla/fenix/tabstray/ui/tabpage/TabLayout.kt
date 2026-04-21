/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.tabpage

import android.content.res.Configuration
import androidx.compose.animation.core.DecayAnimationSpec
import androidx.compose.animation.rememberSplineBasedDecay
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.ScrollableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.BoxWithConstraintsScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridItemScope
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.toMutableStateList
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.dimensionResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import mozilla.components.compose.base.annotation.FlexibleWindowPreview
import mozilla.components.compose.base.modifier.thenConditional
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.SwipeToDismissState2
import org.mozilla.fenix.tabgroups.TabGroupCard
import org.mozilla.fenix.tabstray.browser.compose.DragItemContainer
import org.mozilla.fenix.tabstray.browser.compose.GridReorderState
import org.mozilla.fenix.tabstray.browser.compose.createGridReorderState
import org.mozilla.fenix.tabstray.browser.compose.createListReorderState
import org.mozilla.fenix.tabstray.browser.compose.detectGridPressAndDragGestures
import org.mozilla.fenix.tabstray.browser.compose.detectListPressAndDrag
import org.mozilla.fenix.tabstray.data.TabGroupTheme
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.data.createTab
import org.mozilla.fenix.tabstray.data.createTabGroup
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState
import org.mozilla.fenix.tabstray.ui.tabitems.TabGridTabItem
import org.mozilla.fenix.tabstray.ui.tabitems.TabListTabItem
import org.mozilla.fenix.tabstray.ui.tabitems.TabsTrayItemClickHandler
import org.mozilla.fenix.tabstray.ui.tabitems.TabsTrayItemSelectionState
import org.mozilla.fenix.tabstray.ui.tabitems.gridItemAspectRatio
import org.mozilla.fenix.tabstray.ui.tabitems.tabItemBorderFocused
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.ThemedValue
import org.mozilla.fenix.theme.ThemedValueProvider
import kotlin.math.max

// Key for the span item at the bottom of the tray, used to make the item not reorderable.
const val SPAN_ITEM_KEY = "span"

// Key for the header item at the top of the tray, used to make the item not reorderable.
const val HEADER_ITEM_KEY = "header"

private const val TAB_GRID_PORTRAIT_WIDTH_THRESHOLD_1 = 320
private const val TAB_GRID_PORTRAIT_WIDTH_THRESHOLD_2 = 480
private const val TAB_GRID_PORTRAIT_WIDTH_THRESHOLD_3 = 800

private const val TAB_GRID_LANDSCAPE_WIDTH_THRESHOLD_1 = 917
private const val TAB_GRID_LANDSCAPE_WIDTH_THRESHOLD_2 = 1280

private const val NUM_COLUMNS_TAB_GRID_PORTRAIT_THRESHOLD_1 = 2
private const val NUM_COLUMNS_TAB_GRID_PORTRAIT_THRESHOLD_2 = 3
private const val NUM_COLUMNS_TAB_GRID_PORTRAIT_THRESHOLD_3 = 4

private const val NUM_COLUMNS_TAB_GRID_LANDSCAPE_THRESHOLD_1 = 4
private const val NUM_COLUMNS_TAB_GRID_LANDSCAPE_THRESHOLD_2 = 5

private val TabListPadding = 16.dp
private val TabListItemCornerRadius = 12.dp
private val TabListLastItemShape = RoundedCornerShape(
    bottomStart = TabListItemCornerRadius,
    bottomEnd = TabListItemCornerRadius,
)

private val TabListFirstItemShape = RoundedCornerShape(
    topStart = TabListItemCornerRadius,
    topEnd = TabListItemCornerRadius,
)

private val TabListSingleItemShape = RoundedCornerShape(TabListItemCornerRadius)
private val TabListBorderMiddleItemShape = RoundedCornerShape(4.dp)

/**
 * Top-level UI for displaying a list of tabs.
 *
 * @param tabs The list of [TabsTrayItem] to display.
 * @param displayTabsInGrid Whether the tabs should be displayed in a grid.
 * @param selectedItemIndex The index of the currently selected tab. This will be scrolled to on first-render.
 * @param selectionMode [TabsTrayState.Mode] indicating whether the Tabs Tray is in single selection
 * or multi-selection and contains the set of selected tabs.
 * @param modifier [Modifier] to be applied to the layout.
 * @param onTabClose Invoked when the user clicks to close a tab.
 * @param onItemClick Invoked when the user clicks on a tab.
 * @param onItemLongClick Invoked when the user long clicks a tab.
 * @param onMove Invoked when the user moves a tab.
 * @param onTabDragStart Invoked when starting to drag a tab.
 * @param onDeleteTabGroup Invoked when the user clicks on delete tab group.
 * @param editTabGroupClick Invoked when the user clicks to edit a tab group.
 * @param header Optional layout to display before [tabs].
 * @param contentPadding Optional PaddingValues to pad the tab's content.
 */
@Suppress("LongParameterList")
@Composable
fun TabLayout(
    tabs: List<TabsTrayItem>,
    displayTabsInGrid: Boolean,
    selectedItemIndex: Int,
    selectionMode: TabsTrayState.Mode,
    modifier: Modifier = Modifier,
    onTabClose: (TabsTrayItem.Tab) -> Unit,
    onItemClick: (TabsTrayItem) -> Unit,
    onItemLongClick: (TabsTrayItem) -> Unit,
    onMove: (String, String?, Boolean) -> Unit,
    onTabDragStart: () -> Unit,
    onDeleteTabGroup: (TabsTrayItem.TabGroup) -> Unit,
    editTabGroupClick: (TabsTrayItem.TabGroup) -> Unit,
    header: (@Composable () -> Unit)? = null,
    contentPadding: PaddingValues = defaultTabLayoutContentPadding(),
) {
    if (displayTabsInGrid) {
        TabGrid(
            tabs = tabs,
            selectedItemIndex = selectedItemIndex,
            selectionMode = selectionMode,
            modifier = modifier,
            onTabClose = onTabClose,
            onItemClick = onItemClick,
            onItemLongClick = onItemLongClick,
            onMove = onMove,
            onTabDragStart = onTabDragStart,
            onDeleteTabGroup = onDeleteTabGroup,
            editTabGroupClick = editTabGroupClick,
            header = header,
            contentPadding = contentPadding,
        )
    } else {
        TabList(
            tabs = tabs,
            selectedItemIndex = selectedItemIndex,
            selectionMode = selectionMode,
            modifier = modifier,
            onTabClose = onTabClose,
            onItemClick = onItemClick,
            onItemLongClick = onItemLongClick,
            onMove = onMove,
            onTabDragStart = onTabDragStart,
            header = header,
        )
    }
}

@Composable
private fun TabLayoutScrollHelper(
    state: ScrollableState,
    selectedTabIndex: Int,
    bottomPadding: Dp,
    isHeaderPresent: Boolean,
) {
    val density = LocalDensity.current
    val bottomPaddingPx = with(density) { bottomPadding.roundToPx() }

    LaunchedEffect(Unit) {
        if (selectedTabIndex < 0) return@LaunchedEffect

        val targetIndex = selectedTabIndex + (if (isHeaderPresent) 1 else 0)

        val scrollToItem: suspend (Int, Int) -> Unit = when (state) {
            is LazyListState -> state::scrollToItem
            is LazyGridState -> state::scrollToItem
            else -> return@LaunchedEffect
        }

        snapshotFlow { calculateScrollDimensions(state) }
            .filterNotNull()
            .first()
            .let { (viewportHeight, itemHeight) ->
                if (viewportHeight > 0 && itemHeight > 0) {
                    val offset = -(viewportHeight - itemHeight - bottomPaddingPx)
                    withFrameNanos { }
                    scrollToItem(targetIndex, offset)
                }
            }
    }
}

private fun calculateScrollDimensions(state: ScrollableState): Pair<Int, Int>? {
    val (viewportHeight, items) = when (state) {
        is LazyListState -> state.layoutInfo.viewportSize.height to state.layoutInfo.visibleItemsInfo.map {
            it.key to it.size
        }
        is LazyGridState -> state.layoutInfo.viewportSize.height to state.layoutInfo.visibleItemsInfo.map {
            it.key to it.size.height
        }
        else -> return null
    }

    if (viewportHeight <= 0) return null

    val itemHeight = items.firstOrNull { it.first != HEADER_ITEM_KEY }?.second ?: 0
    return viewportHeight to itemHeight
}

@Suppress("LongParameterList", "LongMethod")
@Composable
private fun TabGrid(
    tabs: List<TabsTrayItem>,
    selectedItemIndex: Int,
    selectionMode: TabsTrayState.Mode,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues,
    onTabClose: (TabsTrayItem.Tab) -> Unit,
    onItemClick: (TabsTrayItem) -> Unit,
    onItemLongClick: (TabsTrayItem) -> Unit,
    onMove: (String, String?, Boolean) -> Unit,
    onTabDragStart: () -> Unit,
    onDeleteTabGroup: (TabsTrayItem.TabGroup) -> Unit,
    editTabGroupClick: (TabsTrayItem.TabGroup) -> Unit,
    header: (@Composable () -> Unit)? = null,
) {
    val gridState = rememberLazyGridState()

    TabLayoutScrollHelper(
        state = gridState,
        selectedTabIndex = selectedItemIndex,
        bottomPadding = contentPadding.calculateBottomPadding(),
        isHeaderPresent = header != null,
    )

    val tabGridBottomPadding = dimensionResource(id = R.dimen.tab_tray_grid_bottom_padding)
    val isInMultiSelectMode = selectionMode is TabsTrayState.Mode.Select

    val reorderState = createGridReorderState(
        gridState = gridState,
        onMove = { initialTab, newTab ->
            onMove(
                (initialTab.key as String),
                (newTab.key as String),
                initialTab.index < newTab.index,
            )
        },
        onLongPress = { itemInfo ->
            tabs.firstOrNull { tabItem -> tabItem.id == itemInfo.key }?.let { tab ->
                onItemLongClick(tab)
            }
        },
        onExitLongPress = onTabDragStart,
        ignoredItems = listOf(HEADER_ITEM_KEY, SPAN_ITEM_KEY),
    )
    var shouldLongPress by remember { mutableStateOf(!isInMultiSelectMode) }
    LaunchedEffect(selectionMode, reorderState.draggingItemKey) {
        if (reorderState.draggingItemKey == null) {
            shouldLongPress = selectionMode == TabsTrayState.Mode.Normal
        }
    }

    BoxWithConstraints {
        LazyVerticalGrid(
            columns = GridCells.Fixed(count = numberOfGridColumns),
            modifier = modifier
                .fillMaxSize()
                .detectGridPressAndDragGestures(
                    gridState = gridState,
                    reorderState = reorderState,
                    shouldLongPressToDrag = shouldLongPress,
                ),
            state = gridState,
            contentPadding = contentPadding,
            verticalArrangement = Arrangement.spacedBy(space = FirefoxTheme.layout.space.static200),
            horizontalArrangement = Arrangement.spacedBy(space = horizontalGridPadding),
        ) {
            header?.let {
                item(key = HEADER_ITEM_KEY, span = { GridItemSpan(maxLineSpan) }) {
                    header()
                }
            }

            itemsIndexed(
                items = tabs,
                key = { _, tab -> tab.id },
            ) { index, tab ->
                TabGridItemContent(
                    tabsTrayItem = tab,
                    index = index,
                    thumbnailSizePx = thumbnailSizePx,
                    hasHeader = header != null,
                    isInMultiSelectMode = isInMultiSelectMode,
                    isMultiSelected = selectionMode.contains(tab),
                    reorderState = reorderState,
                    gridState = gridState,
                    onTabClose = onTabClose,
                    onItemClick = onItemClick,
                    onDeleteTabGroup = onDeleteTabGroup,
                    editTabGroupClick = editTabGroupClick,
                )
            }

            item(key = SPAN_ITEM_KEY, span = { GridItemSpan(maxLineSpan) }) {
                Spacer(modifier = Modifier.height(tabGridBottomPadding))
            }
        }
    }
}

@Suppress("LongParameterList")
@Composable
private fun LazyGridItemScope.TabGridItemContent(
    tabsTrayItem: TabsTrayItem,
    index: Int,
    thumbnailSizePx: Int,
    hasHeader: Boolean,
    isInMultiSelectMode: Boolean,
    isMultiSelected: Boolean,
    reorderState: GridReorderState,
    gridState: LazyGridState,
    onTabClose: (TabsTrayItem.Tab) -> Unit,
    onItemClick: (TabsTrayItem) -> Unit,
    onDeleteTabGroup: (TabsTrayItem.TabGroup) -> Unit,
    editTabGroupClick: (TabsTrayItem.TabGroup) -> Unit,
) {
    val decayAnimationSpec: DecayAnimationSpec<Float> = rememberSplineBasedDecay()
    val density = LocalDensity.current
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val swipeState = remember(isInMultiSelectMode, !gridState.isScrollInProgress) {
        SwipeToDismissState2(
            density = density,
            enabled = !isInMultiSelectMode && !gridState.isScrollInProgress,
            decayAnimationSpec = decayAnimationSpec,
            isRtl = isRtl,
        )
    }
    val swipingActive by remember(swipeState.swipingActive) {
        mutableStateOf(swipeState.swipingActive)
    }

    DragItemContainer(
        state = reorderState,
        position = index + if (hasHeader) 1 else 0,
        key = tabsTrayItem.id,
        swipingActive = swipingActive,
    ) { interactionState ->
        val selectionState = TabsTrayItemSelectionState(
            isFocused = tabsTrayItem.isFocused,
            isSelected = isMultiSelected,
            multiSelectEnabled = isInMultiSelectMode,
        )
        when (tabsTrayItem) {
            is TabsTrayItem.Tab -> {
                TabGridTabItem(
                    tab = tabsTrayItem,
                    thumbnailSizePx = thumbnailSizePx,
                    selectionState = selectionState,
                    shouldClickListen = reorderState.draggingItemKey != tabsTrayItem.id,
                    swipeState = swipeState,
                    onCloseClick = onTabClose,
                    onClick = onItemClick,
                    interactionState = interactionState,
                )
            }

            is TabsTrayItem.TabGroup -> {
                TabGroupCard(
                    group = tabsTrayItem,
                    selectionState = selectionState,
                    clickHandler = TabsTrayItemClickHandler(onClick = onItemClick),
                    interactionState = interactionState,
                    onDeleteTabGroup = onDeleteTabGroup,
                    editTabGroupClick = { editTabGroupClick(tabsTrayItem) },
                )
            }
        }
    }
}

private val horizontalGridPadding: Dp
    @ReadOnlyComposable
    @Composable
    get() = FirefoxTheme.layout.space.static200

private val BoxWithConstraintsScope.thumbnailSizePx: Int
    @ReadOnlyComposable
    @Composable
    get() {
        val density = LocalDensity.current
        val totalSpacing = horizontalGridPadding * (numberOfGridColumns - 1) +
            FirefoxTheme.layout.space.static50 * numberOfGridColumns * 2
        val thumbnailWidth = constraints.maxWidth - with(density) { totalSpacing.roundToPx() }
        val thumbnailHeight = (thumbnailWidth / gridItemAspectRatio).toInt()
        return max(thumbnailWidth, thumbnailHeight)
    }

@Suppress("LongParameterList", "LongMethod", "CognitiveComplexMethod")
@Composable
private fun TabList(
    tabs: List<TabsTrayItem>,
    selectedItemIndex: Int,
    selectionMode: TabsTrayState.Mode,
    modifier: Modifier = Modifier,
    onTabClose: (TabsTrayItem.Tab) -> Unit,
    onItemClick: (TabsTrayItem) -> Unit,
    onItemLongClick: (TabsTrayItem) -> Unit,
    onMove: (String, String?, Boolean) -> Unit,
    header: (@Composable () -> Unit)? = null,
    onTabDragStart: () -> Unit = {},
) {
    val state = rememberLazyListState()
    val tabListBottomPadding = dimensionResource(id = R.dimen.tab_tray_list_bottom_padding)

    TabLayoutScrollHelper(
        state = state,
        selectedTabIndex = selectedItemIndex,
        bottomPadding = tabListBottomPadding,
        isHeaderPresent = header != null,
    )

    val isInMultiSelectMode = selectionMode is TabsTrayState.Mode.Select
    val reorderState = createListReorderState(
        listState = state,
        onMove = { initialTab, newTab ->
            onMove(
                (initialTab.key as String),
                (newTab.key as String),
                initialTab.index < newTab.index,
            )
        },
        onLongPress = { itemInfo ->
            tabs.firstOrNull { tabItem -> tabItem.id == itemInfo.key }?.let { tab ->
                onItemLongClick(tab)
            }
        },
        onExitLongPress = onTabDragStart,
        ignoredItems = listOf(HEADER_ITEM_KEY, SPAN_ITEM_KEY),
    )
    var shouldLongPress by remember { mutableStateOf(!isInMultiSelectMode) }
    LaunchedEffect(selectionMode, reorderState.draggingItemKey) {
        if (reorderState.draggingItemKey == null) {
            shouldLongPress = selectionMode == TabsTrayState.Mode.Normal
        }
    }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.TopCenter,
    ) {
        LazyColumn(
            modifier = modifier
                .width(FirefoxTheme.layout.size.containerMaxWidth)
                .padding(
                    start = TabListPadding,
                    end = TabListPadding,
                )
                .background(MaterialTheme.colorScheme.surface)
                .detectListPressAndDrag(
                    listState = state,
                    reorderState = reorderState,
                    shouldLongPressToDrag = shouldLongPress,
                ),
            state = state,
            contentPadding = PaddingValues(
                bottom = tabListBottomPadding,
            ),
        ) {
            header?.let {
                item(key = HEADER_ITEM_KEY) {
                    header()
                }
            }

            // As groups are not shown, this impacts the visible index of the tab being shown,
            // which is needed to know the correct shape
            // todo This logic should be updated when TabList is supported for groups
            val firstVisibleIndex = tabs.indexOfFirst { it is TabsTrayItem.Tab }
            val lastVisibleIndex = tabs.indexOfLast { it is TabsTrayItem.Tab }
            itemsIndexed(
                items = tabs,
                key = { _, tab -> tab.id },
            ) { index, tab ->
                when (tab) {
                    is TabsTrayItem.Tab -> {
                        DragItemContainer(
                            state = reorderState,
                            position = index + if (header != null) 1 else 0,
                            key = tab.id,
                        ) {
                            val tabShapeInfo = getTabShapeInfo(
                                firstVisibleIndex = firstVisibleIndex,
                                lastVisibleIndex = lastVisibleIndex,
                                itemIndex = index,
                                size = tabs.size,
                            )
                            TabListTabItem(
                                tab = tab,
                                modifier = Modifier
                                    .tabListItemShapeStyling(
                                        tabShapeInfo = tabShapeInfo,
                                        tab = tab,
                                    ),
                                selectionState = TabsTrayItemSelectionState(
                                    isFocused = tab.isFocused,
                                    multiSelectEnabled = isInMultiSelectMode,
                                    isSelected = selectionMode.contains(tab),
                                ),
                                shouldClickListen = reorderState.draggingItemKey != tab.id,
                                swipingEnabled = !state.isScrollInProgress,
                                onCloseClick = onTabClose,
                                onClick = onItemClick,
                            )
                        }
                    }

                    is TabsTrayItem.TabGroup -> {} // unsupported
                }

                if (index != tabs.size - 1) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
    }
}

/**
 * Returns the number of grid columns we can fit on the screen in the tabs tray.
 */
private val numberOfGridColumns: Int
    @Composable
    @ReadOnlyComposable
    get() {
        val configuration = LocalConfiguration.current
        val screenWidthDp = with(LocalDensity.current) {
            LocalWindowInfo.current.containerSize.width.toDp().value
        }

        return if (configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) {
            numberOfGridColumnsLandscape(screenWidthDp = screenWidthDp)
        } else {
            numberOfGridColumnsPortrait(screenWidthDp = screenWidthDp)
        }
    }

private fun numberOfGridColumnsPortrait(screenWidthDp: Float): Int = when {
    screenWidthDp >= TAB_GRID_PORTRAIT_WIDTH_THRESHOLD_3 -> NUM_COLUMNS_TAB_GRID_PORTRAIT_THRESHOLD_3
    screenWidthDp >= TAB_GRID_PORTRAIT_WIDTH_THRESHOLD_2 -> NUM_COLUMNS_TAB_GRID_PORTRAIT_THRESHOLD_2
    screenWidthDp >= TAB_GRID_PORTRAIT_WIDTH_THRESHOLD_1 -> NUM_COLUMNS_TAB_GRID_PORTRAIT_THRESHOLD_1
    else -> NUM_COLUMNS_TAB_GRID_PORTRAIT_THRESHOLD_1
}

private fun numberOfGridColumnsLandscape(screenWidthDp: Float): Int = when {
    screenWidthDp >= TAB_GRID_LANDSCAPE_WIDTH_THRESHOLD_2 -> NUM_COLUMNS_TAB_GRID_LANDSCAPE_THRESHOLD_2
    screenWidthDp >= TAB_GRID_LANDSCAPE_WIDTH_THRESHOLD_1 -> NUM_COLUMNS_TAB_GRID_LANDSCAPE_THRESHOLD_1
    else -> NUM_COLUMNS_TAB_GRID_LANDSCAPE_THRESHOLD_1
}

private data class TabLayoutPreviewModel(
    val tabCount: Int = 10,
    val selectedTabIndex: Int = 0,
    val tabGroupIndices: List<Int> = emptyList(),
)

private val tabLayoutPreviewData: List<Pair<String, TabLayoutPreviewModel>> = listOf(
    Pair(
        "50 Tabs, 25th selected",
        TabLayoutPreviewModel(
            tabCount = 50,
            selectedTabIndex = 25,
        ),
    ),
    Pair(
        "10 Tabs, first selected",
        TabLayoutPreviewModel(tabCount = 10, selectedTabIndex = 0),
    ),
    Pair(
        "10 Tabs, last selected",
        TabLayoutPreviewModel(tabCount = 10, selectedTabIndex = 9),
    ),
    Pair(
        "10 Groups, 1st selected",
        TabLayoutPreviewModel(tabCount = 10, tabGroupIndices = (0..9).toList(), selectedTabIndex = 0),
    ),
    Pair(
        "10 Tabs, 3 groups, 2nd selected",
        TabLayoutPreviewModel(tabCount = 10, tabGroupIndices = listOf(3, 6, 9), selectedTabIndex = 1),
    ),
    Pair(
        "Single, selected tab",
        TabLayoutPreviewModel(tabCount = 1),
    ),
    Pair(
        "Single, selected group",
        TabLayoutPreviewModel(tabCount = 1, tabGroupIndices = listOf(0)),
    ),
)

private class TabLayoutPreviewParameterProvider : ThemedValueProvider<TabLayoutPreviewModel>(
    baseValues = tabLayoutPreviewData.map { it.second }.asSequence(),
    getDisplayName = { index, _ -> tabLayoutPreviewData[index].first },
)

@FlexibleWindowPreview
@Composable
private fun TabListPreview(
    @PreviewParameter(TabLayoutPreviewParameterProvider::class) previewModel: ThemedValue<TabLayoutPreviewModel>,
) {
    val tabs = remember {
        generateFakeTabsList(
            tabCount = previewModel.value.tabCount,
            tabGroupIndices = previewModel.value.tabGroupIndices,
        ).toMutableStateList()
    }

    FirefoxTheme(theme = previewModel.theme) {
        Box(modifier = Modifier.background(MaterialTheme.colorScheme.surface)) {
            TabLayout(
                tabs = tabs,
                selectedItemIndex = previewModel.value.selectedTabIndex,
                selectionMode = TabsTrayState.Mode.Normal,
                displayTabsInGrid = false,
                onTabClose = tabs::remove,
                onItemClick = {},
                onItemLongClick = {},
                onTabDragStart = {},
                onDeleteTabGroup = {},
                onMove = { _, _, _ -> },
                editTabGroupClick = {},
            )
        }
    }
}

@FlexibleWindowPreview
@Composable
private fun TabGridPreview(
    @PreviewParameter(TabLayoutPreviewParameterProvider::class) previewModel: ThemedValue<TabLayoutPreviewModel>,
) {
    val tabs = remember {
        generateFakeTabsList(
            tabCount = previewModel.value.tabCount,
            tabGroupIndices = previewModel.value.tabGroupIndices,
        ).toMutableStateList()
    }

    FirefoxTheme(theme = previewModel.theme) {
        TabLayout(
            tabs = tabs,
            selectionMode = TabsTrayState.Mode.Normal,
            selectedItemIndex = previewModel.value.selectedTabIndex,
            modifier = Modifier.background(MaterialTheme.colorScheme.surface),
            displayTabsInGrid = true,
            onTabClose = tabs::remove,
            onItemClick = {},
            onItemLongClick = {},
            onTabDragStart = {},
            onDeleteTabGroup = {},
            onMove = { _, _, _ -> },
            editTabGroupClick = {},
        )
    }
}

private const val SELECTED_TAB_COUNT_PREVIEW = 4

@Preview
@Composable
private fun TabGridMultiSelectPreview(
    @PreviewParameter(TabLayoutPreviewParameterProvider::class) previewModel: ThemedValue<TabLayoutPreviewModel>,
) {
    MultiSelectPreview(
        previewModel = previewModel,
        displayTabsInGrid = true,
    )
}

@Preview
@Composable
private fun TabListMultiSelectPreview(
    @PreviewParameter(TabLayoutPreviewParameterProvider::class) previewModel: ThemedValue<TabLayoutPreviewModel>,
) {
    MultiSelectPreview(
        previewModel = previewModel,
        displayTabsInGrid = false,
    )
}

@Composable
private fun MultiSelectPreview(
    previewModel: ThemedValue<TabLayoutPreviewModel>,
    displayTabsInGrid: Boolean,
) {
    val tabs = generateFakeTabsList(
        tabCount = previewModel.value.tabCount,
        tabGroupIndices = previewModel.value.tabGroupIndices,
    )
    val selectedTabs = remember {
        tabs.take(SELECTED_TAB_COUNT_PREVIEW).filterIsInstance<TabsTrayItem.Tab>().toMutableStateList()
    }
    val selectedTabGroups = remember {
        tabs.take(SELECTED_TAB_COUNT_PREVIEW).filterIsInstance<TabsTrayItem.TabGroup>().toMutableStateList()
    }

    FirefoxTheme(theme = previewModel.theme) {
        TabLayout(
            tabs = tabs,
            selectedItemIndex = previewModel.value.selectedTabIndex,
            selectionMode = TabsTrayState.Mode.Select(
                selectedTabs = selectedTabs.toSet(),
                selectedTabGroups = selectedTabGroups.toSet(),
            ),
            modifier = Modifier.background(MaterialTheme.colorScheme.surface),
            displayTabsInGrid = displayTabsInGrid,
            onTabClose = {},
            onItemClick = { tab ->
                when (tab) {
                    is TabsTrayItem.Tab -> if (selectedTabs.contains(tab)) {
                        selectedTabs.remove(tab)
                    } else {
                        selectedTabs.add(tab)
                    }
                    is TabsTrayItem.TabGroup -> if (selectedTabGroups.contains(tab)) {
                        selectedTabGroups.remove(tab)
                    } else {
                        selectedTabGroups.add(tab)
                    }
                }
            },
            onItemLongClick = {},
            onTabDragStart = {},
            onDeleteTabGroup = {},
            onMove = { _, _, _ -> },
            editTabGroupClick = {},
        )
    }
}

private fun generateFakeTabsList(
    tabCount: Int = 10,
    isPrivate: Boolean = false,
    tabGroupIndices: List<Int> = emptyList(),
): List<TabsTrayItem> {
    return List(tabCount) { index ->
        if (index in tabGroupIndices) {
            createTabGroup(
                title = "Group $index",
                theme = TabGroupTheme.Pink,
                tabs = mutableListOf(
                    createTab(
                        id = "groupTab1",
                        url = "www.mozilla.com",
                        private = isPrivate,
                    ),
                    createTab(
                        id = "groupTab2",
                        url = "www.mozilla.com",
                        private = isPrivate,
                    ),
                    createTab(
                        id = "groupTab3",
                        url = "www.mozilla.com",
                        private = isPrivate,
                    ),
                    createTab(
                        id = "groupTab4",
                        url = "www.mozilla.com",
                        private = isPrivate,
                    ),
                ),
            )
        } else {
            createTab(
                id = "tabId$index-$isPrivate",
                url = "www.mozilla.com",
                private = isPrivate,
            )
        }
    }
}

/**
 * Data class to store a TabList's item shape information.
 * @property borderShape: The [RoundedCornerShape] representing the item's border
 * @property clipTabToFit: Whether the TabItem will be clipped to fit the border shape
 */
private data class TabListShapeInfo(
    val borderShape: RoundedCornerShape,
    val clipTabToFit: Boolean,
)

private fun getTabShapeInfo(
    firstVisibleIndex: Int,
    lastVisibleIndex: Int,
    itemIndex: Int,
    size: Int,
): TabListShapeInfo {
    return when {
        size == 1 -> TabListShapeInfo(TabListSingleItemShape, true)
        firstVisibleIndex == itemIndex -> TabListShapeInfo(TabListFirstItemShape, true)
        lastVisibleIndex == itemIndex -> TabListShapeInfo(TabListLastItemShape, true)
        else -> TabListShapeInfo(TabListBorderMiddleItemShape, false)
    }
}

/**
 * The default horizontal content padding used by TabLayout.
 * In some cases, such as when a tab layout is embedded inside another view,
 * we may wish to override this content padding.
 */
@Composable
@ReadOnlyComposable
private fun defaultTabLayoutContentPadding(): PaddingValues = PaddingValues(
    horizontal = if (LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE) {
        52.dp
    } else {
        FirefoxTheme.layout.space.static200
    },
    vertical = 24.dp,
)

@Composable
private fun Modifier.tabListItemShapeStyling(
    tabShapeInfo: TabListShapeInfo,
    tab: TabsTrayItem,
): Modifier {
    return this
        .thenConditional(
            Modifier.clip(tabShapeInfo.borderShape),
            { tabShapeInfo.clipTabToFit },
        )
        .thenConditional(
            modifier = Modifier.border(
                border = tabItemBorderFocused(),
                shape = tabShapeInfo.borderShape,
            ),
            { tab.isFocused },
        )
}
