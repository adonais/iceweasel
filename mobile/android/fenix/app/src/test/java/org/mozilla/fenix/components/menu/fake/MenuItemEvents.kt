/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu.fake

import mozilla.components.compose.menu.data.BannerMenuItem
import mozilla.components.compose.menu.data.ExpandableMenuItem
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.store.MenuEvent

/** All events this item can dispatch, including the ones of the items it expands to. */
fun MenuItem.reachableEvents(): List<MenuEvent> =
    when (this) {
        is StandardMenuItem -> listOfNotNull(onClickEvent, onLongClickEvent, onShownEvent, actionButton?.onClickEvent)
        is ExpandableMenuItem ->
            listOfNotNull(onClickEvent, onLongClickEvent) + subMenuItems.flatMap { it.reachableEvents() }
        is BannerMenuItem -> listOf(onClickEvent, onDismissEvent)
    }
