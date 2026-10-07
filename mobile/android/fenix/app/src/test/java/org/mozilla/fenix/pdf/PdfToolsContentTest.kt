/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.navigationevent.DirectNavigationEventInput
import androidx.navigationevent.NavigationEvent
import androidx.navigationevent.compose.LocalNavigationEventDispatcherOwner
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.theme.Theme
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.pdf.ui.PdfToolsContent
import org.mozilla.fenix.pdf.ui.SignatureDialogContent
import org.mozilla.fenix.theme.FirefoxTheme

@RunWith(AndroidJUnit4::class)
class PdfToolsContentTest {
    @get:Rule val composeTestRule = createComposeRule()

    @get:Rule val gleanTestRule = FenixGleanTestRule(testContext)

    private val clicked = mutableListOf<String>()

    private val backInput = DirectNavigationEventInput()
    private var backReachedBrowser = false
    private var isPdfShowing by mutableStateOf(false)
    private val integration =
        PdfToolsIntegration(
            container = CoordinatorLayout(testContext),
            browserStore = BrowserStore(),
            isAddressBarAtBottom = true,
        )

    private fun setTestContent(isLargeWindow: Boolean) {
        composeTestRule.setContent {
            FirefoxTheme(theme = Theme.Light) {
                val dispatcher = requireNotNull(LocalNavigationEventDispatcherOwner.current).navigationEventDispatcher
                DisposableEffect(dispatcher) {
                    dispatcher.addInput(backInput)
                    onDispose { dispatcher.removeInput(backInput) }
                }

                BackHandler { backReachedBrowser = true }

                // The app hosts the two overlays in separate views, so they are laid out side by side here.
                Column {
                    PdfToolsContent(
                        isPdfShowing = isPdfShowing,
                        isLargeWindow = isLargeWindow,
                        isCoveredBySignatureDialog = integration.signatureState.isSigning && !isLargeWindow,
                        toolActions =
                            PdfToolActions(
                                onSignClick = integration::handleSignClick,
                                onDownloadClick = { clicked.add("download") },
                                onPrintClick = { clicked.add("print") },
                                onShareClick = { clicked.add("share") },
                            ),
                    )

                    SignatureDialogContent(
                        isPdfShowing = isPdfShowing,
                        signatureState = integration.signatureState,
                        signatureActions = integration.signatureActions,
                    )
                }
            }
        }
    }

    private fun enterPdfViewer() {
        composeTestRule.runOnUiThread { isPdfShowing = true }
        composeTestRule.waitForIdle()
    }

    private fun exitPdfViewer() {
        composeTestRule.runOnUiThread { isPdfShowing = false }
        composeTestRule.waitForIdle()
    }

    @Test
    fun `GIVEN a phone sized window WHEN the selected tab is not a PDF THEN nothing is shown`() {
        setTestContent(isLargeWindow = false)

        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGN_FAB).assertDoesNotExist()
    }

    @Test
    fun `GIVEN a tablet sized window WHEN the selected tab is not a PDF THEN nothing is shown`() {
        setTestContent(isLargeWindow = true)

        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGN_BUTTON).assertDoesNotExist()
    }

    @Test
    fun `WHEN the selected tab starts showing a PDF THEN the tools are shown`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertIsDisplayed()
    }

    @Test
    fun `WHEN the selected tab stops showing a PDF THEN the tools are hidden again`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()
        exitPdfViewer()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGN_FAB).assertDoesNotExist()
    }

    @Test
    fun `GIVEN the signature dialog is shown WHEN the selected tab stops showing a PDF THEN the dialog is hidden`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()
        startSigning()
        exitPdfViewer()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_DIALOG).assertDoesNotExist()
    }

    @Test
    fun `GIVEN a tablet sized window WHEN the selected tab shows a PDF THEN the tablet layout is used`() {
        setTestContent(isLargeWindow = true)

        enterPdfViewer()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGN_BUTTON).assertIsDisplayed()
    }

    @Test
    fun `WHEN the download button is tapped THEN the download callback is invoked`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.DOWNLOAD_BUTTON).performClick()

        assertEquals(listOf("download"), clicked)
    }

    @Test
    fun `WHEN the print button is tapped THEN the print callback is invoked`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.PRINT_BUTTON).performClick()

        assertEquals(listOf("print"), clicked)
    }

    @Test
    fun `WHEN the share button is tapped THEN the share callback is invoked`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SHARE_BUTTON).performClick()

        assertEquals(listOf("share"), clicked)
    }

    private fun startSigning(testTag: String = PdfToolsTestTag.SIGN_FAB) {
        composeTestRule.onNodeWithTag(testTag).performClick()
        composeTestRule.waitForIdle()
    }

    private fun pressBack() {
        composeTestRule.runOnUiThread {
            backInput.backStarted(NavigationEvent())
            backInput.backCompleted()
        }
        composeTestRule.waitForIdle()
    }

    private fun typeSignature() {
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_INPUT).performTextInput("Mark Johnson")
    }

    @Test
    fun `GIVEN a phone sized window WHEN the sign button is tapped THEN the signature dialog replaces the tools`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()
        startSigning()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_DIALOG).assertIsDisplayed()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGN_FAB).assertDoesNotExist()
    }

    @Test
    fun `GIVEN a tablet sized window WHEN the sign button is tapped THEN the toolbar stays alongside the dialog`() {
        // Test for Bug 2067261
        setTestContent(isLargeWindow = true)

        enterPdfViewer()
        startSigning(testTag = PdfToolsTestTag.SIGN_BUTTON)

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_DIALOG).assertIsDisplayed()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertIsDisplayed()
    }

    @Test
    fun `GIVEN a tablet sized window WHEN the signature dialog is closed THEN only the toolbar is left`() {
        setTestContent(isLargeWindow = true)

        enterPdfViewer()
        startSigning(testTag = PdfToolsTestTag.SIGN_BUTTON)

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_CLOSE_BUTTON).performClick()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_DIALOG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertIsDisplayed()
    }

    @Test
    fun `WHEN the signature dialog is closed THEN the tools come back`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()
        startSigning()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_CLOSE_BUTTON).performClick()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_DIALOG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertIsDisplayed()
    }

    @Test
    fun `WHEN a signature is added THEN the tools come back`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()
        startSigning()

        typeSignature()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_ADD_BUTTON).performClick()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_DIALOG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertIsDisplayed()
    }

    @Test
    fun `WHEN the signature is cleared THEN the field empties and the dialog stays open`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()
        startSigning()
        typeSignature()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_CLEAR_BUTTON).performClick()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_INPUT).assertTextEquals("")
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_DIALOG).assertIsDisplayed()
    }

    @Test
    fun `GIVEN the signature dialog is shown WHEN back is pressed THEN the tools come back`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()
        startSigning()

        pressBack()

        assertFalse(backReachedBrowser)
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_DIALOG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertIsDisplayed()
    }
}
