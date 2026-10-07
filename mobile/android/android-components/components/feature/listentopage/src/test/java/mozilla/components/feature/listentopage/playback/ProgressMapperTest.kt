/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds
import mozilla.components.feature.listentopage.ArticleProgress
import mozilla.components.feature.listentopage.synthesis.SpeechRate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Ten characters a second, so a hundred characters is ten seconds of speech and the arithmetic below is checkable by
// eye. All of it is made up: what a device really reads at is measured at runtime.
private val RATE = SpeechRate(charsPerSecond = 10.0)

/** A mapper over an article of [chunkChars] characters a chunk, of which [measured] have been made and measured. */
private fun mapper(
    chunkChars: List<Int>,
    measured: Map<Int, Duration> = emptyMap(),
    rate: SpeechRate? = RATE,
) =
    ProgressMapper(
        chunkCount = chunkChars.size,
        measuredDurationOf = { measured[it] },
        charactersIn = { chunkChars[it] },
        speechRate = rate,
    )

class ProgressMapperTest {

    @Test
    fun `test that a character offset maps to a chunk and back to a bar fraction`() {
        // Ten, twenty and thirty seconds of speech, so a minute of article.
        val mapper = mapper(listOf(100, 200, 300))

        assertEquals(0, mapper.chunkAt(0))
        assertEquals(0, mapper.chunkAt(99))
        assertEquals(1, mapper.chunkAt(100))
        assertEquals(1, mapper.chunkAt(299))
        assertEquals(2, mapper.chunkAt(300))
        assertEquals(0, mapper.characterOffsetOf(0))
        assertEquals(100, mapper.characterOffsetOf(1))
        assertEquals(300, mapper.characterOffsetOf(2))

        // A quarter of the way in is halfway through the second chunk, and maps back to it.
        assertEquals(0.25f, mapper.fractionAt(150), 0f)
        assertEquals(ChunkPosition(chunkIndex = 1, positionMs = 5_000), mapper.positionAt(mapper.fractionAt(150)))

        // Halfway in is the start of the third.
        assertEquals(0.5f, mapper.fractionAt(300), 0f)
        assertEquals(ChunkPosition(chunkIndex = 2, positionMs = 0), mapper.positionAt(mapper.fractionAt(300)))
    }

    @Test
    fun `test that every chunk boundary maps back to the chunk it opens`() {
        val chunkChars = listOf(120, 340, 90, 500, 260)
        val mapper = mapper(chunkChars)

        for (chunk in chunkChars.indices) {
            val offset = mapper.characterOffsetOf(chunk)

            assertEquals("chunk $chunk", chunk, mapper.chunkAt(offset))
            assertEquals(
                "chunk $chunk",
                ChunkPosition(chunkIndex = chunk, positionMs = 0),
                mapper.positionAt(mapper.fractionAt(offset)),
            )
        }
    }

    @Test
    fun `test that the bar reads zero before the opening has been measured`() {
        // Before the opening returns there is no article to divide up, and after it fails to measure there is no rate
        // to size one at. Neither is a fraction of anything, and neither may read as full or as not a number.
        val unsplit = mapper(chunkChars = emptyList(), rate = null).progress(ArticleProgress(), 0, 0, false)
        val unmeasured = mapper(chunkChars = listOf(100, 200), rate = null).progress(ArticleProgress(), 0, 3_000, false)

        assertEquals(ArticleProgress(), unsplit)
        assertEquals(ArticleProgress(), unmeasured)
        assertEquals(0f, unsplit.fraction, 0f)
        assertEquals(0f, unmeasured.fraction, 0f)
        assertFalse(unsplit.fraction.isNaN())
        assertFalse(unmeasured.fraction.isNaN())
    }

    @Test
    fun `test that a chunk not yet synthesized is estimated from the measured rate`() {
        val progress = mapper(listOf(100, 200)).progress(ArticleProgress(), 0, 5_000, chunkEnded = false)

        assertEquals(ArticleProgress(positionMs = 5_000, durationMs = 30_000), progress)
    }

