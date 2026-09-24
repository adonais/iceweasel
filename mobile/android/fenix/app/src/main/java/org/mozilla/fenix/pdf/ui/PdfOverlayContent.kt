/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf.ui

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.store.BrowserStore
import org.mozilla.fenix.pdf.PdfToolActions
import org.mozilla.fenix.pdf.SignatureActions
import org.mozilla.fenix.pdf.SignatureState

/**
 * [PdfTools] are only shown when the browser is on a PDF page.
 *
 * @param browserStore Used to observe the PDF status of the selected tab.
 * @param isLargeWindow Used to determine if the device should be treated as a tablet.
 * @param isCoveredBySignatureDialog Whether the signature dialog sits over the tools.
 * @param onPdfGone Invoked when the browser stops showing a PDF to handle cleanup from an abrupt change.
 * @param toolActions The actions available on the PDF tools themselves.
 */
@Composable
internal fun PdfToolsContent(
    browserStore: BrowserStore,
    isLargeWindow: Boolean,
    isCoveredBySignatureDialog: Boolean,
    onPdfGone: () -> Unit,
    toolActions: PdfToolActions,
) {
    val pdfTabId by
        remember(browserStore) {
                browserStore.stateFlow.map { it.selectedPdfTabId }.distinctUntilChanged()
            }
            .collectAsStateWithLifecycle(initialValue = browserStore.state.selectedPdfTabId)

    if (pdfTabId != null) {
        val abandonSignature by rememberUpdatedState(onPdfGone)
        DisposableEffect(pdfTabId) {
            onDispose { abandonSignature() }
        }

        if (!isCoveredBySignatureDialog) {
            PdfTools(
                isLargeWindow = isLargeWindow,
                onSignClick = toolActions.onSignClick,
                onDownloadClick = toolActions.onDownloadClick,
                onPrintClick = toolActions.onPrintClick,
                onShareClick = toolActions.onShareClick,
            )
        }
    }
}

/**
 * The [SignatureDialog] is only shown while the user is signing.
 *
 * @param signatureState The signature being typed.
 * @param signatureActions The actions available on the signature dialog.
 */
@Composable
internal fun SignatureDialogContent(
    signatureState: SignatureState,
    signatureActions: SignatureActions,
) {
    if (signatureState.isSigning) {
        BackHandler(onBack = signatureActions.onCloseClick)

        SignatureDialog(
            state = signatureState.signature,
            onCloseClick = signatureActions.onCloseClick,
            onClearClick = signatureActions.onClearClick,
            onAddClick = signatureActions.onAddClick,
        )
    }
}

private val BrowserState.selectedPdfTabId: String?
    get() = selectedTab?.takeIf { it.content.isPdf }?.id
