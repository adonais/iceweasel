/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import kotlin.test.assertFailsWith
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioWindowTest {

    @Test
    fun `test that a chunk in the middle of an article keeps two chunks either side of it`() {
        assertEquals(5..9, audioWindow(currentChunk = 7, chunkCount = 40))
        assertEquals(2..6, audioWindow(currentChunk = 4, chunkCount = 40))
    }

    @Test
    fun `test that the window shrinks at the start of an article`() {
        assertEquals(0..2, audioWindow(currentChunk = 0, chunkCount = 40))
        assertEquals(0..3, audioWindow(currentChunk = 1, chunkCount = 40))
    }

    @Test
    fun `test that the window shrinks at the end of an article`() {
        assertEquals(37..39, audioWindow(currentChunk = 39, chunkCount = 40))
        assertEquals(36..39, audioWindow(currentChunk = 38, chunkCount = 40))
    }

    @Test
    fun `test that an article of one chunk keeps that chunk`() {
        assertEquals(0..0, audioWindow(currentChunk = 0, chunkCount = 1))
    }

    @Test
    fun `test that a short article is kept whole wherever it is played from`() {
        for (chunkCount in 1..3) {
            for (currentChunk in 0 until chunkCount) {
                assertEquals(
                    "chunk $currentChunk of $chunkCount",
                    0..chunkCount - 1,
                    audioWindow(currentChunk, chunkCount),
                )
            }
        }
    }

    @Test
    fun `test that the window never reaches past the article`() {
        for (chunkCount in 1..20) {
            for (currentChunk in 0 until chunkCount) {
                val window = audioWindow(currentChunk, chunkCount)

                assertTrue("$window is outside an article of $chunkCount", window.first >= 0)
                assertTrue("$window is outside an article of $chunkCount", window.last <= chunkCount - 1)
                assertTrue("$window does not hold the chunk playing, $currentChunk", currentChunk in window)
                assertTrue("$window is bigger than the window allows", window.count() <= 5)
            }
        }
    }

    @Test
    fun `test that an article with no chunks has an empty window`() {
        val window = audioWindow(currentChunk = 0, chunkCount = 0)

        assertTrue("$window is not empty", window.isEmpty())
    }

    @Test
    fun `test that a chunk the article does not have is rejected`() {
        assertFailsWith<IllegalArgumentException> { audioWindow(currentChunk = 40, chunkCount = 40) }
        assertFailsWith<IllegalArgumentException> { audioWindow(currentChunk = -1, chunkCount = 40) }
        assertFailsWith<IllegalArgumentException> { audioWindow(currentChunk = 0, chunkCount = -1) }
    }
}
