/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf.ui

import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.clearText
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.compose.base.theme.Theme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.pdf.PdfToolsTestTag
import org.mozilla.fenix.theme.FirefoxTheme

@RunWith(AndroidJUnit4::class)
class SignatureDialogTest {
    @get:Rule val composeTestRule = createComposeRule()

    private val clicked = mutableListOf<String>()

    private val signature = "My Name"

    private val state = TextFieldState()

    private fun setTestContent() {
        composeTestRule.setContent {
            FirefoxTheme(theme = Theme.Light) {
                SignatureDialog(
                    state = state,
                    onCloseClick = { clicked.add("close") },
                    onClearClick = {
                        state.clearText()
                        clicked.add("clear")
                    },
                    onAddClick = { clicked.add("add") },
                )
            }
        }
    }

    private fun typeSignature() {
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_INPUT).performTextInput(signature)
    }

    @Test
    fun `WHEN the dialog is shown THEN the signature field takes focus`() {
        // Test for Bug 2067260
        setTestContent()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_INPUT).assertIsFocused()
    }

    @Test
    fun `GIVEN nothing has been typed WHEN the dialog is shown THEN the signature cannot be added or cleared`() {
        setTestContent()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_ADD_BUTTON).assertIsNotEnabled()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_CLEAR_BUTTON).assertIsNotEnabled()
    }

    @Test
    fun `WHEN a signature is typed THEN it can be added and cleared`() {
        setTestContent()

        typeSignature()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_INPUT).assertTextEquals(signature)
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_ADD_BUTTON).assertIsEnabled()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_CLEAR_BUTTON).assertIsEnabled()
    }

    @Test
    fun `GIVEN only whitespace has been typed THEN the signature can be cleared but not added`() {
        setTestContent()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_INPUT).performTextInput("   ")

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_ADD_BUTTON).assertIsNotEnabled()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_CLEAR_BUTTON).assertIsEnabled()
    }

    @Test
    fun `GIVEN a signature has been typed WHEN clear is activated THEN the field empties`() {
        setTestContent()

        typeSignature()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_CLEAR_BUTTON).performClick()

        assertEquals(listOf("clear"), clicked)
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_INPUT).assertTextEquals("")
    }

    @Test
    fun `GIVEN a signature has been typed WHEN add is activated THEN the callback is invoked`() {
        setTestContent()

        typeSignature()
        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_ADD_BUTTON).performClick()

        assertEquals(listOf("add"), clicked)
    }

    @Test
    fun `WHEN close is activated THEN the callback is invoked`() {
        setTestContent()

        composeTestRule.onNodeWithTag(PdfToolsTestTag.SIGNATURE_CLOSE_BUTTON).performClick()

        assertEquals(listOf("close"), clicked)
    }
}
