/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar.ui

import androidx.compose.foundation.ScrollState
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp
import kotlin.test.assertNotNull
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class HighlightedDomainUrlLayoutTest {

    @get:Rule val composeTestRule = createComposeRule()

    @Test
    fun `WHEN text changes without resizing THEN the measured layout uses the current text`() {
        val initialUrl = "example1.com"
        val updatedUrl = "example1.com/path"
        val viewportWidth = 300
        var text by mutableStateOf(initialUrl)
        var measuredText: String? = null
        val textStyle = TextStyle(fontSize = 16.sp)

        composeTestRule.setContent {
            val layout = rememberTextLayoutResult(text, textStyle, viewportWidth)
            SideEffect { measuredText = layout?.layoutInput?.text?.text }
        }

        composeTestRule.runOnIdle {
            assertEquals(initialUrl, measuredText)
            text = updatedUrl
        }
        composeTestRule.runOnIdle {
            assertEquals(updatedUrl, measuredText)
        }
    }

    @Test
    fun `WHEN the highlight range is out of bounds for the text THEN it does not crash`() {
        // A registrable domain span that is inconsistent with the displayed URL
        // (here starting well past the end of the text)
        // must not reach getPathForRange with out of range indices.
        val text = "short.com"
        val outOfBoundsRange = 20 to 25
        val textStyle = TextStyle(fontSize = 16.sp)
        var layout: TextLayoutResult? = null
        var result: Int? = null

        composeTestRule.setContent {
            layout = rememberTextLayoutResult(text, textStyle, viewportWidth = 300)
        }

        composeTestRule.runOnIdle {
            result =
                computeDomainEndScrollValue(
                    text = text,
                    highlightRange = outOfBoundsRange,
                    scrollState = ScrollState(initial = 0),
                    textLayoutResult = requireNotNull(layout),
                )
        }

        assertNotNull(result)
    }
}
