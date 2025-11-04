/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.sitepermissions

import androidx.annotation.DrawableRes
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.support.ktx.util.PromptAbuserDetector

/**
 * Reusable composable for a permission dialog.
 * Includes a [PromptAbuserDetector] to better control dialog abuse.
 *
 * @param title Text displayed as the dialog title.
 * @param message The message text providing additional information.
 * @param icon Optional drawable resource for an icon.
 * @param positiveButtonLabel Text label for the positive action button.
 * @param negativeButtonLabel Text label for the negative action button.
 * @param dialogAbuseMillisLimit Represents a customized timeout used to avoid prompt abuse.
 * @param onConfirmRequest Action to perform when the positive button is clicked.
 * @param onDismissRequest Action to perform on dialog dismissal.
 */
@Composable
fun PermissionDialog(
    title: String,
    message: String,
    @DrawableRes icon: Int? = null,
    positiveButtonLabel: String,
    negativeButtonLabel: String,
    dialogAbuseMillisLimit: Int = 0,
    onConfirmRequest: () -> Unit,
    onDismissRequest: () -> Unit,
) {
    val promptAbuserDetector =
        PromptAbuserDetector(dialogAbuseMillisLimit)

    LaunchedEffect(Unit) {
        promptAbuserDetector.updateJSDialogAbusedState()
    }

    AlertDialog(
        icon = {
            icon?.let {
                Icon(
                    painter = painterResource(icon),
                    contentDescription = null,
                    tint = AcornTheme.colors.iconSecondary,
                )
            }
        },
        title = {
            Text(
                text = title,
                textAlign = TextAlign.Center,
                color = AcornTheme.colors.formDefault,
            )
        },
        text = {
            Text(text = message)
        },
        confirmButton = {
            DialogButton(text = positiveButtonLabel) {
                if (promptAbuserDetector.areDialogsBeingAbused()) {
                    promptAbuserDetector.updateJSDialogAbusedState()
                } else {
                    onConfirmRequest()
                    onDismissRequest()
                }
            }
        },
        dismissButton = {
            DialogButton(
                text = negativeButtonLabel,
                onClick = onDismissRequest,
            )
        },
        onDismissRequest = onDismissRequest,
    )
}

/**
 * Reusable composable for a dialog button with text.
 */
@Composable
private fun DialogButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    TextButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
    ) {
        Text(
            modifier = modifier,
            text = text,
        )
    }
}

@Preview
@Composable
private fun PermissionDialogPreview() {
    AcornTheme {
        PermissionDialog(
            icon = R.drawable.ic_system_permission_dialog,
            message = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sodales laoreet commodo.",
            title = "Dialog title",
            positiveButtonLabel = "Go to settings",
            negativeButtonLabel = "Cancel",
            onConfirmRequest = { },
            onDismissRequest = { },
        )
    }
}
