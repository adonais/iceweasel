/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.logins.ui

import android.content.res.Configuration
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.FilledButton
import mozilla.components.compose.base.button.TextButton
import mozilla.components.compose.base.utils.getResolvedAttrResId
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.isLargeWindow
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme

private const val FILL_WIDTH_LARGE_WINDOW = 0.5f
private const val FILL_WIDTH_DEFAULT = 1.0f
private const val PHONE_WIDTH = 400
private const val PHONE_HEIGHT = 640
private const val TABLET_WIDTH = 700
private const val TABLET_HEIGHT = 1280

/**
 * A screen allowing users to unlock their logins.
 *
 * @param onUnlockClicked Invoked when the user taps the unlock button.
 * @param onLeaveClicked Invoked when the user taps the leave logins text.
 */
@Composable
internal fun UnlockLoginsScreen(
    onUnlockClicked: () -> Unit,
    onLeaveClicked: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(FirefoxTheme.colors.layer1)
            .padding(bottom = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Spacer(modifier = Modifier.height(32.dp))

        Header()

        Footer(onUnlockClicked, onLeaveClicked)
    }
}

@Composable
private fun Header() {
    Column(
        modifier = Modifier.padding(horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Logo()

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = stringResource(id = R.string.logins_biometric_prompt_message_2),
            color = FirefoxTheme.colors.textPrimary,
            textAlign = TextAlign.Center,
            style = FirefoxTheme.typography.headline6,
            maxLines = 2,
        )
    }
}

@Composable
private fun Logo() {
    Row(
        modifier = Modifier
            .padding(32.dp)
            .height(62.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            modifier = Modifier.padding(end = 14.dp),
            painter = painterResource(getResolvedAttrResId(R.attr.fenixWordmarkLogo)),
            contentDescription = null,
        )

        Image(
            modifier = Modifier.height(28.dp),
            painter = painterResource(getResolvedAttrResId(R.attr.fenixWordmarkText)),
            contentDescription = stringResource(R.string.app_name),
        )
    }
}

@Composable
private fun Footer(onUnlockClicked: () -> Unit, onLeaveClicked: () -> Unit) {
    val fillWidthFraction = if (LocalContext.current.isLargeWindow()) {
        FILL_WIDTH_LARGE_WINDOW
    } else {
        FILL_WIDTH_DEFAULT
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth(fillWidthFraction),
    ) {
        FilledButton(
            text = stringResource(id = R.string.logins_biometric_unlock_button),
            modifier = Modifier.fillMaxWidth(),
            onClick = onUnlockClicked,
        )

        Spacer(modifier = Modifier.height(8.dp))

        TextButton(
            text = stringResource(R.string.logins_biometric_leave_button),
            onClick = onLeaveClicked,
        )
    }
}

@Preview(uiMode = Configuration.UI_MODE_NIGHT_NO, widthDp = PHONE_WIDTH, heightDp = PHONE_HEIGHT)
@Composable
private fun ScreenPreviewLightPhone() = ScreenPreview(Theme.Light)

@Preview(uiMode = Configuration.UI_MODE_NIGHT_YES, widthDp = PHONE_WIDTH, heightDp = PHONE_HEIGHT)
@Composable
private fun ScreenPreviewDarkPhone() = ScreenPreview(Theme.Dark)

@Preview(uiMode = Configuration.UI_MODE_NIGHT_YES, widthDp = PHONE_WIDTH, heightDp = PHONE_HEIGHT)
@Composable
private fun ScreenPreviewPrivatePhone() = ScreenPreview(Theme.Private)

@Preview(uiMode = Configuration.UI_MODE_NIGHT_NO, widthDp = TABLET_WIDTH, heightDp = TABLET_HEIGHT)
@Composable
private fun ScreenPreviewLightTablet() = ScreenPreview(Theme.Light)

@Preview(uiMode = Configuration.UI_MODE_NIGHT_YES, widthDp = TABLET_WIDTH, heightDp = TABLET_HEIGHT)
@Composable
private fun ScreenPreviewDarkTablet() = ScreenPreview(Theme.Dark)

@Preview(uiMode = Configuration.UI_MODE_NIGHT_YES, widthDp = TABLET_WIDTH, heightDp = TABLET_HEIGHT)
@Composable
private fun ScreenPreviewPrivateTablet() = ScreenPreview(Theme.Private)

@Composable
private fun ScreenPreview(theme: Theme) {
    FirefoxTheme(theme) {
        UnlockLoginsScreen(
            onUnlockClicked = {},
            onLeaveClicked = {},
        )
    }
}
