/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.ui.animation

import android.content.Context
import android.provider.Settings
import androidx.annotation.DrawableRes
import androidx.annotation.RawRes
import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import com.airbnb.lottie.LottieComposition
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.rememberLottieAnimatable
import com.airbnb.lottie.compose.rememberLottieComposition
import kotlinx.coroutines.delay
import kotlin.time.Duration

private const val ANIMATIONS_DISABLED_SCALE = 0.0f

internal const val ITERATE_FOREVER: Int = Int.MAX_VALUE

internal object AnimatedIllustrationTestTag {
    private const val ROOT = "animatedIllustration"

    const val STATIC = "$ROOT.static"
    const val ANIMATION = "$ROOT.animation"
}

/**
 * Displays a Lottie animation, falling back to [staticDrawableResource] whenever the animation
 * is loading, fails to load, or when the user has reduced motion enabled. The static fallback
 * is required so call sites do not depend on Lottie directly.
 *
 * @param animationResource Raw resource ID for the Lottie JSON animation.
 * @param staticDrawableResource Drawable shown when the animation can't or shouldn't play.
 * @param modifier Modifier applied to the illustration.
 * @param contentDescription Accessibility description for the illustration.
 * @param iterations Number of times to play the animation. Defaults to infinite.
 * @param iterationDelay The pause between animation loops. Defaults to no delay.
 * @param contentScale How the content should be scaled.
 */
@Composable
fun AnimatedIllustration(
    @RawRes animationResource: Int,
    @DrawableRes staticDrawableResource: Int,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    iterations: Int = ITERATE_FOREVER,
    iterationDelay: Duration = Duration.ZERO,
    contentScale: ContentScale = ContentScale.Fit,
) {
    val context = LocalContext.current
    val reducedMotionEnabled = remember(context) { isReducedMotionEnabled(context) }
    val composition = if (reducedMotionEnabled) {
        null
    } else {
        rememberLottieComposition(LottieCompositionSpec.RawRes(animationResource)).value
    }

    AnimatedIllustration(
        composition = composition,
        staticDrawableResource = staticDrawableResource,
        modifier = modifier,
        contentDescription = contentDescription,
        iterations = iterations,
        iterationDelay = iterationDelay,
        contentScale = contentScale,
    )
}

@Composable
internal fun AnimatedIllustration(
    composition: LottieComposition?,
    @DrawableRes staticDrawableResource: Int,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    iterations: Int = ITERATE_FOREVER,
    iterationDelay: Duration = Duration.ZERO,
    contentScale: ContentScale = ContentScale.Fit,
) {
    if (composition == null) {
        Image(
            painter = painterResource(id = staticDrawableResource),
            contentDescription = contentDescription,
            modifier = modifier.testTag(AnimatedIllustrationTestTag.STATIC),
            contentScale = contentScale,
        )
    } else {
        val animatedModifier = modifier
            .testTag(AnimatedIllustrationTestTag.ANIMATION)
            .then(
                if (contentDescription != null) {
                    Modifier.semantics {
                        this.contentDescription = contentDescription
                        this.role = Role.Image
                    }
                } else {
                    Modifier
                },
            )

        if (iterationDelay <= Duration.ZERO) {
            LottieAnimation(
                composition = composition,
                iterations = iterations,
                modifier = animatedModifier,
                contentScale = contentScale,
            )
        } else {
            LoopingLottieAnimation(
                composition = composition,
                iterations = iterations,
                iterationDelay = iterationDelay,
                modifier = animatedModifier,
                contentScale = contentScale,
            )
        }
    }
}

/**
 * Plays [composition], resting on the final frame for an [iterationDelay] pause between each loop.
 */
@Composable
private fun LoopingLottieAnimation(
    composition: LottieComposition,
    iterations: Int,
    iterationDelay: Duration,
    modifier: Modifier,
    contentScale: ContentScale,
) {
    val animatable = rememberLottieAnimatable()

    LaunchedEffect(composition, iterations, iterationDelay) {
        var playedIterations = 0
        while (iterations == ITERATE_FOREVER || playedIterations < iterations) {
            animatable.animate(
                composition = composition,
                iterations = 1,
                initialProgress = 0f,
            )
            playedIterations++
            if (iterations == ITERATE_FOREVER || playedIterations < iterations) {
                delay(iterationDelay)
            }
        }
    }

    LottieAnimation(
        composition = composition,
        progress = { animatable.progress },
        modifier = modifier,
        contentScale = contentScale,
    )
}

/**
 * Whether the user has disabled animations system-wide.
 */
internal fun isReducedMotionEnabled(context: Context): Boolean {
    val animationScale = try {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
        )
    } catch (_: Settings.SettingNotFoundException) {
        return false
    }
    return animationScale == ANIMATIONS_DISABLED_SCALE
}
