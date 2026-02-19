/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.theme

import androidx.compose.ui.tooling.preview.PreviewParameterProvider

/**
 * This class can be used in compose previews to generate previews for each theme type.
 *
 * Example:
 * ```
 * @Preview
 * @Composable
 * private fun PreviewText(
 *     @PreviewParameter(ThemeProvider::class) theme: Theme,
 * ) = FirefoxTheme(theme) {
 *     Surface {
 *         Text("hello")
 *     }
 * }
 * ```
 */
class ThemeProvider : PreviewParameterProvider<Theme> {
    override val values = Theme.entries.asSequence()
}
