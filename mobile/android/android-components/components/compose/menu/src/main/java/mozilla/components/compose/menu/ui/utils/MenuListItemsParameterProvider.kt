/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.ui.utils

import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.ui.ListMenuItemsGroup

/** [MenuItem]s to be used in the preview of the [ListMenuItemsGroup] composable. */
internal class MenuListItemsParameterProvider : PreviewParameterProvider<List<MenuItem>> {
    override val values = sequenceOf(mainSectionMenuItemsPreviewData)
}
