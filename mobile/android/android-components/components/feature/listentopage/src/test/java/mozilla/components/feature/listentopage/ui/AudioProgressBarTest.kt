/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import mozilla.components.compose.base.theme.AcornTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AudioProgressBarTest {

    @get:Rule val composeTestRule = createComposeRule()

    private val seeks = mutableListOf<Float>()

    // Held here as a player would hold it, since the bar only shows the scrub it is given.
    private var scrubFraction by mutableStateOf<Float?>(null)

    private fun setContent(progress: Float, isEnabled: Boolean = true) {
        composeTestRule.setContent {
            AcornTheme {
                AudioProgressBar(
                    progress = { progress },
                    onSeek = {
                        scrubFraction = null
                        seeks.add(it)
                    },
                    type = AudioProgressBarType.Full,
                    isEnabled = isEnabled,
                    scrubFraction = { scrubFraction },
                    onSliderDrag = { scrubFraction = it },
                )
            }
        }
    }

    private fun shownFraction() =
        composeTestRule
            .onNodeWithTag(AUDIO_PROGRESS_BAR_TEST_TAG_EXPANDED)
            .fetchSemanticsNode()
            .config[SemanticsProperties.ProgressBarRangeInfo]
            .current

    @Test
    fun `WHEN the thumb is dragged THEN it follows the finger without seeking`() {
        setContent(progress = 0.1f)

        // The first move only takes the finger past the touch slop, so the drag moves the thumb from the second on.
        composeTestRule.onNodeWithTag(AUDIO_PROGRESS_BAR_TEST_TAG_EXPANDED).performTouchInput {
            down(centerLeft)
            moveTo(center)
            moveTo(centerRight)
        }

        assertTrue("the bar stayed on the reported progress", shownFraction() > 0.9f)
        assertTrue("a seek was asked for before the thumb was let go", seeks.isEmpty())
    }

    @Test
    fun `WHEN the thumb is let go THEN one seek is asked for, to where it was let go`() {
        setContent(progress = 0.1f)

        composeTestRule.onNodeWithTag(AUDIO_PROGRESS_BAR_TEST_TAG_EXPANDED).performTouchInput {
            down(centerLeft)
            moveTo(center)
            moveTo(centerRight)
            up()
        }

        assertEquals(1, seeks.size)
        assertEquals(1f, seeks.single(), 0.01f)
    }

    @Test
    fun `WHEN the thumb is let go THEN the bar goes back to showing the reported progress`() {
        setContent(progress = 0.1f)

        composeTestRule.onNodeWithTag(AUDIO_PROGRESS_BAR_TEST_TAG_EXPANDED).performTouchInput {
            down(centerLeft)
            moveTo(center)
            moveTo(centerRight)
            up()
        }

        assertEquals("the drag never reached the slider", 1, seeks.size)
        assertEquals(0.1f, shownFraction(), 0.01f)
    }

    @Test
    fun `WHEN the track is tapped THEN one seek is asked for, to where it was tapped`() {
        setContent(progress = 0.1f)

        // A tap changes the value and finishes in one go, without a recomposition in between.
        composeTestRule.onNodeWithTag(AUDIO_PROGRESS_BAR_TEST_TAG_EXPANDED).performTouchInput { click(center) }

        assertEquals(1, seeks.size)
        assertEquals(0.5f, seeks.single(), 0.05f)
    }
}
