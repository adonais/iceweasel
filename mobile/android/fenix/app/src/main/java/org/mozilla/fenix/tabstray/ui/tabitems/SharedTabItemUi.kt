/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.tabitems

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Indication
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.RadioCheckmark
import mozilla.components.compose.base.RadioCheckmarkColors
import mozilla.components.compose.base.menu.DropdownMenu
import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.text.Text
import mozilla.components.support.utils.ext.isLandscape
import mozilla.components.ui.colors.PhotonColors
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.browser.compose.TabItemInteractionState
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import mozilla.components.ui.icons.R as iconsR

// Rounded corner shape used by all tab items
val TabContentCardShape = RoundedCornerShape(16.dp)

// The corner radius of a tab card's top outer edge
val TAB_CARD_TOP_CORNER_RADIUS = 4.dp

// The corner radius of a tab card's bottom outer edge
val TAB_CARD_BOTTOM_CORNER_RADIUS = 12.dp

// Rounded shape used for tab thumbnails
val ThumbnailShape = RoundedCornerShape(
    topStart = TAB_CARD_TOP_CORNER_RADIUS,
    topEnd = TAB_CARD_TOP_CORNER_RADIUS,
    bottomStart = TAB_CARD_BOTTOM_CORNER_RADIUS,
    bottomEnd = TAB_CARD_BOTTOM_CORNER_RADIUS,
)

// The touch target size of a tab's header icon
val TabHeaderIconTouchTargetSize = 40.dp

//region placeholder strings
private const val PLACEHOLDER_EDIT = "Edit"
private const val PLACEHOLDER_CLOSE = "Close"
private const val PLACEHOLDER_DELETE = "Delete"
private const val PLACEHOLDER_THREE_DOT_MENU_CONTENT_DESCRIPTION = "More options"
//endregion

/**
 * @param isSelected: Whether the tab is selected in multiselect mode
 * @param uncheckedBorderColor: The border color to display when the item is unchecked
 */
@Composable
fun MultiSelectTabButton(
    isSelected: Boolean,
    uncheckedBorderColor: Color = RadioCheckmarkColors.default().borderColor,
) {
    Box(
        modifier = Modifier.size(TabHeaderIconTouchTargetSize),
        contentAlignment = Alignment.Center,
    ) {
        RadioCheckmark(
            isSelected = isSelected,
            colors = RadioCheckmarkColors.default(borderColor = uncheckedBorderColor),
        )
    }
}

/**
 * The clickable modifier for tab items.
 * @param clickHandler: ClickHandler object that responds to click events
 * @param clickedItem: The generic TabTray item that is being interacted with
 */
@Composable
fun Modifier.tabItemClickable(
    clickHandler: TabsTrayItemClickHandler,
    clickedItem: TabsTrayItem,
): Modifier = composed {
    val interactionSource = remember { MutableInteractionSource() }

    if (clickHandler.onLongClick == null) {
        Modifier.clickable(
            enabled = clickHandler.enabled,
            interactionSource = interactionSource,
            indication = clickRipple,
            onClick = { clickHandler.onClick(clickedItem) },
        )
    } else {
        Modifier.combinedClickable(
            enabled = clickHandler.enabled,
            interactionSource = interactionSource,
            indication = clickRipple,
            onLongClick = { clickHandler.onLongClick(clickedItem) },
            onClick = { clickHandler.onClick(clickedItem) },
        )
    }
}

private val clickRipple: Indication
    @Composable get() = ripple(
        color = when (isSystemInDarkTheme()) {
            true -> PhotonColors.White
            false -> PhotonColors.Black
        },
    )

/**
 * The width to height ratio of the tab grid item. In landscape mode, the width to height ratio is
 * 1:1 and in portrait mode, the width to height ratio is 4:5.
 */
val gridItemAspectRatio: Float
    @Composable
    @ReadOnlyComposable
    get() = if (LocalContext.current.isLandscape()) {
        1f
    } else {
        0.8f
    }

/**
 * Renders the three dot button and its menu items for [org.mozilla.fenix.tabstray.data.TabsTrayItem.TabGroup] views.
 * @param modifier: The Modifier parameter
 * @param includeCloseOption: Whether to include the "Close" dropdown item in the menu item list.
 * @param onDeleteTabGroup Invoked when the user clicks on delete tab group.
 * @param editTabGroupClick Invoked when the user clicks to edit the selected tab group.
 */
