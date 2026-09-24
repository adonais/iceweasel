/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.debugsettings.listentopage

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.button.FilledButton
import mozilla.components.feature.listentopage.ListenAction
import mozilla.components.feature.listentopage.ListenState
import mozilla.components.feature.listentopage.ListenStore
import mozilla.components.feature.listentopage.listenReducer
import mozilla.components.feature.listentopage.ui.VoiceSelection

/** Tools for listen to page. */
@Composable
fun ListenToPageTools(listenStore: ListenStore) {
    val listenState by listenStore.stateFlow.collectAsState()
    var voicesExpanded by remember { mutableStateOf(false) }

    Surface {
        Column {
            FilledButton(text = "Open voice selection") {
                voicesExpanded = !voicesExpanded
            }
            VoiceSelection(
                expanded = voicesExpanded,
                availableVoices = listenState.voiceState.availableVoices,
                selectedVoice = listenState.voiceState.selectedVoice,
                onVoiceClick = { listenStore.dispatch(ListenAction.Voices.VoiceSelected(it)) },
                onDismissRequest = { voicesExpanded = !voicesExpanded },
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun PreviewListenToPageTools() {
    ListenToPageTools(listenStore = ListenStore(initialState = ListenState(), ::listenReducer))
}
