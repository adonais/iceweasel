/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.compose.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewLightDark
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme

/**
 * Settings section header.
 *
 * @param text The header string.
 * @param modifier [Modifier] to be applied to the layout.
 */
@Composable
fun SettingsSectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = FirefoxTheme.typography.headline8,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.semantics { heading() },
    )
}

@Composable
@PreviewLightDark
private fun SettingsSectionHeaderPreview() {
    FirefoxTheme {
        Surface {
            SettingsSectionHeader("Settings")
        }
    }
}

@Composable
@Preview
private fun SettingsSectionHeaderPrivatePreview() {
    FirefoxTheme(theme = Theme.Private) {
        Surface {
            SettingsSectionHeader("Settings")
        }
    }
}