    @Test
    fun `test that a chunk with audio but no measured duration is sized from its characters`() {
        // The second chunk has audio, because the window ran ahead and made it, and no duration: the file is added
        // before it is read. It has to count as the twenty seconds its characters are worth rather than as nothing.
        val progress =
            mapper(listOf(100, 200), measured = mapOf(0 to 8.seconds))
                .progress(ArticleProgress(), 0, 1_000, chunkEnded = false)

        assertEquals(28_000, progress.durationMs)
    }

    @Test
    fun `test that the bar reaches exactly one at the end of the article`() {
        val mapper = mapper(listOf(100, 200, 300), measured = mapOf(0 to 12.seconds, 1 to 19.seconds, 2 to 31.seconds))

        val progress =
            mapper.progress(
                previous = ArticleProgress(positionMs = 31_000, durationMs = 62_000),
                playingChunk = 2,
                // Short of the end, as the last position the player sampled before the chunk ended always is.
                chunkPositionMs = 30_999,
                chunkEnded = true,
            )

        assertEquals(ArticleProgress(positionMs = 62_000, durationMs = 62_000), progress)
        assertEquals(1f, progress.fraction, 0f)
    }

    @Test
    fun `test that the bar stays short of full until the last chunk has ended`() {
        val mapper = mapper(List(3) { 100 }, measured = (0..2).associateWith { 10.seconds })

        // Every chunk of the article played in full, which on its own is a position at the end of the article and a bar
        // that would read as finished while the player is still reading the last of it out.
        val sampled = mapper.progress(ArticleProgress(), playingChunk = 2, chunkPositionMs = 10_000, chunkEnded = false)
        val ended = mapper.progress(sampled, playingChunk = 2, chunkPositionMs = 10_000, chunkEnded = true)

        assertEquals(30_000, sampled.positionMs)
        assertTrue("the bar is at ${sampled.fraction}", sampled.fraction < 1f)
        assertEquals(1f, ended.fraction, 0f)
    }

    @Test
    fun `test that replacing an estimate with a real duration never moves the bar backwards`() {
        val chunkChars = List(6) { 100 }
        // Real durations both longer and shorter than the ten seconds their characters estimate, so the article grows
        // and shrinks under the bar rather than only ever growing.
        val real = listOf(18.seconds, 6.seconds, 14.seconds, 9.seconds, 21.seconds, 5.seconds)
        val measured = mutableMapOf<Int, Duration>()
        var progress = ArticleProgress()

        for (chunk in chunkChars.indices) {
            // The window has made, and so measured, the chunks around this one before it is played.
            for (made in chunk..minOf(chunk + AUDIO_WINDOW_RADIUS, chunkChars.lastIndex)) {
                measured[made] = real[made]
            }
            val mapper = mapper(chunkChars, measured)

            for (positionMs in 0..real[chunk].inWholeMilliseconds step 1_000) {
                val next = mapper.progress(progress, chunk, positionMs, chunkEnded = false)

                assertTrue(
                    "chunk $chunk at ${positionMs}ms went back from ${progress.fraction} to ${next.fraction}",
                    next.fraction >= progress.fraction,
                )
                progress = next
            }

            progress = mapper.progress(progress, chunk, real[chunk].inWholeMilliseconds, chunkEnded = true)
        }

        assertEquals(1f, progress.fraction, 0f)
    }

    @Test
    fun `test that a real duration shorter than its estimate does not pin the bar at full`() {
        val chunkChars = List(4) { 100 }
        // A quarter of what their characters estimate, so the article is four times shorter than the bar was drawn
        // against.
        val measured = (0..3).associateWith { 2_500.milliseconds }
        val halfway = ArticleProgress(positionMs = 20_000, durationMs = 40_000)

        val progress = mapper(chunkChars, measured).progress(halfway, playingChunk = 2, 1_000, chunkEnded = false)

        assertTrue("the bar is at ${progress.fraction}", progress.fraction < 1f)
        assertTrue("the position is inside the article", progress.positionMs <= progress.durationMs)
    }

