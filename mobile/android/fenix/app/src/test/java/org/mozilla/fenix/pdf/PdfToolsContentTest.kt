/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.DisposableEffect
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
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.action.TabListAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
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

    private val tabId = "1"
    private val otherTabId = "2"

    private val clicked = mutableListOf<String>()

    private val browserStore =
        BrowserStore(
            BrowserState(
                tabs =
                    listOf(
                        createTab(url = "https://mozilla.org", id = tabId),
                        createTab(url = "https://mozilla.org/other", id = otherTabId),
                    ),
                selectedTabId = tabId,
            )
        )

    private val backInput = DirectNavigationEventInput()
    private var backReachedBrowser = false
    private val integration =
        PdfToolsIntegration(
            container = CoordinatorLayout(testContext),
            browserStore = browserStore,
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
                        browserStore = browserStore,
                        isLargeWindow = isLargeWindow,
                        isCoveredBySignatureDialog = integration.signatureState.isSigning && !isLargeWindow,
                        onPdfGone = integration.signatureActions.onPdfGone,
                        toolActions =
                            PdfToolActions(
                                onSignClick = integration::handleSignClick,
                                onDownloadClick = { clicked.add("download") },
                                onPrintClick = { clicked.add("print") },
                                onShareClick = { clicked.add("share") },
                            ),
                    )

                    SignatureDialogContent(
                        signatureState = integration.signatureState,
                        signatureActions = integration.signatureActions,
                    )
                }
            }
        }
    }

    private fun enterPdfViewer() {
        browserStore.dispatch(ContentAction.EnteredPdfViewer(tabId))
        composeTestRule.waitForIdle()
    }

    private fun exitPdfViewer() {
        browserStore.dispatch(ContentAction.ExitedPdfViewer(tabId))
        composeTestRule.waitForIdle()
    }

    private fun selectOtherPdfTab() {
        browserStore.dispatch(TabListAction.SelectTabAction(otherTabId))
        browserStore.dispatch(ContentAction.EnteredPdfViewer(otherTabId))
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

    @Test
    fun `GIVEN the signature dialog is shown WHEN the selected tab stops showing a PDF THEN the signature is abandoned`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()
        startSigning()
        exitPdfViewer()
        enterPdfViewer()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_DIALOG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertIsDisplayed()
    }

    @Test
    fun `GIVEN the signature dialog is shown WHEN another tab showing a PDF is selected THEN the signature is abandoned`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()
        startSigning()
        typeSignature()
        selectOtherPdfTab()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_DIALOG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.BAR).assertIsDisplayed()
    }

    @Test
    fun `GIVEN a signature was abandoned WHEN signing the PDF of another tab THEN the previous signature is not carried over`() {
        setTestContent(isLargeWindow = false)

        enterPdfViewer()
        startSigning()
        typeSignature()
        selectOtherPdfTab()
        startSigning()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_INPUT).assertTextEquals("")
    }
}
