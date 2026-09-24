/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf

import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.clearText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import androidx.coordinatorlayout.widget.CoordinatorLayout
import mozilla.components.browser.state.action.EngineAction
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.theme.layout.AcornWindowSize
import mozilla.components.support.base.feature.LifecycleAwareFeature
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.PdfViewer
import org.mozilla.fenix.components.share.createPdfShareAction
import org.mozilla.fenix.pdf.ui.PdfTools
import org.mozilla.fenix.pdf.ui.PdfToolsContent
import org.mozilla.fenix.pdf.ui.SignatureDialogContent
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

    private var overlays = emptyList<ComposeView>()
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
        if (overlays.isNotEmpty()) {
            return
        }

        val tools =
            createOverlay(pdfToolsBehavior(isAddressBarAtBottom)) {
                val isLargeWindow = AcornWindowSize.isLargeWindow()

                PdfToolsContent(
                    browserStore = browserStore,
                    isLargeWindow = isLargeWindow,
                    isCoveredBySignatureDialog = isSigning && !isLargeWindow,
                    onPdfGone = signatureActions.onPdfGone,
                    toolActions = toolActions,
                )
            }
        val dialog =
            createOverlay(signatureDialogBehavior(isAddressBarAtBottom)) {
                SignatureDialogContent(signatureState = signatureState, signatureActions = signatureActions)
            }

        val created = listOf(tools, dialog)
        overlays = created

        // Add once the container has attached, since the chrome removes a sibling during that pass (Bug 2065098).
        container.post {
            if (overlays === created) {
                created.forEach(container::addView)
            }
        }
    }

    override fun stop() {
        overlays.forEach(container::removeView)
        overlays = emptyList()
    }

    /**
     * Creates a view drawn over the browser.
     *
     * @param overlayBehavior How the overlay should position itself in relationship to the browser.
     * @param content The content for the overlay.
     */
    private fun createOverlay(overlayBehavior: PdfOverlayBehavior, content: @Composable () -> Unit) =
        ComposeView(container.context).apply {
            layoutParams =
                CoordinatorLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { behavior = overlayBehavior }

            setContent { FirefoxTheme(content = content) }
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
        PdfViewer.signDialogAddTapped.record(
            PdfViewer.SignDialogAddTappedExtra(signatureType = SignatureType.Typed.telemetryName)
        )

        val engineSession = browserStore.state.selectedTab?.engineState?.engineSession
        if (engineSession == null) {
            dismissSignatureDialog()
            return
        }

        engineSession.addSignatureToPdf(
            text = signature.text.toString(),
            onResult = ::dismissSignatureDialog,
            onException = { dismissSignatureDialog() },
        )
    }

    /** Closes the dialog and discards the signature. */
    internal fun handleSignCloseClick() {
        dismissSignatureDialog()
        PdfViewer.signDialogCloseTapped.record(
            PdfViewer.SignDialogCloseTappedExtra(signatureType = SignatureType.Typed.telemetryName)
        )
    }

    /** Clears out the state if the user navigates away. */
    internal fun handlePdfGone() {
        dismissSignatureDialog()
    }

    private fun dismissSignatureDialog() {
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
}
