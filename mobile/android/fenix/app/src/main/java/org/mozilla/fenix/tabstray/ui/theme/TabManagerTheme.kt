/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import org.mozilla.fenix.tabstray.Page
import org.mozilla.fenix.theme.Theme

/**
 * Helper function used to obtain the [Theme] to display based on the corresponding [page].
 *
 * @param page The current [Page] in the Tab Manager.
 */
@Composable
@ReadOnlyComposable
internal fun getTabManagerTheme(page: Page): Theme = if (page == Page.PrivateTabs) {
    Theme.Private
} else {
    Theme.getTheme(allowPrivateTheme = false)
}
