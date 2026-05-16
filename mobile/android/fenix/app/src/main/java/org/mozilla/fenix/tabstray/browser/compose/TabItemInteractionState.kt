/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.browser.compose

/**
 * The tab item's interaction state (hover, drag, etc)
 *
 * @property isHoveredByItem: True when the tab item is being hovered over by another tab item.  False otherwise.
 * @property isDragged: True when the tab item is being dragged for re-order or drag and drop, false otherwise.
 */
data class TabItemInteractionState(val isHoveredByItem: Boolean = false, val isDragged: Boolean = false)
