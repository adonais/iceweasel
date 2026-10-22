/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.theme.AcornTheme

/** Height of an [AudioProgressBarType.Mini] bar, exposed so callers can reserve room for it. */
internal val MiniAudioProgressBarHeight = 2.dp

private val FullAudioProgressBarHeight = 12.dp
private val FullAudioProgressTrackHeight = 4.dp
private val FullAudioProgressThumbWidth = 16.dp

/** The visual variants of [AudioProgressBar]. */
internal enum class AudioProgressBarType {
    /** A slim track without a thumb, sized for the compact player. */
    Mini,

    /** A taller track with a thumb, sized for the expanded player. */
    Full,
}

/**
 * Playback progress for the Listen To Page players.
 *
 * @param progress Fraction of the audio that has played, from `0` to `1`. Values outside that range, and `NaN`, are
 *   clamped. This is a lambda so that the value is read while drawing rather than while composing, which keeps a
 *   position update from recomposing the player around it.
 * @param modifier Optional modifier for further customisation of this bar.
 * @param type Which visual variant to draw.
 */
@Composable
internal fun AudioProgressBar(
    progress: () -> Float,
    modifier: Modifier = Modifier,
    type: AudioProgressBarType,
) {
    val playedFraction = { progress().let { if (it.isNaN()) 0f else it.coerceIn(0f, 1f) } }
    val progressColor = MaterialTheme.colorScheme.primary
    val trackColor = MaterialTheme.colorScheme.surfaceContainerHighest

    Canvas(
        modifier =
            modifier
                .fillMaxWidth()
                .height(
                    when (type) {
                        AudioProgressBarType.Mini -> MiniAudioProgressBarHeight
                        AudioProgressBarType.Full -> FullAudioProgressBarHeight
                    }
                )
    ) {
        when (type) {
            AudioProgressBarType.Mini -> drawMiniBar(playedFraction(), progressColor, trackColor)
            AudioProgressBarType.Full -> drawFullBar(playedFraction(), progressColor, trackColor)
        }
    }
}

private fun DrawScope.drawMiniBar(progress: Float, progressColor: Color, trackColor: Color) {
    val cornerRadius = CornerRadius(size.height / 2f)

    drawRoundRect(
        color = trackColor,
        cornerRadius = cornerRadius,
    )
    drawRoundRect(
        color = progressColor,
        size = Size(progress * size.width, size.height),
        cornerRadius = cornerRadius,
    )
}

private fun DrawScope.drawFullBar(progress: Float, progressColor: Color, trackColor: Color) {
    val trackHeight = FullAudioProgressTrackHeight.toPx()
    val thumbWidth = FullAudioProgressThumbWidth.toPx()
    val trackTop = (size.height - trackHeight) / 2f
    val cornerRadius = CornerRadius(trackHeight / 2f)

    drawRoundRect(
        color = trackColor,
        topLeft = Offset(0f, trackTop),
        size = Size(size.width, trackHeight),
        cornerRadius = cornerRadius,
    )
    drawRoundRect(
        color = progressColor,
        topLeft = Offset(0f, trackTop),
        size = Size(progress * size.width, trackHeight),
        cornerRadius = cornerRadius,
    )
    // The thumb travels over the track inset by its own width so that it stays fully drawn at both ends.
    drawRoundRect(
        color = progressColor,
        topLeft = Offset(progress * (size.width - thumbWidth), 0f),
        size = Size(thumbWidth, size.height),
        cornerRadius = CornerRadius(thumbWidth / 2f),
    )
}

@PreviewLightDark
@Composable
private fun AudioProgressBarPreview() {
    AcornTheme {
        Surface {
            Column(
                modifier = Modifier.padding(all = AcornTheme.layout.size.static200),
                verticalArrangement = Arrangement.spacedBy(AcornTheme.layout.size.static200),
            ) {
                AudioProgressBar(progress = { 0f }, type = AudioProgressBarType.Mini)
                AudioProgressBar(progress = { 0.4f }, type = AudioProgressBarType.Mini)
                AudioProgressBar(progress = { 1f }, type = AudioProgressBarType.Mini)

                AudioProgressBar(progress = { 0f }, type = AudioProgressBarType.Full)
                AudioProgressBar(progress = { 0.6f }, type = AudioProgressBarType.Full)
                AudioProgressBar(progress = { 1f }, type = AudioProgressBarType.Full)
            }
        }
    }
}
