/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.perf

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.mozilla.fenix.compose.button.RadioButton
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Top-level card container for profiler dialogs
 *
 * @param content The composable content to be displayed inside the card
 */
@Composable
fun ProfilerDialogueCard(content: @Composable () -> Unit) {
    FirefoxTheme {
        Card(
            colors = CardDefaults.cardColors(containerColor = FirefoxTheme.colors.layer2),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
            shape = RoundedCornerShape(12.dp),
        ) {
            content()
        }
    }
}

/**
 * Top level radio button for the profiler dialogue.
 *
 * @param text The main text to be displayed.
 * @param subText The subtext to be displayed.
 * @param selected [Boolean] that indicates whether the radio button is currently selected.
 * @param onClick Invoked when the radio button is clicked.
 */
@Composable
fun ProfilerLabeledRadioButton(
    text: String,
    subText: String,
    selected: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier.clickable { onClick() },
    ) {
        RadioButton(
            selected = selected,
            onClick = {},
            enabled = true,
        )
        Column(
            modifier = Modifier.padding(horizontal = 8.dp),
        ) {
            Text(
                text = text,
                color = FirefoxTheme.colors.textPrimary,
            )
            Text(
                text = subText,
                color = FirefoxTheme.colors.textPrimary,
                fontWeight = FontWeight.ExtraLight,
            )
        }
    }
}

/**
 * Loading dialog with circular progress indicator.
 *
 * @param message String resource ID for the message to display above the spinner
 */
@Composable
fun WaitForProfilerDialog(
    @StringRes message: Int,
) {
    ProfilerDialogueCard {
        Column(
            modifier = Modifier.padding(8.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(message),
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                modifier = Modifier.padding(8.dp),
            )
            Spacer(modifier = Modifier.height(2.dp))
            CircularProgressIndicator()
        }
    }
}

/**
 * Preview example of [ProfilerLabeledRadioButton].
 */
@Composable
@PreviewLightDark
private fun ProfilerLabeledRadioButtonPreview() {
    val radioOptions = listOf("Firefox", "Graphics", "Media", "Networking")
    val selectedOption = remember { mutableStateOf("Firefox") }

    FirefoxTheme {
        Column(
            modifier = Modifier.background(FirefoxTheme.colors.layer1),
        ) {
            radioOptions.forEach { text ->
                ProfilerLabeledRadioButton(
                    text = text,
                    subText = "Sub",
                    selected = selectedOption.value == text,
                    onClick = {
                        selectedOption.value = text
                    },
                )
            }
        }
    }
}

/**
 * Base dialog template with title, custom content area, and action buttons.
 *
 * @param titleText Title displayed at the top of the dialog
 * @param negativeActionText Text for the left/negative action button
 * @param onNegativeAction Callback invoked when the negative action button is clicked
 * @param positiveActionText Text for the right/positive action button
 * @param onPositiveAction Callback invoked when the positive action button is clicked
 * @param modifier Optional modifier for the dialog container
 * @param content Composable lambda defining the custom content between title and buttons
 */
@Composable
fun BaseProfilerDialogContent(
    titleText: String,
    negativeActionText: String,
    onNegativeAction: () -> Unit,
    positiveActionText: String,
    onPositiveAction: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    ProfilerDialogueCard {
        Column(
            modifier = modifier.padding(16.dp),
        ) {
            Text(
                text = titleText,
                fontWeight = FontWeight.ExtraBold,
                color = FirefoxTheme.colors.textPrimary,
                fontSize = 20.sp,
                modifier = Modifier.padding(bottom = 16.dp),
            )
            content() // Unique content slot
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                horizontalArrangement = Arrangement.End,
                modifier = Modifier.fillMaxWidth(),
            ) {
                TextButton(onClick = onNegativeAction) {
                    Text(negativeActionText, color = MaterialTheme.colorScheme.tertiary)
                }
                Spacer(modifier = Modifier.width(8.dp))
                TextButton(onClick = onPositiveAction) {
                    Text(positiveActionText, color = MaterialTheme.colorScheme.tertiary)
                }
            }
        }
    }
}

/**
 * Simple error dialog for displaying profiler-related error messages.
 *
 * @param errorMessage The error message text to display to the user
 * @param onDismiss Callback invoked when the dismiss button is clicked
 * @param dismissButtonText Text for the dismiss button, defaults to "Dismiss"
 */
@Composable
fun ProfilerErrorDialog(
    errorMessage: String,
    onDismiss: () -> Unit,
    dismissButtonText: String = "Dismiss",
) {
    ProfilerDialogueCard {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = errorMessage,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
                color = FirefoxTheme.colors.textPrimary,
                modifier = Modifier.padding(bottom = 16.dp),
            )
            TextButton(onClick = onDismiss) {
                Text(dismissButtonText, color = MaterialTheme.colorScheme.tertiary)
            }
        }
    }
}
