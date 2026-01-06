/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Header for the Settings Search result list.
 *
 * @param title The title to display.
 */
@Composable
fun SettingsSearchSectionHeader(title: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 16.dp),
    ) {
        Text(
            text = title,
            style = FirefoxTheme.typography.headline8,
            color = FirefoxTheme.colors.textSecondary,
        )
    }
}

@PreviewLightDark
@Composable
private fun SettingsSearchSectionHeaderPreview() {
    FirefoxTheme {
        SettingsSearchSectionHeader("General")
    }
}
