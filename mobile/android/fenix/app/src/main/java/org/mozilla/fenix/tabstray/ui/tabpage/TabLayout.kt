/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.tabpage

import androidx.compose.animation.core.DecayAnimationSpec
import androidx.compose.animation.rememberSplineBasedDecay
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
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
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.dimensionResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import mozilla.components.browser.state.state.ContentState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.modifier.thenConditional
import mozilla.components.support.utils.ext.isLandscape
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.SwipeToDismissState2
import org.mozilla.fenix.tabstray.TabsTrayState
import org.mozilla.fenix.tabstray.browser.compose.DragItemContainer
import org.mozilla.fenix.tabstray.browser.compose.createGridReorderState
import org.mozilla.fenix.tabstray.browser.compose.createListReorderState
import org.mozilla.fenix.tabstray.browser.compose.detectGridPressAndDragGestures
import org.mozilla.fenix.tabstray.browser.compose.detectListPressAndDrag
import org.mozilla.fenix.tabstray.ui.tabitems.TabGridItem
import org.mozilla.fenix.tabstray.ui.tabitems.TabListItem
import org.mozilla.fenix.theme.FirefoxTheme

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

private const val NUM_COLUMNS_TAB_GRID_LANDSCAPE_THRESHOLD_1 = 3
private const val NUM_COLUMNS_TAB_GRID_LANDSCAPE_THRESHOLD_2 = 4

/**
 * Top-level UI for displaying a list of tabs.
 *
 * @param tabs The list of [TabSessionState] to display.
 * @param displayTabsInGrid Whether the tabs should be displayed in a grid.
 * @param selectedTabId The ID of the currently selected tab.
 * @param selectionMode [TabsTrayState.Mode] indicating whether the Tabs Tray is in single selection
 * or multi-selection and contains the set of selected tabs.
 * @param modifier [Modifier] to be applied to the layout.
 * @param onTabClose Invoked when the user clicks to close a tab.
 * @param onTabClick Invoked when the user clicks on a tab.
 * @param onTabLongClick Invoked when the user long clicks a tab.
 * @param onMove Invoked when the user moves a tab.
 * @param onTabDragStart Invoked when starting to drag a tab.
 * @param header Optional layout to display before [tabs].
 */
