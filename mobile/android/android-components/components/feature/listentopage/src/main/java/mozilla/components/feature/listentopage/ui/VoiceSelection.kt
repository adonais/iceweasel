/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.menu.DropdownMenu
import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.menu.MenuItem.CheckableItem
import mozilla.components.compose.base.menu.MenuItem.TextItem
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.feature.listentopage.R
import mozilla.components.feature.listentopage.Voice

/** UI to allow the user to manage their selected voice for narration. */
@Composable
fun VoiceSelection(
    expanded: Boolean,
    availableVoices: List<Voice>,
    selectedVoice: Voice?,
    onVoiceClick: (Voice) -> Unit,
    onDismissRequest: () -> Unit,
) {
    val menuItems =
        if (availableVoices.isEmpty()) {
            listOf(
                TextItem(
                    text = Text.Resource(R.string.mozac_feature_listentopage_no_voices_available),
                    enabled = false,
                    onClick = {},
                )
            )
        } else {
            availableVoices.toMenuItems(selectedVoice, onVoiceClick)
        }

    DropdownMenu(expanded = expanded, menuItems = menuItems, onDismissRequest = onDismissRequest)
}

private fun List<Voice>.toMenuItems(
    selectedVoice: Voice?,
    onClick: (Voice) -> Unit,
): List<MenuItem> = map { voice ->
    CheckableItem(
        text = Text.String(voice.id),
        isChecked = voice == selectedVoice,
        onClick = { onClick(voice) },
    )
}

private val previewVoices = listOf("Darth Vader", "Smeagol", "Hulk").map { Voice(it) }

// Dropdown menus are currently only previewable in interactive mode - give it a shot if you don't see anything
@PreviewLightDark
@Composable
private fun PreviewVoiceSelection() {
    var selectedVoice by remember { mutableStateOf(previewVoices.last()) }

    AcornTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            VoiceSelection(
                expanded = true,
                availableVoices = previewVoices,
                selectedVoice = selectedVoice,
                onVoiceClick = { selectedVoice = it },
                onDismissRequest = {},
            )
        }
    }
}
