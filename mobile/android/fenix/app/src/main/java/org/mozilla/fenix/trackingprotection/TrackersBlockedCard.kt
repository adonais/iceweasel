/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.trackingprotection

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

/**
 * A card that displays the number of trackers blocked.
 *
 * @param trackersBlockedCount The number of trackers blocked to display.
 * @param modifier Modifier to be applied to the card.
 */
@Composable
fun TrackersBlockedCard(
    trackersBlockedCount: Int,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .background(
                color = FirefoxTheme.colors.layer2,
                shape = RoundedCornerShape(24.dp),
            )
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val gradientStart = colorResource(R.color.privacy_gradient_start)
        val gradientEnd = colorResource(R.color.privacy_gradient_end)
        Icon(
            painter = painterResource(iconsR.drawable.mozac_ic_shield_checkmark_24),
            contentDescription = null,
            modifier = Modifier
                .size(20.dp)
                .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
                .drawWithCache {
                    onDrawWithContent {
                        drawContent()
                        drawRect(
                            brush = Brush.verticalGradient(
                                colors = listOf(gradientStart, gradientEnd),
                            ),
                            blendMode = BlendMode.SrcAtop,
                        )
                    }
                },
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

@PreviewLightDark
@Composable
private fun TrackersBlockedCardPreview() {
    FirefoxTheme {
        TrackersBlockedCard(trackersBlockedCount = 754)
    }
}

@PreviewLightDark
@Composable
private fun TrackersBlockedCardEmptyPreview() {
    FirefoxTheme {
        TrackersBlockedCard(trackersBlockedCount = 0)
    }
}
