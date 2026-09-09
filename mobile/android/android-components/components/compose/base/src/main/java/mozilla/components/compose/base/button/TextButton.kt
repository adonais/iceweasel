/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.base.button

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton as M3TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.base.theme.acornPrivateColorScheme
import mozilla.components.compose.base.theme.privateColorPalette
import mozilla.components.ui.icons.R as iconsR

/**
 * Text-only button.
 *
 * @param text The button text to be displayed.
 * @param onClick Invoked when the user clicks on the button.
 * @param modifier [Modifier] Used to shape and position the underlying [androidx.compose.material3.TextButton].
 * @param enabled Controls the enabled state of the button. When `false`, this button will not be clickable.
 * @param colors The [ButtonColors] used to color the [TextButton].
 * @param border Optional [BorderStroke] to apply to the [TextButton].
 */
@Composable
fun TextButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    colors: ButtonColors = ButtonDefaults.textButtonColors(),
    border: BorderStroke? = null,
) {
    M3TextButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        colors = colors,
        border = border,
    ) {
        Text(
            text = text,
            style = AcornTheme.typography.button,
            maxLines = 1,
        )
    }
}

/**
 * Text button displaying custom [content], for the cases where a label alone is not enough, such as a button pairing an
 * icon with its label.
 *
 * @param onClick Invoked when the user clicks on the button.
 * @param modifier [Modifier] Used to shape and position the underlying [androidx.compose.material3.TextButton].
 * @param enabled Controls the enabled state of the button. When `false`, this button will not be clickable.
 * @param colors The [ButtonColors] used to color the [TextButton]. The content color is provided to [content] as
 *   [androidx.compose.material3.LocalContentColor].
 * @param border Optional [BorderStroke] to apply to the [TextButton].
 * @param content The content to display inside the button, laid out in a [RowScope].
 */
@Composable
fun TextButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    colors: ButtonColors = ButtonDefaults.textButtonColors(),
    border: BorderStroke? = null,
    content: @Composable RowScope.() -> Unit,
) {
    M3TextButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        colors = colors,
        border = border,
    ) {
        CompositionLocalProvider(LocalTextStyle provides AcornTheme.typography.button) {
            content()
        }
    }
}

@Composable
@PreviewLightDark
private fun TextButtonPreview() {
    AcornTheme {
        Column(Modifier.background(MaterialTheme.colorScheme.surface)) {
            TextButton(
                text = "label",
                onClick = {},
            )

            TextButton(
                text = "disabled",
                onClick = {},
                enabled = false,
            )
        }
    }
}

@Composable
@PreviewLightDark
private fun TextButtonWithContentPreview() {
    AcornTheme {
        Column(Modifier.background(MaterialTheme.colorScheme.surface)) {
            TextButton(onClick = {}) {
                Icon(
                    painter = painterResource(iconsR.drawable.mozac_ic_chevron_down_16),
                    contentDescription = null,
                )

                Spacer(modifier = Modifier.width(AcornTheme.layout.space.static100))

                Text(
                    text = "label",
                    style = AcornTheme.typography.button,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
@Preview
private fun PrivateTextButtonPreview() {
    AcornTheme(
        colors = privateColorPalette,
        colorScheme = acornPrivateColorScheme(),
    ) {
        Column(Modifier.background(MaterialTheme.colorScheme.surface)) {
            TextButton(
                text = "label",
                onClick = {},
            )

            TextButton(
                text = "disabled",
                onClick = {},
                enabled = false,
            )
        }
    }
}
