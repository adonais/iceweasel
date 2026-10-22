/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.ui

import android.text.format.DateUtils
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.feature.listentopage.ArticleProgress
import mozilla.components.feature.listentopage.ListenAction
import mozilla.components.feature.listentopage.PlaybackSpeed
import mozilla.components.feature.listentopage.R
import mozilla.components.feature.listentopage.VoiceState
import mozilla.components.ui.icons.R as iconsR

private const val MS_PER_SECOND = 1000L

/** Listen to page audio player in expanded state */
@Composable
internal fun PlayerExpanded(
    article: ArticleDetails,
    articleProgressState: State<ArticleProgress>,
    playing: Boolean,
    speed: PlaybackSpeed,
    voiceState: VoiceState,
    onAction: (ListenAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Row(
            modifier =
                Modifier.padding(
                        top = AcornTheme.layout.space.static50,
                        start = AcornTheme.layout.space.static25,
                        end = AcornTheme.layout.space.static200,
                    )
                    .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = { onAction(ListenAction.Session.StopRequested) },
                contentDescription = stringResource(R.string.mozac_feature_listentopage_close),
            ) {
                Icon(
                    painter = painterResource(iconsR.drawable.mozac_ic_cross_24),
                    contentDescription = null,
                )
            }
            ArticleHeading(article = article)
        }

        AudioProgress(articleProgressState = articleProgressState)

        val locale = LocalConfiguration.current.locales[0]
        val labelPattern = stringResource(R.string.mozac_feature_listentopage_playback_speed_option)
        val speedState =
            remember(speed, locale, labelPattern, onAction) {
                speed.toSpeedState(locale, labelPattern) { onAction(ListenAction.Controls.PlaybackSpeedSelected(it)) }
            }
        PlaybackControls(playing = playing, voiceState = voiceState, speedState = speedState, onAction = onAction)
    }
}

@Composable
private fun AudioProgress(articleProgressState: State<ArticleProgress>) {
    // Reading articleProgressState here instead of inside the lambda would defeat the point of hoisting it as a State.
    val progress = { articleProgressState.value.fraction }
    val elapsedTime by remember {
        derivedStateOf { DateUtils.formatElapsedTime(articleProgressState.value.positionMs / MS_PER_SECOND) }
    }
    val totalTime by remember {
        derivedStateOf { DateUtils.formatElapsedTime(articleProgressState.value.durationMs / MS_PER_SECOND) }
    }

    Column(
        modifier =
            Modifier.padding(
                    start = AcornTheme.layout.space.static200,
                    end = AcornTheme.layout.space.static200,
                    top = AcornTheme.layout.space.static100,
                )
                .fillMaxWidth()
    ) {
        AudioProgressBar(progress = progress, type = AudioProgressBarType.Full)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = elapsedTime,
                style = AcornTheme.typography.caption,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = totalTime,
                style = AcornTheme.typography.caption,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun PlayerExpandedPreview() {
    AcornTheme {
        PlayerExpanded(
            article = ArticleDetails(title = "Match Preview: Wrexham AFC vs Sunderland AFC", site = "source"),
            articleProgressState =
                remember {
                    mutableStateOf(ArticleProgress(positionMs = 84_000, durationMs = 360_000))
                },
            playing = false,
            speed = PlaybackSpeed.Default,
            voiceState = VoiceState(),
            onAction = {},
        )
    }
}
