/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.base

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults.filterChipColors
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.ui.icons.R as iconsR

/**
 * Default layout of a selectable chip.
 *
 * @param text [String] displayed in this chip.
 * @param isSelected Whether this should be shown as selected.
 * @param modifier [Modifier] used to be applied to the layout of the chip.
 * @param selectableChipColors The color set defined by [SelectableChipColors] used to style the chip.
 * @param onClick Callback for when the user taps this chip.
 */
@Composable
fun SelectableChip(
    text: String,
    isSelected: Boolean,
    modifier: Modifier = Modifier,
    selectableChipColors: SelectableChipColors = SelectableChipColors.buildColors(),
    onClick: () -> Unit,
) {
    FilterChip(
        selected = isSelected,
        modifier = modifier,
        onClick = onClick,
        label = {
            Text(
                text = text,
                color = AcornTheme.colors.textPrimary,
                style = if (isSelected) AcornTheme.typography.headline8 else AcornTheme.typography.body2,
            )
        },
        leadingIcon = if (isSelected) {
            {
                Icon(
                    painter = painterResource(id = iconsR.drawable.mozac_ic_checkmark_16),
                    contentDescription = null,
                    tint = AcornTheme.colors.iconPrimary,
                )
            }
        } else {
            null
        },
        colors = selectableChipColors.toMaterialChipColors(),
        shape = RoundedCornerShape(16.dp),
        border = if (isSelected) {
            null
        } else {
            BorderStroke(width = 1.dp, color = selectableChipColors.borderColor)
        },
    )
}

/**
 * Wrapper for the color parameters of [SelectableChip].
 *
 * @property selectedContainerColor Background [Color] when the chip is selected.
 * @property containerColor Background [Color] when the chip is not selected.
 * @property selectedLabelColor Text [Color] when the chip is selected.
 * @property labelColor Text [Color] when the chip is not selected.
 * @property borderColor Border [Color] for the chip.
 */
data class SelectableChipColors(
    val selectedContainerColor: Color,
    val containerColor: Color,
    val selectedLabelColor: Color,
    val labelColor: Color,
    val borderColor: Color,
) {

    /**
     * @see [SelectableChipColors]
     */
    companion object {

        /**
         * Builder function used to construct an instance of [SelectableChipColors].
         */
        @Composable
        @ReadOnlyComposable
        fun buildColors(
            selectedContainerColor: Color = AcornTheme.colors.actionChipSelected,
            containerColor: Color = AcornTheme.colors.layer1,
            selectedLabelColor: Color = AcornTheme.colors.textPrimary,
            labelColor: Color = AcornTheme.colors.textPrimary,
            borderColor: Color = AcornTheme.colors.borderPrimary,
        ) = SelectableChipColors(
            selectedContainerColor = selectedContainerColor,
            containerColor = containerColor,
            selectedLabelColor = selectedLabelColor,
            labelColor = labelColor,
            borderColor = borderColor,
        )
    }
}

/**
 * Map applications' colors for selectable chips to the platform type.
 */
@Composable
private fun SelectableChipColors.toMaterialChipColors() = filterChipColors(
    selectedContainerColor = selectedContainerColor,
    containerColor = containerColor,
    selectedLabelColor = selectedLabelColor,
    labelColor = labelColor,
)

@Composable
@PreviewLightDark
private fun SelectableChipPreview() {
    AcornTheme {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            SelectableChip(text = "ChirpOne", isSelected = false) {}
            SelectableChip(text = "ChirpTwo", isSelected = true) {}
        }
    }
}

@Composable
@PreviewLightDark
private fun SelectableChipWithCustomColorsPreview() {
    AcornTheme {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            SelectableChip(
                text = "Yellow",
                isSelected = false,
                selectableChipColors = SelectableChipColors(
                    selectedContainerColor = Color.Yellow,
                    containerColor = Color.DarkGray,
                    selectedLabelColor = Color.Black,
                    labelColor = Color.Gray,
                    borderColor = Color.Red,
                ),
                onClick = {},
            )

            SelectableChip(
                text = "Cyan",
                isSelected = true,
                selectableChipColors = SelectableChipColors(
                    selectedContainerColor = Color.Cyan,
                    containerColor = Color.DarkGray,
                    selectedLabelColor = Color.Red,
                    labelColor = Color.Gray,
                    borderColor = Color.Red,
                ),
                onClick = {},
            )
        }
    }
}
