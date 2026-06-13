/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.trackingprotection

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Ease
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import mozilla.components.compose.base.modifier.thenConditional
import mozilla.components.compose.base.theme.AcornTheme
import org.mozilla.fenix.R
import org.mozilla.fenix.home.sessioncontrol.TrackingProtectionInteractor
import org.mozilla.fenix.theme.FirefoxTheme
import java.text.BreakIterator
import java.text.StringCharacterIterator
import kotlin.math.roundToInt

private const val FOX_ANIMATION_DURATION = 600
private const val TYPING_DELAY_MS = 50L
private const val CURSOR_BLINK_MS = 500L

/**
 * A card that displays the number of trackers blocked with an animated fox.
 *
 * @param trackersBlockedCount The number of trackers blocked to display.
 * @param modifier Modifier to be applied to the card.
 * @param interactor Optional [TrackingProtectionInteractor] for handling interactions.
 * @param showLongfoxEntryPoint Whether to show the fox animation and typewriter text.
 */
@Composable
fun TrackersBlockedCard(
    trackersBlockedCount: Int,
    modifier: Modifier = Modifier,
    interactor: TrackingProtectionInteractor? = null,
    showLongfoxEntryPoint: Boolean = false,
) {
    val foxOffsetY = remember { Animatable(1f) }

    LaunchedEffect(showLongfoxEntryPoint) {
        if (showLongfoxEntryPoint) {
            foxOffsetY.animateTo(
                targetValue = 0f,
                animationSpec = tween(durationMillis = FOX_ANIMATION_DURATION, easing = Ease),
            )
        }
    }

    val peekHeight = 19.dp
    val foxHorizontalOffset = 14.dp

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            contentAlignment = Alignment.TopStart,
        ) {
            if (showLongfoxEntryPoint) {
                Image(
                    painter = painterResource(R.drawable.expressive_firefox),
                    contentDescription = null,
                    modifier = Modifier.offset {
                        IntOffset(
                            x = foxHorizontalOffset.toPx().roundToInt(),
                            y = ((-peekHeight.toPx()) + (foxOffsetY.value * peekHeight.toPx())).roundToInt(),
                        )
                    },
                )
            }

            ProtectionStatusPill(
                trackersBlockedCount = trackersBlockedCount,
                interactor = interactor,
            )
        }

        if (showLongfoxEntryPoint) {
            Spacer(modifier = Modifier.height(6.dp))

            TypewriterText(
                text = stringResource(R.string.help_catch_trackers),
                modifier = Modifier
                    .clickable { interactor?.onLongfoxEntryPointClicked() }
                    .padding(bottom = AcornTheme.layout.space.static300),
            )
        }
    }
}

@Composable
private fun ProtectionStatusPill(
    trackersBlockedCount: Int,
    interactor: TrackingProtectionInteractor? = null,
) {
    val shape = RoundedCornerShape(24.dp)
    Row(
        modifier = Modifier
            .background(
                color = MaterialTheme.colorScheme.secondaryContainer,
                shape = shape,
            )
            .clip(shape)
            .thenConditional(
                Modifier.clickable { interactor?.onPrivacyReportTapped() },
                { interactor != null },
            )
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painter = painterResource(R.drawable.firefox_pictorgram_shield_rgb),
            contentDescription = null,
            modifier = Modifier.size(20.dp),
        )

        Text(
            text = if (trackersBlockedCount > 0) {
                pluralStringResource(
                    R.plurals.trackers_blocked_count,
                    trackersBlockedCount,
                    trackersBlockedCount,
                )
            } else {
                stringResource(R.string.trackers_blocked_empty)
            },
            style = FirefoxTheme.typography.body2,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun TypewriterText(
    text: String,
    modifier: Modifier = Modifier,
) {
    val breakIterator = remember(text) { BreakIterator.getCharacterInstance() }
    var substringText by remember { mutableStateOf("") }
    var showCursor by remember { mutableStateOf(true) }
    var isTypingComplete by remember { mutableStateOf(false) }

    LaunchedEffect(text) {
        breakIterator.text = StringCharacterIterator(text)
        var nextIndex = breakIterator.next()
        while (nextIndex != BreakIterator.DONE) {
            substringText = text.subSequence(0, nextIndex).toString()
            nextIndex = breakIterator.next()
            delay(TYPING_DELAY_MS)
        }
        isTypingComplete = true
    }

    LaunchedEffect(Unit) {
        while (true) {
            delay(CURSOR_BLINK_MS)
            showCursor = !showCursor
        }
    }

    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = substringText,
            color = MaterialTheme.colorScheme.primary,
            fontFamily = FontFamily.Default,
            fontSize = 14.sp,
            lineHeight = 24.sp,
            letterSpacing = 0.1.sp,
        )
        if (showCursor && !isTypingComplete) {
            Spacer(modifier = Modifier.width(1.dp))
            Box(
                modifier = Modifier
                    .size(width = 6.dp, height = 12.dp)
                    .background(MaterialTheme.colorScheme.primary),
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun TrackersBlockedCardPreview() {
    FirefoxTheme {
        Surface {
            TrackersBlockedCard(
                trackersBlockedCount = 754,
                interactor = object : TrackingProtectionInteractor {
                    override fun onPrivacyReportTapped() = Unit
                override fun onLongfoxEntryPointClicked() = Unit },
                showLongfoxEntryPoint = true,
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun TrackersBlockedCardEmptyPreview() {
    FirefoxTheme {
        Surface {
            TrackersBlockedCard(
                trackersBlockedCount = 0,
                interactor = object : TrackingProtectionInteractor {
                    override fun onPrivacyReportTapped() = Unit
                override fun onLongfoxEntryPointClicked() = Unit },
                showLongfoxEntryPoint = false,
            )
        }
    }
}

@Preview
@Composable
private fun TrackersBlockedCardInteractivePreview() {
    var animationProgress by remember { mutableFloatStateOf(0f) }
    var peekHeight by remember { mutableFloatStateOf(19f) }

    FirefoxTheme {
        Surface {
            Column(
                modifier = Modifier.padding(FirefoxTheme.layout.space.static400),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(contentAlignment = Alignment.TopStart) {
                    Image(
                        painter = painterResource(R.drawable.expressive_firefox),
                        contentDescription = null,
                        modifier = Modifier.offset {
                            IntOffset(
                                x = 14.dp.toPx().roundToInt(),
                                y = ((-peekHeight.dp.toPx()) + (animationProgress * peekHeight.dp.toPx())).roundToInt(),
                            )
                        },
                    )

                    TrackersBlockedCard(
                        trackersBlockedCount = 754,
                        interactor = object : TrackingProtectionInteractor {
                            override fun onPrivacyReportTapped() = Unit
                            override fun onLongfoxEntryPointClicked() = Unit
                        },
                        showLongfoxEntryPoint = true,
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                Text("animationProgress: $animationProgress (0=peek, 1=hidden)")
                Slider(
                    value = animationProgress,
                    onValueChange = { animationProgress = it },
                    valueRange = 0f..1f,
                    modifier = Modifier.fillMaxWidth(),
                )

                Text("peekHeight: ${peekHeight.toInt()}dp")
                Slider(
                    value = peekHeight,
                    onValueChange = { peekHeight = it },
                    valueRange = 0f..40f,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
