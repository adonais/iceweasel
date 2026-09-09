/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.content.Context
import android.content.DialogInterface
import android.graphics.Typeface
import android.text.style.StyleSpan
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import mozilla.components.support.ktx.android.content.res.getSpanned
import mozilla.components.ui.widgets.withCenterAlignedButtons
import org.mozilla.fenix.R

/**
 * Shows the dialog informing the user that a scanned QR code does not contain a usable web address.
 *
 * @param onDismiss invoked once the user acknowledges the dialog or dismisses it.
 */
internal fun Context.showQrScanInvalidUrlDialog(onDismiss: () -> Unit) {
    MaterialAlertDialogBuilder(this)
        .setMessage(R.string.qr_scanner_dialog_invalid)
        .setPositiveButton(R.string.qr_scanner_dialog_invalid_ok) { dialog: DialogInterface, _ ->
            onDismiss()
            dialog.dismiss()
        }
        .setOnCancelListener { onDismiss() }
        .create()
        .apply { show() }
        .withCenterAlignedButtons()
}

/**
 * Shows the confirmation gate that must be passed before a scanned QR code is loaded. QR content is attacker controlled
 * physical input, so the user always explicitly allows the navigation.
 *
 * @param url the normalized http(s) url encoded in the QR code.
 * @param onConfirm invoked when the user allows the navigation.
 * @param onDeny invoked when the user denies the navigation or dismisses the dialog.
 */
internal fun Context.showQrScanConfirmationDialog(
    url: String,
    onConfirm: () -> Unit,
    onDeny: () -> Unit,
) {
    MaterialAlertDialogBuilder(this)
        .setMessage(
            resources.getSpanned(
                R.string.qr_scanner_confirmation_dialog_message,
                resources.getString(R.string.app_name) to StyleSpan(Typeface.BOLD),
                url to StyleSpan(Typeface.ITALIC),
            )
        )
        .setNegativeButton(R.string.qr_scanner_dialog_negative) { dialog: DialogInterface, _ ->
            onDeny()
            dialog.dismiss()
        }
        .setPositiveButton(R.string.qr_scanner_dialog_positive) { dialog: DialogInterface, _ ->
            onConfirm()
            dialog.dismiss()
        }
        .setOnCancelListener { onDeny() }
        .create()
        .apply { show() }
        .withCenterAlignedButtons()
}
