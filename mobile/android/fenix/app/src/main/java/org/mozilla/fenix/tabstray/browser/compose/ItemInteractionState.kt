/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.browser.compose

/**
 * The item's interaction state (hover, drag)
 *
 * @property isHoveredByItem True when the item is being hovered over by another item. False otherwise.
 * @property isDragged True when the item is being dragged for re-order or drag and drop, false otherwise.
 * @property isHeld True when the item is being held down before being moved, false otherwise. isHeld and isDragged can
 *   both be true, because isDragged tracks the drag gesture action.
 * @property isEntering True when the item is entering composition for the first time, false otherwise.
 */
data class ItemInteractionState(
    val isHoveredByItem: Boolean = false,
    val isDragged: Boolean = false,
    val isHeld: Boolean = false,
    val isEntering: Boolean = false,
)
