/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.theme.ContainerColorStack
import mozilla.components.ui.colors.PhotonColors

/**
 * Represents the complete palette of colors available for tab groups.
 */
data class TabGroupColorPalette(
    val yellow: TabGroupColors,
    val orange: TabGroupColors,
    val red: TabGroupColors,
    val pink: TabGroupColors,
    val purple: TabGroupColors,
    val violet: TabGroupColors,
    val blue: TabGroupColors,
    val cyan: TabGroupColors,
    val green: TabGroupColors,
    val grey: TabGroupColors,
) {
    companion object {
        val lightPalette = TabGroupColorPalette(
            yellow = TabGroupColors(primary = PhotonColors.Yellow70A77, onPrimary = PhotonColors.LightGrey05),
            orange = TabGroupColors(primary = PhotonColors.Orange70, onPrimary = PhotonColors.LightGrey05),
            red = TabGroupColors(primary = PhotonColors.Red70, onPrimary = PhotonColors.LightGrey05),
            pink = TabGroupColors(primary = PhotonColors.Pink70, onPrimary = PhotonColors.LightGrey05),
            purple = TabGroupColors(primary = PhotonColors.Purple60, onPrimary = PhotonColors.LightGrey05),
            violet = TabGroupColors(primary = PhotonColors.Violet60, onPrimary = PhotonColors.LightGrey05),
            blue = TabGroupColors(primary = PhotonColors.Blue50, onPrimary = PhotonColors.LightGrey05),
            cyan = TabGroupColors(primary = PhotonColors.Green70, onPrimary = PhotonColors.LightGrey05),
            green = TabGroupColors(primary = Color(0xFF108307), onPrimary = PhotonColors.LightGrey05),
            grey = TabGroupColors(primary = PhotonColors.DarkGrey10, onPrimary = PhotonColors.LightGrey05),
        )

        val darkPalette = TabGroupColorPalette(
            yellow = TabGroupColors(primary = PhotonColors.Yellow05, onPrimary = PhotonColors.DarkGrey90),
            orange = TabGroupColors(primary = PhotonColors.Orange10, onPrimary = PhotonColors.DarkGrey90),
            red = TabGroupColors(primary = PhotonColors.Red10, onPrimary = PhotonColors.DarkGrey90),
            pink = TabGroupColors(primary = PhotonColors.Pink10, onPrimary = PhotonColors.DarkGrey90),
            purple = TabGroupColors(primary = PhotonColors.Purple10, onPrimary = PhotonColors.DarkGrey90),
            violet = TabGroupColors(primary = PhotonColors.Violet10, onPrimary = PhotonColors.DarkGrey90),
            blue = TabGroupColors(primary = PhotonColors.Blue05, onPrimary = PhotonColors.DarkGrey90),
            cyan = TabGroupColors(primary = PhotonColors.Green20, onPrimary = PhotonColors.DarkGrey90),
            green = TabGroupColors(primary = Color(0xFFC6EBBD), onPrimary = PhotonColors.DarkGrey90),
            grey = TabGroupColors(primary = PhotonColors.LightGrey20, onPrimary = PhotonColors.DarkGrey90),
        )

        val privatePalette = darkPalette
    }
}

/**
 * Represents a single color pairing for a tab group.
 *
 * @property primary The main background color for the tab group indicator.
 * @property onPrimary The color used for elements drawn on top of the primary color.
 */
data class TabGroupColors(
    val primary: Color,
    val onPrimary: Color,
)

internal val localTabGroupColors = staticCompositionLocalOf {
    TabGroupColorPalette.lightPalette
}

/**
 * Preview showcasing the tab group colors across all supported themes.
 */
@Preview(widthDp = 1050, showBackground = true)
@Composable
private fun TabGroupColorsPreview(
    @PreviewParameter(PreviewThemeProvider::class) theme: Theme,
) {
    TabGroupColorsGrid(theme = theme)
}

/**
 * Shared helper to render the color grid so we don't repeat the layout code for every theme preview.
 */
@Composable
private fun TabGroupColorsGrid(theme: Theme) {
    FirefoxTheme(theme = theme) {
        val tabColors = FirefoxTheme.tabGroupColors

        Column(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.background)
                .padding(16.dp),
        ) {
            Text(
                text = "Tab Group Colors",
                style = MaterialTheme.typography.displayMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )

            Spacer(Modifier.height(24.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                ContainerColorStack(
                    color1 = tabColors.yellow.primary,
                    color2 = tabColors.yellow.onPrimary,
                    color3 = tabColors.orange.primary,
                    color4 = tabColors.orange.onPrimary,
                    color1Name = "Yellow",
                    color2Name = "onYellow",
                    color3Name = "Orange",
                    color4Name = "onOrange",
                )

                ContainerColorStack(
                    color1 = tabColors.red.primary,
                    color2 = tabColors.red.onPrimary,
                    color3 = tabColors.pink.primary,
                    color4 = tabColors.pink.onPrimary,
                    color1Name = "Red",
                    color2Name = "onRed",
                    color3Name = "Pink",
                    color4Name = "onPink",
                )

                ContainerColorStack(
                    color1 = tabColors.purple.primary,
                    color2 = tabColors.purple.onPrimary,
                    color3 = tabColors.violet.primary,
                    color4 = tabColors.violet.onPrimary,
                    color1Name = "Purple",
                    color2Name = "onPurple",
                    color3Name = "Violet",
                    color4Name = "onViolet",
                )

                ContainerColorStack(
                    color1 = tabColors.blue.primary,
                    color2 = tabColors.blue.onPrimary,
                    color3 = tabColors.cyan.primary,
                    color4 = tabColors.cyan.onPrimary,
                    color1Name = "Blue",
                    color2Name = "onBlue",
                    color3Name = "Cyan",
                    color4Name = "onCyan",
                )

                ContainerColorStack(
                    color1 = tabColors.green.primary,
                    color2 = tabColors.green.onPrimary,
                    color3 = tabColors.grey.primary,
                    color4 = tabColors.grey.onPrimary,
                    color1Name = "Green",
                    color2Name = "onGreen",
                    color3Name = "Grey",
                    color4Name = "onGrey",
                )
            }
        }
    }
}
