/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.tabitems

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.RadioCheckmark
import mozilla.components.compose.base.RadioCheckmarkColors
import mozilla.components.compose.base.menu.DropdownMenu
import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.text.Text
import mozilla.components.support.utils.ext.isLandscape
import mozilla.components.ui.colors.PhotonColors
import org.mozilla.fenix.R
import org.mozilla.fenix.tabstray.TabsTrayTestTag
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
 * @param isActive: Whether the tab is the active tab, or single-selected
 * @param activeColors: The coloring of the RadioCheckmark in the active state.  Note that
 * this param will probably be unnecessary once TabGridItem and TabGroupItem are aligned on
 * the active (outlined) state representation.
 * @param uncheckedBorderColor: The border color to display when the item is unchecked
 */
@Composable
fun MultiSelectTabButton(
    isSelected: Boolean,
    isActive: Boolean,
    activeColors: RadioCheckmarkColors,
    uncheckedBorderColor: Color = RadioCheckmarkColors.default().borderColor,
) {
    Box(
        modifier = Modifier.size(TabHeaderIconTouchTargetSize),
        contentAlignment = Alignment.Center,
    ) {
        RadioCheckmark(
            isSelected = isSelected,
            // Note - when active state switches to use a border rather than a color change,
            // this UI will look the same for TabGroupCard and TabGridItem.  In the interim,
            // handling this difference by passing in the active color set
            colors = if (isActive) {
                activeColors
            } else {
                RadioCheckmarkColors.default(borderColor = uncheckedBorderColor)
            },
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
 * 2:1 and in portrait mode, the width to height ratio is 4:5.
 */
val gridItemAspectRatio: Float
    @Composable
    @ReadOnlyComposable
    get() = if (LocalContext.current.isLandscape()) {
        2f
    } else {
        0.8f
    }

/**
 * Renders the three dot button and its menu items for [org.mozilla.fenix.tabstray.data.TabsTrayItem.TabGroup] views.
 * @param modifier: The Modifier parameter
 * @param includeCloseOption: Whether to include the "Close" dropdown item in the menu item list.
 */
@Composable
fun TabGroupMenuButton(
    modifier: Modifier = Modifier,
    includeCloseOption: Boolean = false,
) {
    var showDropdownMenu by remember { mutableStateOf(false) }
    IconButton(
        onClick = {
            showDropdownMenu = true
        },
        modifier = modifier
            .testTag(TabsTrayTestTag.TAB_GROUP_THREE_DOT_BUTTON),
    ) {
        Icon(
            painter = painterResource(id = R.drawable.ic_menu),
            contentDescription = PLACEHOLDER_THREE_DOT_MENU_CONTENT_DESCRIPTION,
            tint = MaterialTheme.colorScheme.onSurface,
        )

        DropdownMenu(
            expanded = showDropdownMenu,
            onDismissRequest = { showDropdownMenu = false },
            menuItems = generateTabGroupMenuItems(
                editTabGroup = {}, // handle edit
                closeTabGroup = {}, // handle close
                deleteTabGroup = {}, // handle delete
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
        enabled = false,
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
        enabled = false,
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
