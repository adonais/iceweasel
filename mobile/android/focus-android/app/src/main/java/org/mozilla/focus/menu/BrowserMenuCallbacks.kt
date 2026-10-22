/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu

/** Data class holding the callback functions for actions triggered from the browser menu. */
data class BrowserMenuCallbacks(
    val shareCallback: () -> Unit,
    val requestDesktopCallback: (isChecked: Boolean) -> Unit,
    val addToHomeScreenCallback: () -> Unit,
    val showFindInPageCallback: () -> Unit,
    val openInCallback: () -> Unit,
    val openInBrowser: () -> Unit,
    val showShortcutAddedSnackBar: () -> Unit,
)
