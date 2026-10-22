/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.updateTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.theme.AcornCorners
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.feature.listentopage.ArticleProgress
import mozilla.components.feature.listentopage.ListenAction
import mozilla.components.feature.listentopage.PlaybackSpeed
import mozilla.components.feature.listentopage.VoiceState

private const val FADE_OUT_DURATION_MS = 50
private const val RESIZE_DURATION_MS = 200
private const val FADE_IN_DURATION_MS = 50
private val EasingStandard = CubicBezierEasing(0.2f, 0f, 0f, 1f)
private val EasingStandardAccelerate = CubicBezierEasing(0.3f, 0f, 1f, 1f)
private val EasingStandardDecelerate = CubicBezierEasing(0f, 0f, 0f, 1f)

private val ContentEnter =
    fadeIn(
        animationSpec =
            tween(
                durationMillis = FADE_IN_DURATION_MS,
                delayMillis = FADE_OUT_DURATION_MS + RESIZE_DURATION_MS,
                easing = EasingStandardDecelerate,
            )
    )

private val ContentExit =
    fadeOut(animationSpec = tween(durationMillis = FADE_OUT_DURATION_MS, easing = EasingStandardAccelerate))

/**
 * Media player with controls for the Listen To Page feature, shown either collapsed to a single row or expanded with
 * the full transport controls.
 *
 * @param article What the player says about the article it reads.
 * @param articleProgressState How far playback has got and how long the audio is. Held as a [State] rather than a plain
 *   value so that the position is read while drawing the progress bar instead of while composing the player, which
 *   keeps a position update from recomposing the controls around it.
 * @param playing equals true if audio is playing, false if audio is paused.
 * @param speed How fast the article is being read out, shown on the expanded player's speed control.
 * @param voiceState The voices the expanded player offers to read the article in, and the one it is read in.
 * @param expanded Whether to show the full player. `false` shows the compact one.
 * @param onAction Invoked to pass upwards a [ListenAction] in response to a UI event.
 * @param onExpandClicked Invoked when the user asks for the expanded player from the compact one.
 * @param modifier Optional modifier for further customisation of this player.
 */
@Composable
fun ListenSheet(
    article: ArticleDetails,
    articleProgressState: State<ArticleProgress>,
    playing: Boolean,
    speed: PlaybackSpeed,
    voiceState: VoiceState,
    onAction: (ListenAction) -> Unit,
    onExpandClicked: () -> Unit,
    modifier: Modifier = Modifier,
    expanded: Boolean = true,
) {
    // Reading articleProgressState here instead of inside the lambda would defeat the point of hoisting it as a State.
    val progress = { articleProgressState.value.fraction }

    val transition = updateTransition(targetState = expanded, label = "ListenSheet")

    Box(modifier = modifier) {
        Card(
            shape = RoundedCornerShape(AcornCorners.extraLarge),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(AcornTheme.layout.elevation.level2),
            border = BorderStroke(AcornTheme.layout.border.default, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.fillMaxWidth(),
        ) {
            transition.AnimatedContent(
                transitionSpec = {
                    ContentEnter togetherWith
                        ContentExit using
                        SizeTransform { _, _ ->
                            tween(
                                durationMillis = RESIZE_DURATION_MS,
                                delayMillis = FADE_OUT_DURATION_MS,
                                easing = EasingStandard,
                            )
                        }
                },
                contentAlignment = Alignment.BottomStart,
            ) { isExpanded ->
                if (isExpanded) {
                    PlayerExpanded(
                        article = article,
                        articleProgressState = articleProgressState,
                        playing = playing,
                        speed = speed,
                        voiceState = voiceState,
                        onAction = onAction,
                        modifier = Modifier.inertWhileTransitioning(scope = this),
                    )
                } else {
                    PlayerCompact(
                        article = article,
                        playing = playing,
                        onAction = onAction,
                        onExpandClicked = onExpandClicked,
                        modifier = Modifier.inertWhileTransitioning(scope = this),
                    )
                }
            }
        }
        transition.AnimatedVisibility(
            visible = { isExpanded -> !isExpanded },
            modifier = Modifier.align(Alignment.BottomCenter),
            enter = ContentEnter,
            exit = ContentExit,
        ) {
            AudioProgressBarCompact(progress = progress)
        }
    }
}

/**
 * Makes a player layout ignore touches and hides it from accessibility services while it fades in or out.
 *
 * @param scope The scope that shows and hides the layout.
 */
private fun Modifier.inertWhileTransitioning(scope: AnimatedVisibilityScope): Modifier {
    val transition = scope.transition
    if (transition.currentState == EnterExitState.Visible && transition.targetState == EnterExitState.Visible) {
        return this
    }
    return this.clearAndSetSemantics {}
        .pointerInput(Unit) {
            awaitPointerEventScope {
                while (true) {
                    awaitPointerEvent(PointerEventPass.Initial).changes.forEach { it.consume() }
                }
            }
        }
}

/**
 * What the player says about the article it reads.
 *
 * @property title The article title, or `null` when the page has none.
 * @property site The site the article is from, shown under the title.
 * @property url The article's url, shown in full in place of the title when there is no title.
 */
data class ArticleDetails(val title: String? = null, val site: String? = null, val url: String? = null) {
    internal val hasTitle: Boolean
        get() = !title.isNullOrBlank()

    internal val heading: String?
        get() = if (hasTitle) title else url
}

@Composable
internal fun ArticleHeading(article: ArticleDetails, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.Center) {
        Text(
            text = article.heading.orEmpty(),
            color = MaterialTheme.colorScheme.onSurface,
            style = AcornTheme.typography.headline8,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (article.hasTitle) {
            Text(
                text = article.site.orEmpty(),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = AcornTheme.typography.caption,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun ListenSheetCompactPreview() {
    AcornTheme {
        ListenSheetPreview(expanded = false)
    }
}

@PreviewLightDark
@Composable
private fun ListenSheetExpandedPreview() {
    AcornTheme {
        ListenSheetPreview(expanded = true)
    }
}

@PreviewLightDark
@Composable
private fun ListenSheetCompactUntitledPreview() {
    AcornTheme {
        ListenSheetPreview(expanded = false, title = null)
    }
}

@PreviewLightDark
@Composable
private fun ListenSheetExpandedUntitledPreview() {
    AcornTheme {
        ListenSheetPreview(expanded = true, title = null)
    }
}

@Composable
private fun ListenSheetPreview(
    expanded: Boolean,
    title: String? = "Match Preview: Wrexham AFC vs Sunderland AFC",
) {
    ListenSheet(
        article =
            ArticleDetails(
                title = title,
                site = "bbc.co.uk",
                url = "https://www.bbc.co.uk/sport/football/articles/c0l8m2y4kxpo",
            ),
        articleProgressState = remember { mutableStateOf(ArticleProgress(positionMs = 84_000, durationMs = 360_000)) },
        playing = true,
        speed = PlaybackSpeed.Default,
        voiceState = VoiceState(),
        onAction = {},
        onExpandClicked = {},
        expanded = expanded,
    )
}
