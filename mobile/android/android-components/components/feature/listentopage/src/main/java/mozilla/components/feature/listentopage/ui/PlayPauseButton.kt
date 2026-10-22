/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.theme.surfaceContainerSelected
import mozilla.components.feature.listentopage.R.string
import mozilla.components.ui.icons.R as iconsR

@Composable
internal fun PlayPauseButton(playing: Boolean, onButtonClicked: () -> Unit, modifier: Modifier = Modifier) {
    val playButtonContentDescription =
        if (playing) {
            stringResource(string.mozac_feature_listentopage_pause)
        } else {
            stringResource(string.mozac_feature_listentopage_play)
        }

    IconButton(
        onClick = onButtonClicked,
        contentDescription = playButtonContentDescription,
        modifier =
            modifier.background(
                color =
                    if (playing) {
                        MaterialTheme.colorScheme.surfaceContainerSelected
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                shape = CircleShape,
            ),
    ) {
        if (playing) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_pause_outline_24),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurface,
            )
        } else {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_play_fill_24),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun PlayPauseButtonPreview() {
    Column {
        PlayPauseButton(true, {})
        PlayPauseButton(false, {})
    }
}
