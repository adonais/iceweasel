/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.ui.colors

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.ColorUtils

private fun Color.toHexString(): String {
    return "#%08X".format(toArgb())
}

private const val LUMINANCE_THRESHOLD = 0.4f

private fun Color.getReadableTextColor(): Color {
    return if (ColorUtils.calculateLuminance(toArgb()) > LUMINANCE_THRESHOLD) {
        NovaColors.Black
    } else {
        NovaColors.White
    }
}

@Composable
private fun SwatchCell(swatch: ColorSwatch, modifier: Modifier = Modifier) {
    val textColor = swatch.color.getReadableTextColor()

    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .width(120.dp)
            .background(swatch.color)
            .padding(16.dp),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BasicText(
                text = swatch.name,
                style = TextStyle(
                    color = textColor,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center,
                ),
            )

            BasicText(
                text = swatch.color.toHexString(),
                style = TextStyle(
                    color = textColor,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                ),
            )
        }
    }
}

@Composable
private fun ColorRow(group: ColorGroup, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clip(MaterialTheme.shapes.large)
            .horizontalScroll(rememberScrollState()),
    ) {
        group.swatches.forEach { swatch ->
            SwatchCell(swatch)
        }
    }
}

@Preview(showBackground = true, widthDp = 2400, heightDp = 1000)
@Composable
private fun NovaColorsPalettePreview() {
    Column(
        modifier = Modifier
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
    ) {
        novaColorGroups.forEach { group ->
            ColorRow(
                group = group,
                modifier = Modifier.padding(bottom = 12.dp),
            )
        }
    }
}
