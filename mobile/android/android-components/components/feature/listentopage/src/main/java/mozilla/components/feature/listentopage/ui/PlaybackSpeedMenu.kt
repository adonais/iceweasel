/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import mozilla.components.compose.base.menu.DropdownMenu
import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.theme.AcornTheme

/** Listen to page popup menu with playback speed list */
@Composable
internal fun PlaybackSpeedMenu(
    speedList: List<MenuItem.CheckableItem>,
    expanded: Boolean,
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
) {
    DropdownMenu(
        menuItems = speedList,
        expanded = expanded,
        modifier = modifier.padding(end = AcornTheme.layout.space.static150),
        onDismissRequest = onDismissRequest,
    )
}
