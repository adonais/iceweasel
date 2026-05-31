/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

import androidx.compose.runtime.Composable
import mozilla.components.compose.base.menu.DropdownMenu
import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.text.Text
import org.mozilla.fenix.R
import org.mozilla.fenix.home.sports.CountrySelectorSource

@Composable
internal fun SportsWidgetMenu(
    expanded: Boolean,
    onDismissRequest: () -> Unit,
    onChangeTeam: (CountrySelectorSource) -> Unit,
    onGetCustomWallpaper: () -> Unit,
    onRemove: () -> Unit,
) {
    DropdownMenu(
        menuItems = listOf(
            MenuItem.TextItem(
                text = Text.Resource(R.string.sports_widget_change_team),
                onClick = {
                    onDismissRequest()
                    onChangeTeam(CountrySelectorSource.SPORTS_WIDGET_MENU)
                },
            ),
            MenuItem.TextItem(
                text = Text.Resource(R.string.sports_widget_get_custom_wallpaper),
                onClick = {
                    onDismissRequest()
                    onGetCustomWallpaper()
                },
            ),
            MenuItem.TextItem(
                text = Text.Resource(R.string.sports_widget_remove),
                level = MenuItem.FixedItem.Level.Critical,
                onClick = {
                    onDismissRequest()
                    onRemove()
                },
            ),
        ),
        expanded = expanded,
        onDismissRequest = onDismissRequest,
    )
}