@Composable
fun TabGroupMenuButton(
    modifier: Modifier = Modifier,
    includeCloseOption: Boolean = false,
    onDeleteTabGroup: () -> Unit,
    editTabGroupClick: () -> Unit,
) {
    var showDropdownMenu by remember { mutableStateOf(false) }
    IconButton(
        onClick = {
            showDropdownMenu = true
        },
        modifier = modifier
            .testTag(TabsTrayTestTag.TAB_GROUP_THREE_DOT_BUTTON),
        colors = IconButtonDefaults.iconButtonColors(
            contentColor = LocalContentColor.current,
        ),
    ) {
        Icon(
            painter = painterResource(id = iconsR.drawable.mozac_ic_ellipsis_vertical_24),
            contentDescription = PLACEHOLDER_THREE_DOT_MENU_CONTENT_DESCRIPTION,
        )

        DropdownMenu(
            expanded = showDropdownMenu,
            onDismissRequest = { showDropdownMenu = false },
            menuItems = generateTabGroupMenuItems(
                editTabGroup = editTabGroupClick,
                closeTabGroup = {}, // handle close
                deleteTabGroup = onDeleteTabGroup,
                includeCloseOption = includeCloseOption,
            ),
        )
    }
}

private fun generateTabGroupMenuItems(
    includeCloseOption: Boolean = false,
    editTabGroup: () -> Unit,
    closeTabGroup: () -> Unit,
    deleteTabGroup: () -> Unit,
): List<MenuItem> {
    val editItem = MenuItem.IconItem(
        text = Text.String(PLACEHOLDER_EDIT),
        drawableRes = iconsR.drawable.mozac_ic_edit_24,
        testTag = TabsTrayTestTag.EDIT_TAB_GROUP,
        onClick = editTabGroup,
        enabled = true,
    )
    val closeItem = MenuItem.IconItem(
        text = Text.String(PLACEHOLDER_CLOSE),
        drawableRes = iconsR.drawable.mozac_ic_tab_group_close_24,
        testTag = TabsTrayTestTag.CLOSE_TAB_GROUP,
        onClick = closeTabGroup,
        enabled = false,
    )
    val deleteItem = MenuItem.IconItem(
        text = Text.String(PLACEHOLDER_DELETE),
        drawableRes = iconsR.drawable.mozac_ic_delete_24,
        testTag = TabsTrayTestTag.DELETE_TAB_GROUP,
        onClick = deleteTabGroup,
        level = MenuItem.FixedItem.Level.Critical,
        enabled = true,
    )
    return if (includeCloseOption) {
        listOf(editItem, closeItem, deleteItem)
    } else {
        listOf(editItem, deleteItem)
    }
}

// Long text string for verifying that tab items handle long titles with appropriate truncation.
const val LOREM_IPSUM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do " +
    "eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis " +
    "nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute " +
    "irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla " +
    "pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia " +
    "deserunt mollit anim id est laborum."

/**
 * Renders a border around a [TabsTrayItem] to signify that it is in focus.
 * When the tab is not in focus, its BorderStroke will be null.
 */
@Composable
@ReadOnlyComposable
fun tabItemConditionalBorder(selectionState: TabsTrayItemSelectionState): BorderStroke? {
    return if (selectionState.isFocused) {
        tabItemBorderFocused()
    } else {
        null
    }
}

/**
 * Renders a border around a [TabsTrayItem] to signify that it is in focus.
 */
@Composable
@ReadOnlyComposable
fun tabItemBorderFocused(): BorderStroke {
    return BorderStroke(width = 4.dp, color = MaterialTheme.colorScheme.tertiary)
}

/**
 * Animates the tab item's alpha value to be slightly transparent when it is dragged.
 */
@Composable
private fun tabItemAnimatedAlpha(interactionState: TabItemInteractionState): State<Float> {
    return animateFloatAsState(
        targetValue = if (interactionState.isDragged) { 0.7f } else { 1f },
    )
}

/**
 * Animates the tab item's size to be slightly reduced when it is dragged.
 */
@Composable
private fun tabItemAnimatedScale(interactionState: TabItemInteractionState): State<Float> {
    return animateFloatAsState(
        targetValue = if (interactionState.isDragged) 0.75f else 1f,
    )
}

/**
 * Renders an animated scale and alpha transition for the tab item based on its interaction state.
 * This happens at the graphics layer to avoid recomposition of the item.
 * The semantics properties are provided so that the state can be evaluated, as evaluating the composable will not
 * return the correct result, since these graphical animations occur at draw time.
 */
@Composable
fun Modifier.tabItemInteractionAnimation(interactionState: TabItemInteractionState): Modifier {
    val tabItemAlpha: Float by tabItemAnimatedAlpha(interactionState)
    val tabItemScale: Float by tabItemAnimatedScale(interactionState)
    return this
        .graphicsLayer(alpha = tabItemAlpha, scaleX = tabItemScale, scaleY = tabItemScale)
        .semantics {
            scale = tabItemScale
            alpha = tabItemAlpha
        }
}

/**
 * Semantic property for accessing a Composable item's current graphical scale property.
 * This is intended to be applied evenly across X and Y and set and fetched as needed for verification.
 */
internal val ScaleKey = SemanticsPropertyKey<Float>("Scale")
internal var SemanticsPropertyReceiver.scale by ScaleKey

/**
 * Semantic property for accessing a Composable item's alpha property.
 * This is intended to be set and fetched as needed for verification.
 */
internal val AlphaKey = SemanticsPropertyKey<Float>("Alpha")
internal var SemanticsPropertyReceiver.alpha by AlphaKey
