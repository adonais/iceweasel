/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.colorResource
import mozilla.components.compose.base.theme.AcornTheme
import org.mozilla.focus.R

/**
 * The theme of the menu, providing the Acorn tokens - spacings, typography and the colors which are not part of the
 * Material scheme - which the menu needs as an Acorn component.
 *
 * While in light theme the menu colors defaulting to Material3 values look okay in dark theme they need to be updated
 * from variations of gray to variations of purple to match the application's theme.
 */
@Composable
fun MenuTheme(content: @Composable () -> Unit) {
    val colorScheme =
        if (isSystemInDarkTheme()) {
            MaterialTheme.colorScheme.copy(
                // light purple for the menu items background
                surfaceBright = colorResource(R.color.toolbarUrlBackground),
                // dark purple for the menu background
                surfaceContainer = colorResource(R.color.colorPrimary),
                // dark purple for the off toggles
                surfaceContainerHigh = colorResource(R.color.colorPrimary),
            )
        } else {
            MaterialTheme.colorScheme
        }

    AcornTheme(colorScheme = colorScheme, content = content)
}
