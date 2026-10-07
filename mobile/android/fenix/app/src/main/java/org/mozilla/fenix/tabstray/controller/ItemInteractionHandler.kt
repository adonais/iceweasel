/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.controller

/** Interface invoked to handle item interaction behavior */
interface ItemInteractionHandler {
    /**
     * Moves a source item with key [sourceKey] next to a destination item with key [targetKey].
     *
     * @param sourceKey Key of source item
     * @param targetKey Key of target item that the source will be placed next to.
     * @param placeAfter Whether the item should be placed before or after its target
     */
    fun onMove(sourceKey: String, targetKey: String?, placeAfter: Boolean)

    /**
     * Drops a source item on a destination item
     *
     * @param sourceKey Key of source item
     * @param targetKey Key of target item
     */
    fun onDrop(sourceKey: String, targetKey: String)

    /** Called when an item drag ends without taking an action. */
    fun onDragCancel()

    /**
     * Called when a drag starts
     *
     * @param sourceKey Key of the item being dragged.
     * @param preserveSelectMode Whether select mode should be preserved on a drag.
     */
    fun onDragStart(sourceKey: String, preserveSelectMode: Boolean)
}

/** No op [ItemInteractionHandler]. Intended for previews */
object NoOpItemInteractionHandler : ItemInteractionHandler {
    override fun onMove(sourceKey: String, targetKey: String?, placeAfter: Boolean) {
        // no op
    }

    override fun onDrop(sourceKey: String, targetKey: String) {
        // no op
    }

    override fun onDragCancel() {
        // no op
    }

    override fun onDragStart(sourceKey: String, preserveSelectMode: Boolean) {
        // no op
    }
}
