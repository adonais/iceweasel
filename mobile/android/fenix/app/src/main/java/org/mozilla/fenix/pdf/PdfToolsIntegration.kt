/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.clearText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import mozilla.components.browser.state.action.EngineAction
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.theme.layout.AcornWindowSize
import mozilla.components.support.base.feature.LifecycleAwareFeature
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.PdfViewer
import org.mozilla.fenix.components.share.createPdfShareAction
import org.mozilla.fenix.pdf.ui.PdfTools
import org.mozilla.fenix.pdf.ui.SignatureDialog
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * This integration is responsible for adding or removing PDF tools and properly anchoring it to the browser. [PdfTools]
 * only show when a PDF is displayed on the browser.
 *
 * @param container The containing browser [CoordinatorLayout] to add the PDF tools onto.
 * @param browserStore The [BrowserStore] to observe the PDF status of the selected tab.
 * @param isAddressBarAtBottom Whether the address bar is at the bottom of the browser.
 */
class PdfToolsIntegration(
    private val container: CoordinatorLayout,
    private val browserStore: BrowserStore,
    private val isAddressBarAtBottom: Boolean,
) : LifecycleAwareFeature {

    private var pdfTools: ComposeView? = null
    private var isSigning by mutableStateOf(false)
    private val signature = TextFieldState()

    internal val signatureState: SignatureState
        get() = SignatureState(isSigning = isSigning, signature = signature)

    internal val toolActions =
        PdfToolActions(
            onSignClick = ::handleSignClick,
            onDownloadClick = ::handleDownloadClick,
            onPrintClick = ::handlePrintClick,
            onShareClick = ::handleShareClick,
        )

    internal val signatureActions =
        SignatureActions(
            onClearClick = ::handleSignClearClick,
            onAddClick = ::handleSignAddClick,
            onCloseClick = ::handleSignCloseClick,
            onPdfGone = ::handlePdfGone,
        )

    override fun start() {
        if (pdfTools != null) {
            return
        }

        val view =
            ComposeView(container.context).apply {
                // The tools are positioned by their behavior, which insets them from the browser chrome.
                layoutParams =
                    CoordinatorLayout.LayoutParams(
                            CoordinatorLayout.LayoutParams.MATCH_PARENT,
                            CoordinatorLayout.LayoutParams.WRAP_CONTENT,
                        )
                        .apply { behavior = PdfToolsBehavior(isAddressBarAtBottom = isAddressBarAtBottom) }

                setContent { PdfToolsHost() }
            }
        pdfTools = view

        // Add once the container has attached, since the chrome removes a sibling during that pass (Bug 2065098).
        container.post {
            if (pdfTools === view) {
                container.addView(view)
            }
        }
    }

    override fun stop() {
        container.removeView(pdfTools)
        pdfTools = null
    }

    /** Opens the dialog for adding a signature to the PDF. */
    internal fun handleSignClick() {
        isSigning = true
        PdfViewer.signTapped.record(NoExtras())
    }

    /** Erases the signature that was typed. */
    internal fun handleSignClearClick() {
        signature.clearText()
        PdfViewer.signDialogClearTapped.record(
            PdfViewer.SignDialogClearTappedExtra(signatureType = SignatureType.Typed.telemetryName)
        )
    }

    /** Adds the typed signature to the PDF and closes the dialog. */
    internal fun handleSignAddClick() {
        isSigning = false
        signature.clearText()
        PdfViewer.signDialogAddTapped.record(
            PdfViewer.SignDialogAddTappedExtra(signatureType = SignatureType.Typed.telemetryName)
        )
        // Bug 2061298 will make the behavior available.
    }

    /** Closes the dialog and discards the signature. */
    internal fun handleSignCloseClick() {
        isSigning = false
        signature.clearText()
        PdfViewer.signDialogCloseTapped.record(
            PdfViewer.SignDialogCloseTappedExtra(signatureType = SignatureType.Typed.telemetryName)
        )
    }

    /** Clears out the state if the user navigates away. */
    internal fun handlePdfGone() {
        isSigning = false
        signature.clearText()
    }

    /** Saves the PDF the selected tab is displaying to the device. */
    internal fun handleDownloadClick() {
        PdfViewer.downloadTapped.record(NoExtras())
        browserStore.state.selectedTabId?.let {
            browserStore.dispatch(EngineAction.SaveToPdfAction(it))
        }
    }

    /** Prints the PDF the selected tab is displaying. */
    internal fun handlePrintClick() {
        PdfViewer.printTapped.record(NoExtras())
        browserStore.state.selectedTabId?.let {
            browserStore.dispatch(EngineAction.PrintContentAction(it))
        }
    }

    /** Shares the PDF the selected tab is displaying. */
    internal fun handleShareClick() {
        PdfViewer.shareTapped.record(NoExtras())
        val tab = browserStore.state.selectedTab ?: return
        browserStore.createPdfShareAction(tabId = tab.id, url = tab.content.url)?.let {
            browserStore.dispatch(it)
        }
    }

    @Composable
    private fun PdfToolsHost() {
        FirefoxTheme {
            PdfToolsContent(
                browserStore = browserStore,
                isLargeWindow = AcornWindowSize.isLargeWindow(),
                signatureState = signatureState,
                signatureActions = signatureActions,
                toolActions = toolActions,
            )
        }
    }
}

/**
 * [PdfTools] are only shown when the browser is on a PDF page.
 *
 * @param browserStore Used to observe the PDF status of the selected tab.
 * @param isLargeWindow Used to determine if the device should be treated as a tablet.
 * @param signatureState The signature being typed.
 * @param signatureActions The actions available on the signature dialog.
 * @param toolActions The actions available on the PDF tools themselves.
 */
@Composable
internal fun PdfToolsContent(
    browserStore: BrowserStore,
    isLargeWindow: Boolean,
    signatureState: SignatureState,
    signatureActions: SignatureActions,
    toolActions: PdfToolActions,
) {
    val pdfTabId by remember {
        browserStore.stateFlow.map { it.selectedPdfTabId }.distinctUntilChanged()
    }
        .collectAsStateWithLifecycle(initialValue = browserStore.state.selectedPdfTabId)

    if (pdfTabId != null) {
        val onPdfGone by rememberUpdatedState(signatureActions.onPdfGone)
        DisposableEffect(pdfTabId) {
            onDispose { onPdfGone() }
        }

        if (signatureState.isSigning) {
            BackHandler(onBack = signatureActions.onCloseClick)

            SignatureDialog(
                state = signatureState.signature,
                onCloseClick = signatureActions.onCloseClick,
                onClearClick = signatureActions.onClearClick,
                onAddClick = signatureActions.onAddClick,
            )
        } else {
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

private val BrowserState.selectedPdfTabId: String?
    get() = selectedTab?.takeIf { it.content.isPdf }?.id
