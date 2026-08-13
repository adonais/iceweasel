/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.summarize.settings

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.feature.summarize.R
import mozilla.components.lib.shake.ShakeSensitivity
import kotlin.math.roundToInt

private const val HALF_ALPHA = 0.5f
private const val SLIDER_STEPS_BETWEEN = 0
private const val SLIDER_MIN = 0f
private const val SLIDER_MAX = 2f
private val SLIDER_TICK_SIZE = 4.dp
private const val SLIDER_TICK_COUNT = 3

/**
 * Discrete slider for selecting [ShakeSensitivity]. The slider has three stops
 * mapped to [ShakeSensitivity.Low], [ShakeSensitivity.Medium] and [ShakeSensitivity.High].
 *
 * @param isEnabled Whether the slider can be interacted with.
 * @param value The current [ShakeSensitivity].
 * @param onValueChange Callback invoked when the user selects a new sensitivity.
 */
@Composable
fun ShakeSensitivityPreference(
    isEnabled: Boolean,
    value: ShakeSensitivity,
    onValueChange: (ShakeSensitivity) -> Unit,
    modifier: Modifier = Modifier,
) {
    val alpha = if (isEnabled) 1f else HALF_ALPHA

    Column(
        modifier = modifier
            .fillMaxWidth()
            .alpha(alpha)
            .padding(vertical = AcornTheme.layout.space.static150),
    ) {
        Text(
            text = stringResource(id = R.string.mozac_summarize_settings_shake_sensitivity),
            style = AcornTheme.typography.body1.copy(
                color = MaterialTheme.colorScheme.onSurface,
            ),
        )

        Text(
            text = stringResource(id = R.string.mozac_summarize_settings_shake_sensitivity_description),
            style = AcornTheme.typography.body2.copy(
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        )

        Spacer(modifier = Modifier.height(AcornTheme.layout.space.static100))

        ShakeSensitivitySlider(
            isEnabled = isEnabled,
            value = value,
            onValueChange = onValueChange,
        )

        Text(
            text = stringResource(id = value.labelResId()),
            modifier = Modifier.padding(top = AcornTheme.layout.space.static100),
            style = AcornTheme.typography.body2.copy(
                color = MaterialTheme.colorScheme.onSurface,
            ),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShakeSensitivitySlider(
    isEnabled: Boolean,
    value: ShakeSensitivity,
    onValueChange: (ShakeSensitivity) -> Unit,
) {
    val sliderContentDescription =
        stringResource(id = R.string.mozac_summarize_settings_shake_sensitivity)
    val sliderStateDescription = stringResource(id = value.labelResId())
    var rawPosition by remember(value) {
        mutableFloatStateOf(value.toSliderPosition())
    }
    var isDragging by remember {
        mutableStateOf(false)
    }
    val displayedPosition by animateFloatAsState(
        targetValue = if (isDragging) rawPosition else rawPosition.roundToInt().toFloat(),
        animationSpec = if (isDragging) snap() else tween(),
        label = "shakeSensitivityThumb",
    )

    Slider(
        value = displayedPosition,
        onValueChange = { newInput ->
            isDragging = true
            rawPosition = newInput
        },
        onValueChangeFinished = {
            isDragging = false
            val snapped = rawPosition.roundToInt()
            rawPosition = snapped.toFloat()
            onValueChange(snapped.toShakeSensitivity())
        },
        valueRange = SLIDER_MIN..SLIDER_MAX,
        steps = SLIDER_STEPS_BETWEEN,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = sliderContentDescription
                stateDescription = sliderStateDescription
            },
        enabled = isEnabled,
        thumb = { Thumb(isEnabled) },
        track = { _ ->
            val fraction by remember(displayedPosition) {
                derivedStateOf {
                    (displayedPosition - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)
                }
            }
            Track(fraction, isEnabled)
        },
    )
}

@Composable
private fun Thumb(isEnabled: Boolean) {
    if (isEnabled) {
        Box(
            modifier = Modifier
                .padding(vertical = AcornTheme.layout.space.static50)
                .size(12.dp)
                .background(MaterialTheme.colorScheme.primary, CircleShape),
        )
    } else {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .padding(vertical = AcornTheme.layout.space.static50)
                .size(8.dp)
                .border(2.dp, MaterialTheme.colorScheme.primary, CircleShape)
                .padding(AcornTheme.layout.space.static50),
        ) {}
    }
}

@Composable
private fun Track(fraction: Float, isEnabled: Boolean) {
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = Alignment.CenterStart,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(
                    MaterialTheme.colorScheme.surfaceContainerHighest,
                    MaterialTheme.shapes.medium,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FilledTrack(fraction = fraction, isEnabled = isEnabled)
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(SLIDER_TICK_COUNT) {
                Box(
                    modifier = Modifier
                        .size(SLIDER_TICK_SIZE)
                        .background(MaterialTheme.colorScheme.primary, CircleShape),
                )
            }
        }
    }
}

@Composable
private fun FilledTrack(fraction: Float, isEnabled: Boolean) {
    val color = if (isEnabled) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.surfaceContainerHighest
    }

    Row(
        modifier = Modifier
            .fillMaxWidth(fraction)
            .height(2.dp)
            .background(color = color, shape = MaterialTheme.shapes.medium),
    ) {}
}

private fun ShakeSensitivity.toSliderPosition(): Float = when (this) {
    ShakeSensitivity.Low -> 0f
    ShakeSensitivity.Medium -> 1f
    ShakeSensitivity.High -> 2f
    else -> 1f
}

private fun Int.toShakeSensitivity(): ShakeSensitivity = when (this) {
    0 -> ShakeSensitivity.Low
    2 -> ShakeSensitivity.High
    else -> ShakeSensitivity.Medium
}

private fun ShakeSensitivity.labelResId(): Int = when (this) {
    ShakeSensitivity.Low -> R.string.mozac_summarize_settings_shake_sensitivity_low
    ShakeSensitivity.High -> R.string.mozac_summarize_settings_shake_sensitivity_high
    else -> R.string.mozac_summarize_settings_shake_sensitivity_medium
}
