/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf

import androidx.compose.foundation.text.input.TextFieldState

/**
 * The editable signature for the PDF.
 *
 * @property isSigning Whether the dialog for adding a signature is open.
 * @property isAddingSignature Whether the dialog is processing adding a signature.
 * @property signature The signature that has been typed into the dialog.
 */
internal data class SignatureState(
    val isSigning: Boolean,
    val isAddingSignature: Boolean,
    val signature: TextFieldState,
)
