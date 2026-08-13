/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.debugsettings.info.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import mozilla.components.compose.base.badge.StatusBadge
import mozilla.components.compose.base.button.OutlinedButton
import mozilla.components.compose.base.theme.success
import org.mozilla.fenix.R
import org.mozilla.fenix.debugsettings.info.DebugInfoItem
import org.mozilla.fenix.debugsettings.info.DebugInfoSection
import org.mozilla.fenix.debugsettings.info.DebugInfoValue
import org.mozilla.fenix.debugsettings.info.displayText
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.PreviewThemeProvider
import org.mozilla.fenix.theme.Theme

@Composable
internal fun DebugInfoContent(
    sections: List<DebugInfoSection>,
    onViewJsonClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = FirefoxTheme.layout.space.static200),
    ) {
        Text(
            text = stringResource(id = R.string.debug_info_title),
            style = FirefoxTheme.typography.headline5,
        )

        Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static150))

        OutlinedButton(
            text = stringResource(id = R.string.debug_info_view_json_report),
            modifier = Modifier.fillMaxWidth(),
            onClick = onViewJsonClick,
        )

        sections.forEach { section ->
            DebugInfoSectionView(section = section)
        }
    }
}

@Composable
private fun DebugInfoSectionView(section: DebugInfoSection) {
    Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static200))

    Text(
        text = section.title,
        style = FirefoxTheme.typography.headline8,
    )

    Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static50))

    HorizontalDivider()

    section.items.forEach { item ->
        DebugInfoRow(item = item)
    }
}

@Composable
private fun DebugInfoRow(item: DebugInfoItem) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = FirefoxTheme.layout.space.static100),
        horizontalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static200),
    ) {
        Text(
            text = item.label,
            style = FirefoxTheme.typography.body2,
            modifier = Modifier.weight(1f),
        )

        when (val value = item.value) {
            is DebugInfoValue.State -> {
                StatusBadge(
                    status = value.displayText(LocalContext.current),
                    containerColor = if (value.enabled) {
                        MaterialTheme.colorScheme.success
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                    contentColor = if (value.enabled) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }

            is DebugInfoValue.Text -> {
                Text(
                    text = value.text,
                    style = FirefoxTheme.typography.body2,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Preview
@Composable
private fun DebugInfoContentPreview(
    @PreviewParameter(PreviewThemeProvider::class) theme: Theme,
) {
    FirefoxTheme(theme = theme) {
        Surface {
            DebugInfoContent(
                sections = previewSections,
                onViewJsonClick = {},
            )
        }
    }
}

private val previewSections = listOf(
    DebugInfoSection(
        title = "Device",
        items = listOf(
            DebugInfoItem(label = "Android", value = DebugInfoValue.Text("Android 15")),
            DebugInfoItem(label = "Model", value = DebugInfoValue.Text("Medium Phone")),
        ),
    ),
    DebugInfoSection(
        title = "Secret settings",
        items = listOf(
            DebugInfoItem(label = "enableHomepageSearchBar", value = DebugInfoValue.State(enabled = true)),
            DebugInfoItem(label = "tabGroupsEnabled", value = DebugInfoValue.State(enabled = false)),
            DebugInfoItem(
                label = "enableVeryLongSecretSettingDescription",
                value = DebugInfoValue.Text("a-very-long-configuration-value-that-needs-to-wrap-onto-multiple-lines"),
            ),
        ),
    ),
    DebugInfoSection(
        title = "Build",
        items = listOf(
            DebugInfoItem(
                label = "VCS Commit",
                value = DebugInfoValue.Text("2839629039f3a1b2c4d5e6f7890123456789abcd"),
            ),
        ),
    ),
)
