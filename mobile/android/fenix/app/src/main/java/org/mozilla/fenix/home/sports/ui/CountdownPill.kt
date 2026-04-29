/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme

@Composable
internal fun CountdownPill(
    days: String,
    hours: String,
    mins: String,
) {
    Surface(
        shape = MaterialTheme.shapes.extraLarge,
        color = MaterialTheme.colorScheme.surfaceContainerHighest,
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = FirefoxTheme.layout.space.static500,
                vertical = FirefoxTheme.layout.space.static50,
            ),
        ) {
            CountdownUnit(
                value = days,
                label = stringResource(R.string.sports_widget_countdown_days),
            )
            CountdownSeparator()
            CountdownUnit(
                value = hours,
                label = stringResource(R.string.sports_widget_countdown_hours),
            )
            CountdownSeparator()
            CountdownUnit(
                value = mins,
                label = stringResource(R.string.sports_widget_countdown_minutes),
            )
        }
    }
}

@Composable
private fun CountdownUnit(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = FirefoxTheme.typography.headline5,
            color = MaterialTheme.colorScheme.primary,
        )

        Text(
            text = label,
            style = FirefoxTheme.typography.caption,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun CountdownSeparator() {
    Text(
        text = ":",
        modifier = Modifier.padding(horizontal = FirefoxTheme.layout.space.static100),
        color = MaterialTheme.colorScheme.primary,
        style = FirefoxTheme.typography.headline5,
    )
}

private data class CountdownPillPreviewState(
    val days: String,
    val hours: String,
    val mins: String,
)

private class CountdownPillPreviewProvider : PreviewParameterProvider<CountdownPillPreviewState> {
    override val values = sequenceOf(
        CountdownPillPreviewState(days = "30", hours = "12", mins = "45"),
        CountdownPillPreviewState(days = "4", hours = "2", mins = "34"),
        CountdownPillPreviewState(days = "0", hours = "0", mins = "5"),
    )
}

@PreviewLightDark
@Composable
private fun CountdownPillPreview(
    @PreviewParameter(CountdownPillPreviewProvider::class) state: CountdownPillPreviewState,
) {
    FirefoxTheme {
        Surface {
            CountdownPill(
                days = state.days,
                hours = state.hours,
                mins = state.mins,
            )
        }
    }
}
