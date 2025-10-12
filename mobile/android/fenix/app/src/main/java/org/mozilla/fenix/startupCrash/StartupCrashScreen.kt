/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.startupCrash

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.lib.state.ext.observeAsComposableState
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

@Composable
internal fun StartupCrashScreen(store: StartupCrashStore) {
    val state by store.observeAsComposableState { it }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(top = 74.dp, bottom = 97.dp, start = 16.dp, end = 16.dp),
    ) {
        ScreenImg()

        ScreenText()

        when (state.uiState) {
            UiState.Idle -> {
                ReportButtons(store)
            }
            UiState.Loading -> {
                CircularLoadButton()
            }
            UiState.Finished -> {
                ReopenButton(store)
            }
        }
    }
}

@Composable
private fun ReportButtons(store: StartupCrashStore) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
            onClick = { store.dispatch(ReportTapped) },
            shape = RoundedCornerShape(4.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = FirefoxTheme.colors.actionPrimary,
                contentColor = FirefoxTheme.colors.textActionPrimary,
            ),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.startup_crash_positive))
        }
        Button(
            onClick = { store.dispatch(NoTapped) },
            shape = RoundedCornerShape(4.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = FirefoxTheme.colors.actionSecondary,
                contentColor = FirefoxTheme.colors.textActionSecondary,
            ),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.startup_crash_negative))
        }
    }
}

@Composable
private fun ReopenButton(store: StartupCrashStore) {
    Button(
        onClick = { store.dispatch(ReopenTapped) },
        shape = RoundedCornerShape(4.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = FirefoxTheme.colors.actionPrimary,
            contentColor = FirefoxTheme.colors.textActionPrimary,
        ),
        modifier = Modifier
            .padding(bottom = 8.dp)
            .fillMaxWidth(),
    ) {
        Icon(
            painter = painterResource(iconsR.drawable.mozac_ic_checkmark_24),
            contentDescription = null,
            tint = FirefoxTheme.colors.textActionPrimary,
        )
        Spacer(Modifier.width(8.dp))
        Text(
            stringResource(
                R.string.startup_crash_restart,
                stringResource(R.string.firefox),
            ),
        )
    }
}

@Composable
private fun CircularLoadButton() {
    Button(
        onClick = { },
        enabled = false,
        modifier = Modifier
            .fillMaxWidth(),
        shape = RoundedCornerShape(4.dp),
        colors = ButtonDefaults.buttonColors(
            disabledContainerColor = FirefoxTheme.colors.actionPrimaryDisabled,
            disabledContentColor = FirefoxTheme.colors.textActionPrimaryDisabled,
        ),
    ) {
        CircularProgressIndicator(
            strokeWidth = 2.dp,
            modifier = Modifier
                .size(24.dp),
            color = FirefoxTheme.colors.actionPrimaryDisabled,
        )
    }
}

@Composable
private fun ScreenImg() {
    Image(
        painter = if (!isSystemInDarkTheme()) {
            painterResource(id = R.drawable.fox_alert_crash_light)
        } else {
            painterResource(id = R.drawable.fox_alert_crash_dark)
        },
        contentDescription = null,
        modifier = Modifier.padding(bottom = 24.dp),
    )
}

@Composable
private fun ScreenText() {
    Column(
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .padding(bottom = 32.dp)
            .fillMaxWidth(),
    ) {
        Text(
            text = stringResource(
                R.string.startup_crash_title,
                stringResource(R.string.firefox),
            ),
            color = FirefoxTheme.colors.textPrimary,
            style = FirefoxTheme.typography.headline5,
        )
        Text(
            text = stringResource(
                R.string.startup_crash_body,
                stringResource(R.string.firefox),
            ),
            color = FirefoxTheme.colors.textSecondary,
            style = FirefoxTheme.typography.body2,
            textAlign = TextAlign.Center,
        )
    }
}

internal class UiStateProvider : PreviewParameterProvider<UiState> {
    override val values: Sequence<UiState> = sequenceOf(
        UiState.Idle,
        UiState.Loading,
        UiState.Finished,
    )
}

@Composable
@FlexibleWindowLightDarkPreview
internal fun StartupCrashScreenPreview(
    @PreviewParameter(UiStateProvider::class) uiState: UiState,
) {
    val store = remember {
        StartupCrashStore(
            initialState = StartupCrashState(uiState),
            middleware = emptyList(),
        )
    }
    FirefoxTheme {
        Box(modifier = Modifier.background(FirefoxTheme.colors.layer2)) {
            StartupCrashScreen(store)
        }
    }
}
