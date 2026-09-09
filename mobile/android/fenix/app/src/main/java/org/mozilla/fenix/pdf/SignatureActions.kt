/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf

/**
 * The callbacks for the add a signature dialog.
 *
 * @property onClearClick Invoked when the user erases the signature they typed.
 * @property onAddClick Invoked when the user adds the signature they typed to the PDF.
 * @property onCloseClick Invoked when the user dismisses the dialog without adding a signature.
 * @property onPdfGone Invoked when the selected tab stops showing the PDF being signed.
 */
internal data class SignatureActions(
    val onClearClick: () -> Unit,
    val onAddClick: () -> Unit,
    val onCloseClick: () -> Unit,
    val onPdfGone: () -> Unit,
)
