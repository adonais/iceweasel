/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.feature.listentopage.ListenAction
import mozilla.components.feature.listentopage.PlaybackSpeed
import mozilla.components.feature.listentopage.R
import mozilla.components.feature.listentopage.VoiceState
import mozilla.components.ui.icons.R as iconsR

/** Listen to page audio player controls */
@Composable
internal fun PlaybackControls(
    playing: Boolean,
    voiceState: VoiceState,
    speedState: SpeedState,
    onAction: (ListenAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    var voicesExpanded by remember { mutableStateOf(false) }
    var speedsExpanded by remember { mutableStateOf(false) }

    Row(
        modifier =
            modifier
                .padding(
                    start = AcornTheme.layout.space.static100,
                    end = AcornTheme.layout.space.static100,
                    bottom = AcornTheme.layout.space.static150,
                )
                .fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Voices
        Box {
            IconButton(
                onClick = {
                    onAction(ListenAction.Controls.VoicesClicked)
                    voicesExpanded = true
                },
                contentDescription = stringResource(R.string.mozac_feature_listentopage_audio),
            ) {
                Icon(
                    painter = painterResource(iconsR.drawable.mozac_ic_audio_wave_24),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
            VoiceSelection(
                expanded = voicesExpanded,
                availableVoices = voiceState.availableVoices,
                selectedVoice = voiceState.selectedVoice,
                onVoiceClick = {
                    voicesExpanded = false
                    onAction(ListenAction.Voices.VoiceSelected(it))
                },
                onDismissRequest = { voicesExpanded = false },
            )
        }

        CenterControls(playing = playing, onAction = onAction)

        // Speed
        Box {
            IconButton(
                onClick = { speedsExpanded = true },
                contentDescription = stringResource(speedState.contentDescription),
            ) {
                Icon(
                    painter = painterResource(speedState.icon),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
            PlaybackSpeedMenu(
                speedList = speedState.menuItems,
                expanded = speedsExpanded,
                onDismissRequest = { speedsExpanded = false },
            )
        }
    }
}

@Composable
private fun CenterControls(
    playing: Boolean,
    onAction: (ListenAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = modifier) {
        // Rewind
        IconButton(
            onClick = { onAction(ListenAction.Controls.RewindClicked) },
            contentDescription = stringResource(R.string.mozac_feature_listentopage_back_10_sec),
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_playback_rewind_24),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // Play/Pause
        PlayPauseButton(
            playing,
            { onAction(ListenAction.Controls.PlayPauseClicked) },
            Modifier.size(AcornTheme.layout.size.static800),
        )
        // Forward
        IconButton(
            onClick = { onAction(ListenAction.Controls.ForwardClicked) },
            contentDescription = stringResource(R.string.mozac_feature_listentopage_forward_30_sec),
        ) {
            // Speed icon hardcoded as of now
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_playback_forward_24),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun PlaybackControlsPreview() {
    AcornTheme {
        PlaybackControls(
            playing = false,
            voiceState = VoiceState(),
            speedState =
                PlaybackSpeed.Default.toSpeedState(
                    locale = LocalConfiguration.current.locales[0],
                    labelPattern = stringResource(R.string.mozac_feature_listentopage_playback_speed_option),
                ) {},
            onAction = {},
        )
    }
}