    @Test
    fun `test that a position past the end of its chunk counts only as far as that chunk goes`() {
        val mapper = mapper(List(3) { 100 }, measured = (0..2).associateWith { 10.seconds })

        val progress = mapper.progress(ArticleProgress(), playingChunk = 1, chunkPositionMs = 99_000, false)

        assertEquals(ArticleProgress(positionMs = 20_000, durationMs = 30_000), progress)
    }

    @Test
    fun `test that an article of one chunk is a bar of its own`() {
        val mapper = mapper(listOf(100), measured = mapOf(0 to 10.seconds))

        assertEquals(0.5f, mapper.progress(ArticleProgress(), 0, 5_000, false).fraction, 0f)
        assertEquals(1f, mapper.progress(ArticleProgress(), 0, 0, chunkEnded = true).fraction, 0f)
    }

    @Test
    fun `test that the lengths are measured where they can be and estimated where they cannot`() {
        val mapper = mapper(chunkChars = listOf(100, 200, 300), measured = mapOf(1 to 5.seconds))

        // Ten characters a second sizes the chunks that have not been made, and the one that has counts for what it
        // measured rather than for the twenty seconds its characters imply.
        assertEquals(listOf(10_000L, 5_000L, 30_000L), mapper.chunkLengthsMs())
    }

    @Test
    fun `test that an article nothing can be sized from has no lengths at all`() {
        val mapper = mapper(chunkChars = listOf(100, 200), rate = null)

        assertEquals(emptyList<Long>(), mapper.chunkLengthsMs())
    }

    @Test
    fun `test that one measured chunk gives the rest of the article a length without an opening rate`() {
        val mapper = mapper(chunkChars = listOf(100, 200), measured = mapOf(0 to 10.seconds), rate = null)

        // The chunk that was made implies ten characters a second, which is enough to size the one that was not.
        assertEquals(listOf(10_000L, 20_000L), mapper.chunkLengthsMs())
    }

    @Test
    fun `test that a position in the article resolves to the chunk holding it`() {
        val lengths = listOf(10_000L, 20_000L, 30_000L)

        assertEquals(ChunkPosition(chunkIndex = 0, positionMs = 0), lengths.chunkPositionAt(0))
        assertEquals(ChunkPosition(chunkIndex = 0, positionMs = 9_999), lengths.chunkPositionAt(9_999))
        assertEquals(ChunkPosition(chunkIndex = 1, positionMs = 0), lengths.chunkPositionAt(10_000))
        assertEquals(ChunkPosition(chunkIndex = 1, positionMs = 19_999), lengths.chunkPositionAt(29_999))
        assertEquals(ChunkPosition(chunkIndex = 2, positionMs = 0), lengths.chunkPositionAt(30_000))
    }

    @Test
    fun `test that a position past the end of the article lands at the end of its last chunk`() {
        val lengths = listOf(10_000L, 20_000L)

        assertEquals(ChunkPosition(chunkIndex = 1, positionMs = 20_000), lengths.chunkPositionAt(1_000_000))
    }

    @Test
    fun `test that a position before the article lands at its start`() {
        val lengths = listOf(10_000L, 20_000L)

        assertEquals(ChunkPosition(chunkIndex = 0, positionMs = 0), lengths.chunkPositionAt(-5_000))
    }

    @Test
    fun `test that an article with no lengths has nowhere to resolve a position to`() {
        assertNull(emptyList<Long>().chunkPositionAt(1_000))
    }

    // The lengths a reader was shown are the ones their position has to be read against, so resolving has to work off
    // a list they can be held rldrehrtr.
    @Test
    fun `test that a held set of lengths resolves the same after the article has moved on`() {
        val shown = mapper(chunkChars = listOf(100, 200, 300)).chunkLengthsMs()

        // The middle chunk turns out to be far shorter than its characters implied, which pulls everything after it
        // earlier. The lengths taken before that still answer where they did.
        val moved = mapper(chunkChars = listOf(100, 200, 300), measured = mapOf(1 to 1.seconds)).chunkLengthsMs()

        assertEquals(ChunkPosition(chunkIndex = 1, positionMs = 15_000), shown.chunkPositionAt(25_000))
        assertEquals(ChunkPosition(chunkIndex = 2, positionMs = 14_000), moved.chunkPositionAt(25_000))
    }
}
