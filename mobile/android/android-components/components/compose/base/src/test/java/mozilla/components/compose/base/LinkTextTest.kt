/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.base

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.compose.base.theme.AcornTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LinkTextTest {

    @get:Rule val composeTestRule = createComposeRule()

    @Test
    fun `WHEN a link is not found in the full text THEN it renders without crashing`() {
        // Before the fix this added a LinkAnnotation with a negative start, which crashed later in
        // the text layout pass with "Start(-1) ... is out of range". See bug for details.
        val fullText = "This is the full displayed text"
        val state =
            LinkTextState(
                text = "this substring is not present",
                url = "https://mozilla.org",
                onClick = {},
            )

        setLinkContent(fullText, listOf(state))

        assertIsShown(fullText)
    }

    @Test
    fun `WHEN a link is blank THEN it renders without crashing`() {
        val fullText = "This is the full displayed text"
        val state =
            LinkTextState(
                text = "",
                url = "https://mozilla.org",
                onClick = {},
            )

        setLinkContent(fullText, listOf(state))

        assertIsShown(fullText)
    }

    @Test
    fun `WHEN one of several links is not found THEN the found links still render without crashing`() {
        val fullText = "Agree to the terms and the privacy notice"
        val found = LinkTextState(text = "terms", url = "https://mozilla.org/terms", onClick = {})
        val missing = LinkTextState(text = "not here", url = "https://mozilla.org/missing", onClick = {})
        val alsoFound = LinkTextState(text = "privacy notice", url = "https://mozilla.org/privacy", onClick = {})

        setLinkContent(fullText, listOf(found, missing, alsoFound))

        assertIsShown(fullText)
    }

    @Test
    fun `WHEN every link is found THEN it renders without crashing`() {
        val fullText = "Agree to the terms"
        val state = LinkTextState(text = "terms", url = "https://mozilla.org/terms", onClick = {})

        setLinkContent(fullText, listOf(state))

        assertIsShown(fullText)
    }

    private fun setLinkContent(fullText: String, linkTextStates: List<LinkTextState>) {
        composeTestRule.setContent {
            AcornTheme {
                LinkText(text = fullText, linkTextStates = linkTextStates)
            }
        }
    }

    /**
     * Fetching the node forces the measure/layout pass - the phase where the out of range link annotation used to
     * crash - so a regression would surface here as an exception rather than a failed assertion.
     */
    private fun assertIsShown(fullText: String) {
        val node = composeTestRule.onNodeWithContentDescription(fullText, substring = true).fetchSemanticsNode()

        assertTrue(node.layoutInfo.isPlaced)
    }
}
