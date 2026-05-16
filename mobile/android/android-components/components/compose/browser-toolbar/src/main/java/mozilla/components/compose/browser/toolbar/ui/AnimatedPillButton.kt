/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar.ui

import android.graphics.drawable.Drawable
import android.view.SoundEffectConstants
import androidx.appcompat.content.res.AppCompatResources
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.accompanist.drawablepainter.rememberDrawablePainter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.ui.icons.R as iconsR

const val FADE_OUT_DURATION_MILLIS = 600
const val ANIMATION_DELAY_MILLIS = 400L

/**
 * A transient pill-shaped button that displays an [icon] alongside a [text] label, then
 * animates away automatically: after [ANIMATION_DELAY_MILLIS] the label and pill fade out while
 * the pill shrinks to a circle, causing the parent to reflow its children.
 *
 * @param icon The icon to display inside the pill.
 * @param text The label text shown initially beside the icon.
 * @param contentDescription Accessibility content description for the button.
 * @param onClick Interaction dispatched when the button is tapped.
 * @param onInteraction Callback for dispatching [BrowserToolbarEvent]s to the store.
 */
@Composable
internal fun AnimatedPillButton(
    icon: Drawable,
    text: String,
    contentDescription: String,
    onClick: BrowserToolbarInteraction,
    onInteraction: (BrowserToolbarEvent) -> Unit,
) {
    // refactoring planned in https://bugzilla.mozilla.org/show_bug.cgi?id=2030770
    val view = LocalView.current
    val density = LocalDensity.current
    var fullWidthPx by remember { mutableIntStateOf(0) }
    val widthFraction = remember { Animatable(1f) }
    val textAlpha = remember { Animatable(1f) }
    val containerAlpha = remember { Animatable(1f) }

    LaunchedEffect(fullWidthPx) {
        if (fullWidthPx == 0) return@LaunchedEffect
        delay(ANIMATION_DELAY_MILLIS)
        launch { textAlpha.animateTo(0f, tween(durationMillis = FADE_OUT_DURATION_MILLIS)) }
        launch { containerAlpha.animateTo(0f, tween(durationMillis = FADE_OUT_DURATION_MILLIS)) }
        widthFraction.animateTo(0f, tween(durationMillis = FADE_OUT_DURATION_MILLIS))
    }

    val collapsedWidthDp = 40.dp
    val animatedWidthDp = if (fullWidthPx > 0) {
        val collapsedPx = with(density) { collapsedWidthDp.toPx() }
        with(density) { (collapsedPx + (fullWidthPx - collapsedPx) * widthFraction.value).toDp() }
    } else {
        Dp.Unspecified
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .padding(horizontal = 4.dp)
            .height(40.dp)
            .then(
                if (animatedWidthDp != Dp.Unspecified) Modifier.width(animatedWidthDp) else Modifier,
            )
            .onSizeChanged { size ->
                if (fullWidthPx == 0 && size.width > 0) fullWidthPx = size.width
            }
            .clip(RoundedCornerShape(90.dp))
            .background(MaterialTheme.colorScheme.surfaceBright.copy(alpha = containerAlpha.value))
            .clickable {
                view.playSoundEffect(SoundEffectConstants.CLICK)
                if (onClick is BrowserToolbarEvent) {
                    onInteraction(onClick)
                }
            }
            .semantics(mergeDescendants = true) {
                this.contentDescription = contentDescription
            },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = rememberDrawablePainter(icon),
                contentDescription = null,
                modifier = Modifier
                    .size(24.dp)
                    .clip(RoundedCornerShape(2.dp)),
                contentScale = ContentScale.Crop,
                colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onSurface),
            )

            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = text,
                modifier = Modifier.alpha(textAlpha.value),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                softWrap = false,
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun AnimatedPillButtonPreview() {
    AcornTheme {
        AnimatedPillButton(
            icon = AppCompatResources.getDrawable(
                LocalContext.current,
                iconsR.drawable.mozac_ic_search_24,
            )!!,
            text = "VPN on",
            contentDescription = "VPN on",
            onClick = object : BrowserToolbarEvent {},
            onInteraction = {},
        )
    }
}
