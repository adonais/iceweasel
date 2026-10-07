/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf.ui

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import org.mozilla.fenix.pdf.PdfToolActions
import org.mozilla.fenix.pdf.SignatureActions
import org.mozilla.fenix.pdf.SignatureState

/**
 * [PdfTools] are only shown when the browser is on a PDF page.
 *
 * @param isPdfShowing Whether the selected tab is showing a PDF.
 * @param isLargeWindow Used to determine if the device should be treated as a tablet.
 * @param isCoveredBySignatureDialog Whether the signature dialog sits over the tools.
 * @param toolActions The actions available on the PDF tools themselves.
 */
@Composable
internal fun PdfToolsContent(
    isPdfShowing: Boolean,
    isLargeWindow: Boolean,
    isCoveredBySignatureDialog: Boolean,
    toolActions: PdfToolActions,
) {
    if (isPdfShowing && !isCoveredBySignatureDialog) {
        PdfTools(
            isLargeWindow = isLargeWindow,
            onSignClick = toolActions.onSignClick,
            onDownloadClick = toolActions.onDownloadClick,
            onPrintClick = toolActions.onPrintClick,
            onShareClick = toolActions.onShareClick,
        )
    }
}

/**
 * The [SignatureDialog] is only shown while the user is signing the PDF of the selected tab.
 *
 * @param isPdfShowing Whether the selected tab is showing a PDF.
 * @param signatureState The signature being typed.
 * @param signatureActions The actions available on the signature dialog.
 */
@Composable
internal fun SignatureDialogContent(
    isPdfShowing: Boolean,
    signatureState: SignatureState,
    signatureActions: SignatureActions,
) {
    if (isPdfShowing && signatureState.isSigning) {
        BackHandler(onBack = signatureActions.onCloseClick)

        SignatureDialog(
            state = signatureState.signature,
            onCloseClick = signatureActions.onCloseClick,
            onClearClick = signatureActions.onClearClick,
            onAddClick = signatureActions.onAddClick,
        )
    }
}
