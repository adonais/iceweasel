/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.address.ui.edit

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.button.TextButton
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.settings.address.store.AddressState
import org.mozilla.fenix.settings.address.store.AddressStore
import org.mozilla.fenix.settings.address.store.DeleteDialogAction
import org.mozilla.fenix.settings.address.store.DialogState
import org.mozilla.fenix.settings.address.store.ViewAppeared
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme

/**
 * Dialog that is presented when deleting an address.
 *
 * @param store the [AddressStore] used to power the dialog.
 */
@Composable
internal fun DeleteAddressDialog(store: AddressStore) {
    val dialogState by store.observeAsState(store.state.deleteDialog) { it.deleteDialog }

    if (dialogState is DialogState.Presenting) {
        AlertDialog(
            text = {
                Text(
                    text = stringResource(R.string.addressess_confirm_dialog_message_2),
                    style = FirefoxTheme.typography.body2,
                )
            },
            onDismissRequest = { store.dispatch(DeleteDialogAction.CancelTapped) },
            confirmButton = {
                TextButton(
                    text = stringResource(R.string.addressess_confirm_dialog_ok_button),
                    onClick = { store.dispatch(DeleteDialogAction.DeleteTapped) },
                    modifier = Modifier.testTag(EditAddressTestTag.DIALOG_DELETE_BUTTON),
                )
            },
            dismissButton = {
                TextButton(
                    text = stringResource(R.string.addressess_confirm_dialog_cancel_button),
                    onClick = { store.dispatch(DeleteDialogAction.CancelTapped) },
                    modifier = Modifier.testTag(EditAddressTestTag.DIALOG_CANCEL_BUTTON),
                )
            },
        )
    }
}

@PreviewLightDark
@Composable
private fun DeleteAddressDialogPreview() {
    val store = AddressStore(
        AddressState.initial().copy(deleteDialog = DialogState.Presenting),
        listOf(),
    ).also { it.dispatch(ViewAppeared) }

    FirefoxTheme {
        Surface {
            DeleteAddressDialog(store)
        }
    }
}

@Preview
@Composable
private fun DeleteAddressDialogPrivatePreview() {
    val store = AddressStore(
        AddressState.initial().copy(deleteDialog = DialogState.Presenting),
        listOf(),
    ).also { it.dispatch(ViewAppeared) }

    FirefoxTheme(theme = Theme.Private) {
        Surface {
            DeleteAddressDialog(store)
        }
    }
}