@Suppress("LongParameterList")
@Composable
fun TabLayout(
    tabs: List<TabSessionState>,
    displayTabsInGrid: Boolean,
    selectedTabId: String?,
    selectionMode: TabsTrayState.Mode,
    modifier: Modifier = Modifier,
    onTabClose: (TabSessionState) -> Unit,
    onTabClick: (TabSessionState) -> Unit,
    onTabLongClick: (TabSessionState) -> Unit,
    onMove: (String, String?, Boolean) -> Unit,
    onTabDragStart: () -> Unit,
    header: (@Composable () -> Unit)? = null,
) {
    var selectedTabIndex = 0
    selectedTabId?.let {
        tabs.forEachIndexed { index, tab ->
            if (tab.id == selectedTabId) {
                selectedTabIndex = index
                return@forEachIndexed
            }
        }
    }

    if (displayTabsInGrid) {
        TabGrid(
            tabs = tabs,
            selectedTabId = selectedTabId,
            selectedTabIndex = selectedTabIndex,
            selectionMode = selectionMode,
            modifier = modifier,
            onTabClose = onTabClose,
            onTabClick = onTabClick,
            onTabLongClick = onTabLongClick,
            onMove = onMove,
            onTabDragStart = onTabDragStart,
            header = header,
        )
    } else {
        TabList(
            tabs = tabs,
            selectedTabId = selectedTabId,
            selectedTabIndex = selectedTabIndex,
            selectionMode = selectionMode,
            modifier = modifier,
            onTabClose = onTabClose,
            onTabClick = onTabClick,
            onTabLongClick = onTabLongClick,
            onMove = onMove,
            onTabDragStart = onTabDragStart,
            header = header,
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Suppress("LongParameterList", "LongMethod")
@Composable
private fun TabGrid(
    tabs: List<TabSessionState>,
    selectedTabId: String?,
    selectedTabIndex: Int,
    selectionMode: TabsTrayState.Mode,
    modifier: Modifier = Modifier,
    onTabClose: (TabSessionState) -> Unit,
    onTabClick: (TabSessionState) -> Unit,
    onTabLongClick: (TabSessionState) -> Unit,
    onMove: (String, String?, Boolean) -> Unit,
    onTabDragStart: () -> Unit,
    header: (@Composable () -> Unit)? = null,
) {
    val state = rememberLazyGridState(initialFirstVisibleItemIndex = selectedTabIndex)
    val tabListBottomPadding = dimensionResource(id = R.dimen.tab_tray_list_bottom_padding)
    val isInMultiSelectMode = selectionMode is TabsTrayState.Mode.Select

    val reorderState = createGridReorderState(
        gridState = state,
        onMove = { initialTab, newTab ->
            onMove(
                (initialTab.key as String),
                (newTab.key as String),
                initialTab.index < newTab.index,
            )
        },
        onLongPress = { itemInfo ->
            tabs.firstOrNull { tab -> tab.id == itemInfo.key }?.let { tab ->
                onTabLongClick(tab)
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

    LazyVerticalGrid(
        columns = GridCells.Fixed(count = numberOfGridColumns),
        modifier = modifier
            .fillMaxSize()
            .detectGridPressAndDragGestures(
                gridState = state,
                reorderState = reorderState,
                shouldLongPressToDrag = shouldLongPress,
            ),
        state = state,
        contentPadding = PaddingValues(
            horizontal = if (LocalContext.current.isLandscape()) {
                52.dp
            } else {
                FirefoxTheme.layout.space.static200
            },
            vertical = 24.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(space = FirefoxTheme.layout.space.static200),
        horizontalArrangement = Arrangement.spacedBy(space = FirefoxTheme.layout.space.static200),
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
            val decayAnimationSpec: DecayAnimationSpec<Float> = rememberSplineBasedDecay()
            val density = LocalDensity.current
            val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
            val swipeState = remember(isInMultiSelectMode, !state.isScrollInProgress) {
                SwipeToDismissState2(
                    density = density,
                    enabled = !isInMultiSelectMode && !state.isScrollInProgress,
                    decayAnimationSpec = decayAnimationSpec,
                    isRtl = isRtl,
                )
            }
            val swipingActive by remember(swipeState.swipingActive) {
                mutableStateOf(swipeState.swipingActive)
            }

            DragItemContainer(
                state = reorderState,
                position = index + if (header != null) 1 else 0,
                key = tab.id,
                swipingActive = swipingActive,
            ) {
                TabGridItem(
                    tab = tab,
                    isSelected = tab.id == selectedTabId,
                    multiSelectionEnabled = isInMultiSelectMode,
                    multiSelectionSelected = selectionMode.selectedTabs.any { it.id == tab.id },
                    shouldClickListen = reorderState.draggingItemKey != tab.id,
                    swipeState = swipeState,
                    onCloseClick = onTabClose,
                    onClick = onTabClick,
                )
            }
        }

        item(key = SPAN_ITEM_KEY, span = { GridItemSpan(maxLineSpan) }) {
            Spacer(modifier = Modifier.height(tabListBottomPadding))
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Suppress("LongParameterList", "LongMethod")
@Composable
private fun TabList(
    tabs: List<TabSessionState>,
    selectedTabId: String?,
    selectedTabIndex: Int,
    selectionMode: TabsTrayState.Mode,
    modifier: Modifier = Modifier,
    onTabClose: (TabSessionState) -> Unit,
    onTabClick: (TabSessionState) -> Unit,
    onTabLongClick: (TabSessionState) -> Unit,
    onMove: (String, String?, Boolean) -> Unit,
    header: (@Composable () -> Unit)? = null,
    onTabDragStart: () -> Unit = {},
) {
    val state = rememberLazyListState(initialFirstVisibleItemIndex = selectedTabIndex)
    val tabListBottomPadding = dimensionResource(id = R.dimen.tab_tray_list_bottom_padding)
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
        onLongPress = {
            tabs.firstOrNull { tab -> tab.id == it.key }?.let { tab ->
                onTabLongClick(tab)
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
                .detectListPressAndDrag(
                    listState = state,
                    reorderState = reorderState,
                    shouldLongPressToDrag = shouldLongPress,
                )
                .padding(all = 16.dp)
                .padding(bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 24.dp),
        state = state,
        contentPadding = PaddingValues(bottom = tabListBottomPadding),
        ) {
            header?.let {
                item(key = HEADER_ITEM_KEY) {
                    header()
                }
            }

            itemsIndexed(
                items = tabs,
                key = { _, tab -> tab.id },
            ) { index, tab ->
                DragItemContainer(
                    state = reorderState,
                    position = index + if (header != null) 1 else 0,
                    key = tab.id,
                ) {
                    TabListItem(
                        tab = tab,
                        modifier = Modifier
                            .thenConditional(
                                // Add top rounded corners to the first item
                                modifier = Modifier.clip(
                                    RoundedCornerShape(
                                        topStart = 12.dp,
                                        topEnd = 12.dp,
                                    ),
                                ),
                                predicate = { index == 0 },
                            )
                            .thenConditional(
                                // Add bottom rounded corners to the final item
                                modifier = Modifier.clip(
                                    RoundedCornerShape(
                                        bottomStart = 12.dp,
                                        bottomEnd = 12.dp,
                                    ),
                                ),
                                predicate = { index == tabs.size - 1 },
                            ),
                        isSelected = tab.id == selectedTabId,
                        multiSelectionEnabled = isInMultiSelectMode,
                        multiSelectionSelected = selectionMode.selectedTabs.any { it.id == tab.id },
                        shouldClickListen = reorderState.draggingItemKey != tab.id,
                        swipingEnabled = !state.isScrollInProgress,
                        onCloseClick = onTabClose,
                        onClick = onTabClick,
                    )
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
        val context = LocalContext.current
        val displayMetrics = context.resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density

        return if (context.isLandscape()) {
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

@PreviewLightDark
@Composable
private fun TabListPreview() {
    val tabs = remember { generateFakeTabsList().toMutableStateList() }

    FirefoxTheme {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(FirefoxTheme.colors.layer1),
        ) {
            TabLayout(
                tabs = tabs,
                selectedTabId = tabs[1].id,
                selectionMode = TabsTrayState.Mode.Normal,
                displayTabsInGrid = false,
                onTabClose = tabs::remove,
                onTabClick = {},
                onTabLongClick = {},
                onTabDragStart = {},
                onMove = { _, _, _ -> },
            )
        }
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun TabGridPreview() {
    val tabs = remember { generateFakeTabsList().toMutableStateList() }

    FirefoxTheme {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(FirefoxTheme.colors.layer1),
        ) {
            TabLayout(
                tabs = tabs,
                selectedTabId = tabs[0].id,
                selectionMode = TabsTrayState.Mode.Normal,
                displayTabsInGrid = true,
                onTabClose = tabs::remove,
                onTabClick = {},
                onTabLongClick = {},
                onTabDragStart = {},
                onMove = { _, _, _ -> },
            )
        }
    }
}

@Suppress("MagicNumber")
@PreviewLightDark
@Composable
private fun TabGridMultiSelectPreview() {
    val tabs = generateFakeTabsList()
    val selectedTabs = remember { tabs.take(4).toMutableStateList() }

    FirefoxTheme {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(FirefoxTheme.colors.layer1),
        ) {
            TabLayout(
                tabs = tabs,
                selectedTabId = tabs[0].id,
                selectionMode = TabsTrayState.Mode.Select(selectedTabs.toSet()),
                displayTabsInGrid = false,
                onTabClose = {},
                onTabClick = { tab ->
                    if (selectedTabs.contains(tab)) {
                        selectedTabs.remove(tab)
                    } else {
                        selectedTabs.add(tab)
                    }
                },
                onTabLongClick = {},
                onTabDragStart = {},
                onMove = { _, _, _ -> },
            )
        }
    }
}

private fun generateFakeTabsList(
    tabCount: Int = 10,
    isPrivate: Boolean = false,
): List<TabSessionState> =
    List(tabCount) { index ->
        TabSessionState(
            id = "tabId$index-$isPrivate",
            content = ContentState(
                url = "www.mozilla.com",
                private = isPrivate,
            ),
        )
    }
