/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.listentopage

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.IconButton
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * A pill shaped panel that floats above the content and holds a row of icon actions.
 *
 * @param modifier The [Modifier] to be applied to this panel.
 * @param content The actions to show inside the panel, usually [IconButton]s.
 */
@Composable
fun FloatingPanel(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Card(
        modifier = modifier.height(FirefoxTheme.layout.size.static600),
        shape = CircleShape,
        colors =
            CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                contentColor = MaterialTheme.colorScheme.onSurface,
            ),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = FirefoxTheme.layout.elevation.level3),
        border = BorderStroke(width = 1.dp, color = MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.padding(all = FirefoxTheme.layout.space.static50),
            horizontalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static50),
            content = content,
        )
    }
}

@PreviewLightDark
@Composable
private fun FloatingPanelPreview() {
    FirefoxTheme {
        Surface {
            FloatingPanel(modifier = Modifier.padding(all = FirefoxTheme.layout.size.static200)) {
                IconButton(onClick = {}, contentDescription = null) {
                    Icon(
                        painter = painterResource(iconsR.drawable.mozac_ic_audio_24),
                        contentDescription = null,
                    )
                }

                IconButton(onClick = {}, contentDescription = null) {
                    Icon(
                        painter = painterResource(iconsR.drawable.mozac_ic_reader_view_customize_24),
                        contentDescription = null,
                    )
                }
            }
        }
    }
}
