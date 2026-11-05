/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import mozilla.components.feature.listentopage.ArticleProgress
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BarPositionTest {

    // Halfway through forty seconds of article.
    private val halfway = ArticleProgress(positionMs = 20_000, durationMs = 40_000, barPosition = 0.5f)

    @Test
    fun `test that the bar is drawn at the position over the length`() {
        assertEquals(0.25f, barNextPosition(ArticleProgress(), positionMs = 10_000, durationMs = 40_000), 0f)
    }

    @Test
    fun `test that the bar is empty while the article has no length`() {
        assertEquals(0f, barNextPosition(ArticleProgress(), positionMs = 10_000, durationMs = 0), 0f)
    }

    @Test
    fun `test that the bar slows down rather than going back or stopping when the article is estimated longer`() {
        val next = barNextPosition(halfway, positionMs = 21_000, durationMs = 50_000)

        assertTrue("the bar went back or stopped at $next", next > halfway.fraction)
        assertTrue("the bar did not slow down", next < halfway.fraction + 1_000f / 50_000)
    }

    @Test
    fun `test that a bar slowed down for a longer estimate catches up with the position`() {
        var progress = halfway
        for (positionMs in 21_000L..40_000L step 1_000) {
            progress = ArticleProgress(positionMs, 50_000, barPosition = barNextPosition(progress, positionMs, 50_000))
        }

        assertEquals(40_000f / 50_000, progress.fraction, 0.0001f)
    }

    @Test
    fun `test that the bar speeds up rather than jumping on when the article is estimated shorter`() {
        val next = barNextPosition(halfway, positionMs = 21_000, durationMs = 30_000)

        assertTrue("the bar jumped on to $next", next < 21_000f / 30_000)
        assertTrue("the bar did not speed up", next > halfway.fraction + 1_000f / 30_000)
    }

    @Test
    fun `test that a bar behind a shorter estimate catches up with the position and then keeps up with it`() {
        // Three seconds behind, which a bar half as fast again as the position makes up in six.
        var progress = halfway
        for (positionMs in 21_000L..30_000L step 1_000) {
            progress = ArticleProgress(positionMs, 36_000, barPosition = barNextPosition(progress, positionMs, 36_000))
            assertTrue("the bar passed the position at $positionMs", progress.fraction <= positionMs / 36_000f)
        }

        assertEquals(30_000f / 36_000, progress.fraction, 0.0001f)
    }

    @Test
    fun `test that a bar where the position puts it keeps up with it`() {
        assertEquals(21_000f / 40_000, barNextPosition(halfway, positionMs = 21_000, durationMs = 40_000), 0f)
    }

    @Test
    fun `test that a seek moves the bar to where playback is against the estimated length`() {
        // Drawn against forty seconds, which the article has been estimated past since.
        assertEquals(5_000f / 50_000, barNextPosition(halfway, positionMs = 5_000, durationMs = 50_000), 0f)
        assertEquals(35_000f / 50_000, barNextPosition(halfway, positionMs = 35_000, durationMs = 50_000), 0f)
    }

    @Test
    fun `test that a seek near the end after the estimate grew leaves the bar room for the audio after it`() {
        var progress = halfway
        progress = ArticleProgress(45_000, 50_000, barPosition = barNextPosition(progress, 45_000, 50_000))
        assertEquals(45_000f / 50_000, progress.fraction, 0f)

        for (positionMs in 46_000L..49_000L step 1_000) {
            val next = ArticleProgress(positionMs, 50_000, barPosition = barNextPosition(progress, positionMs, 50_000))
            assertTrue("the bar went back at $positionMs", next.fraction >= progress.fraction)
            assertTrue(
                "the bar went back past the position at $positionMs",
                next.fraction >= positionMs / 50_000f,
            )
            assertTrue("the bar filled with audio left at $positionMs", next.fraction < 1f)
            progress = next
        }
    }

    @Test
    fun `test that the notification is given the length that puts its bar where the sheet's is`() {
        val slowed = ArticleProgress(positionMs = 21_000, durationMs = 50_000, barPosition = 0.5f)
        val caughtUp = ArticleProgress(positionMs = 21_000, durationMs = 50_000, barPosition = 21_000f / 50_000)

        assertEquals(42_000, slowed.shownDurationMs())
        assertEquals(50_000, caughtUp.shownDurationMs())
    }

    @Test
    fun `test that the notification is given a longer length while the sheet's bar catches up with a shorter estimate`() {
        val behind = ArticleProgress(positionMs = 21_000, durationMs = 30_000, barPosition = 0.6f)

        assertEquals(35_000, behind.shownDurationMs())
    }
}
