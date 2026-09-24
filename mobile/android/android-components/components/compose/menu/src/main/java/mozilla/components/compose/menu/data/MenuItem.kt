/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.data

import androidx.annotation.DrawableRes
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.Role.Companion.Button
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.store.MenuEvent
import mozilla.components.compose.menu.ui.MenuItemIcon
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.compose.menu.ui.MenuItemState.DEFAULT

/** Parent of all items that can be shown in a menu. */
sealed class MenuItem {
    abstract val title: Text
    abstract val contentDescription: Text
    abstract val onClickEvent: MenuEvent
    abstract val role: Role
    abstract val summary: MenuItemSummary?
    abstract val icon: MenuItemIcon?
    abstract val showNewIndicator: Boolean
    abstract val badge: MenuItemBadge?
    abstract val state: MenuItemState
    abstract val onLongClickEvent: MenuEvent?
}

/**
 * Configuration of menu item that can be expanded to show others or collapsed to hide them.
 *
 * @param title The title of the menu item.
 * @param contentDescription The content description of the menu item.
 * @param onClickEvent [MenuEvent] to dispatch when the menu item is clicked as a side effect. Clicking this menu item
 *   will automatically expand or collapse its [subMenuItems]
 * @param subMenuItems List of [StandardMenuItem] to show when this item is expanded.
 * @param hideOnExpand Whether to automatically hide the menu item when it is expanded so that only its [subMenuItems]
 *   will remain displayed. This also means that once expanded the list of [subMenuItems] cannot be collapsed again.
 * @param role The [Role] of the menu item.
 * @param summary An optional summary of the menu item.
 * @param icon An optional icon of the menu item.
 * @param showNewIndicator Whether to show a new indicator.
 * @param badge An optional badge to show.
 * @param onLongClickEvent [MenuEvent] to dispatch when the menu item is long-clicked.
 * @param actionButtonText An optional text to show in the expanded button indicator.
 * @param state The state of this menu item.
 */
data class ExpandableMenuItem(
    override val title: Text,
    override val contentDescription: Text,
    override val onClickEvent: MenuEvent,
    val subMenuItems: List<StandardMenuItem>,
    val hideOnExpand: Boolean = false,
    override val role: Role = Button,
    override val summary: MenuItemSummary? = null,
    override val icon: MenuItemIcon? = null,
    override val showNewIndicator: Boolean = false,
    override val badge: MenuItemBadge? = null,
    override val onLongClickEvent: MenuEvent? = null,
    val actionButtonText: Text? = null,
    override val state: MenuItemState = DEFAULT,
) : MenuItem()

/**
 * Configuration of a standard menu item.
 *
 * @param title The title of the menu item.
 * @param contentDescription The content description of the menu item.
 * @param onClickEvent [MenuEvent] to dispatch when the menu item is clicked.
 * @param role The [Role] of the menu item.
 * @param summary An optional summary of the menu item.
 * @param icon An optional icon of the menu item.
 * @param showNewIndicator Whether to show a new indicator.
 * @param badge An optional badge to show.
 * @param onLongClickEvent [MenuEvent] to dispatch when the menu item is long-clicked.
 * @param actionButton An optional action button to show.
 * @param state The state of this menu item.
 */
data class StandardMenuItem(
    override val title: Text,
    override val contentDescription: Text,
    override val onClickEvent: MenuEvent,
    override val role: Role = Button,
    override val summary: MenuItemSummary? = null,
    override val icon: MenuItemIcon? = null,
    override val showNewIndicator: Boolean = false,
    override val badge: MenuItemBadge? = null,
    override val onLongClickEvent: MenuEvent? = null,
    val actionButton: MenuItemActionButton? = null,
    override val state: MenuItemState = DEFAULT,
) : MenuItem()

/**
 * Configuration of the summary text of a [MenuItem].
 *
 * @param text The text to show.
 * @param state The [MenuItemState] of this summary.
 */
data class MenuItemSummary(
    val text: Text,
    val state: MenuItemState = DEFAULT,
)

/**
 * Configuration of a badge to shown in a [MenuItem].
 *
 * @param text The text to show.
 * @param state The [MenuItemState] of this badge.
 */
data class MenuItemBadge(
    val text: Text,
    val state: MenuItemState = DEFAULT,
)

/**
 * Configuration of an action button to shown in a [MenuItem].
 *
 * @param icon The icon to show.
 * @param contentDescription The content description of this button.
 * @param onClickEvent The [MenuEvent] to dispatch when this button is clicked.
 * @param showDivider Whether to show a divider before this button.
 * @param state The [MenuItemState] of this action button.
 */
data class MenuItemActionButton(
    @DrawableRes val icon: Int,
    val contentDescription: Text,
    val onClickEvent: MenuEvent,
    val showDivider: Boolean = false,
    val state: MenuItemState = DEFAULT,
)
