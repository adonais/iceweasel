/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.synthesis

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.IOException
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import mozilla.components.feature.listentopage.content.TextChunker
import mozilla.components.feature.listentopage.fakes.FakeAudioFileCache
import mozilla.components.feature.listentopage.fakes.FakeSpeechSynthesizer
import mozilla.components.feature.listentopage.playback.AUDIO_WINDOW_RADIUS
import mozilla.components.feature.listentopage.playback.ChunkAudio
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith

// The opening of every article below, and what the fake reports as the length of its audio. Ten characters a second,
// so a minute of speech is 600 characters and the arithmetic is checkable by eye. All of it is made up: what a device
// really reads at is measured at runtime, and a test that hardcoded a real one would read as a promise about engines.
private const val OPENING = "Sentence 1 is right here."
private val OPENING_AUDIO = 2500.milliseconds
private const val CHARS_PER_SECOND = 10
private const val CHARS_PER_MINUTE = 600

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class SynthesisQueueTest {

    @get:Rule val temporaryFolder = TemporaryFolder()

    private val cache = FakeAudioFileCache()

    @Test
    fun `test that the opening is one sentence and its audio is the first chunk's`() = runTest {
        val engine = FakeSpeechSynthesizer()
        val queue = queueWith(engine)

        val file = queue.startReading(article(sentences = 40), "en-US")

        assertEquals(listOf(OPENING), engine.requests)
        assertEquals(file, queue.fileFor(0))
    }

    @Test
    fun `test that the article after the opening is chunked into minutes of speech`() = runTest {
        val queue = queueWith(FakeSpeechSynthesizer())

        queue.startReading(article(sentences = 200), "en-US")

        // 200 sentences of about 27 characters, so several chunks of 600 rather than one of everything.
        assertTrue("Only ${queue.chunkCount} chunks", queue.chunkCount > 3)
    }

    @Test
    fun `test that the chunk after the opening is sized at what the device managed`() = runTest {
        // Half a second of work for two and a half seconds of audio, so this device makes five seconds of audio a
        // second. The opening buys 2.5 seconds of playback, so the chunk after it gets 12.5 seconds rather than 60.
        val slow = FakeSpeechSynthesizer(timePerRequest = 500.milliseconds)
        val queue = queueWith(slow)

        queue.startReading(article(sentences = 200), "en-US")
        queue.moveWindowTo(playingChunk = 0)

        val firstChunk = slow.requests[1]
        assertTrue("Chunk of ${firstChunk.length} characters", firstChunk.length <= 12.5.secondsOfSpeech())
        assertTrue("Chunk of ${firstChunk.length} characters", firstChunk.isNotEmpty())
    }

    @Test
    fun `test that an engine fast enough for a full chunk is not held back`() = runTest {
        // No measurable work, so there is nothing to size against and the chunk after the opening is a full one.
        val engine = FakeSpeechSynthesizer()
        val queue = queueWith(engine)

        queue.startReading(article(sentences = 200), "en-US")
        queue.moveWindowTo(playingChunk = 0)

        assertTrue("Chunk of ${engine.requests[1].length} characters", engine.requests[1].length > CHARS_PER_MINUTE / 2)
    }

    @Test
    fun `test that filling makes the window and nothing beyond it`() = runTest {
        val engine = FakeSpeechSynthesizer()
        val queue = queueWith(engine)
        queue.startReading(article(sentences = 200), "en-US")

        queue.moveWindowTo(playingChunk = 0)

        // The opening plus the chunks ahead of it. Nothing behind chunk 0 to keep.
        assertEquals(AUDIO_WINDOW_RADIUS + 1, engine.requests.size)
        (0..AUDIO_WINDOW_RADIUS).forEach { assertNotNull(queue.fileFor(it), "Chunk $it has no audio") }
        assertNull(queue.fileFor(AUDIO_WINDOW_RADIUS + 1))
    }

    @Test
    fun `test that a chunk which already has audio is not made again`() = runTest {
        val engine = FakeSpeechSynthesizer()
        val queue = queueWith(engine)
        queue.startReading(article(sentences = 200), "en-US")
        queue.moveWindowTo(playingChunk = 0)
        val made = engine.requests.size

        queue.moveWindowTo(playingChunk = 0)

        assertEquals(made, engine.requests.size)
    }

    @Test
    fun `test that running out of disk on a later chunk keeps what was already made`() = runTest {
        val engine = FakeSpeechSynthesizer(failAtRequest = 3, failWith = IOException("No space left on device"))
        val queue = queueWith(engine)
        queue.startReading(article(sentences = 200), "en-US")

        assertFailsWith<IOException> { queue.moveWindowTo(playingChunk = 0) }

        // The opening and the chunk after it still play, and nothing tried the failed one again.
        assertNotNull(queue.fileFor(0))
        assertNotNull(queue.fileFor(1))
        assertNull(queue.fileFor(2))
        assertEquals(3, engine.requests.size)
    }

    @Test
    fun `test that an engine failing on a later chunk keeps what was already made`() = runTest {
        val engine = FakeSpeechSynthesizer(failAtRequest = 3, failWith = SpeechSynthesisException(-7))
        val queue = queueWith(engine)
        queue.startReading(article(sentences = 200), "en-US")

        assertFailsWith<SpeechSynthesisException> { queue.moveWindowTo(playingChunk = 0) }

        assertNotNull(queue.fileFor(1))
        assertEquals(3, engine.requests.size)
    }

    @Test
    fun `test that cancelling part way through leaves the chunk with no audio`() = runTest {
        val engine = FakeSpeechSynthesizer(timePerRequest = 10.seconds)
        val queue = queueWith(engine)
        val opening =
            async(start = CoroutineStart.UNDISPATCHED) { queue.startReading(article(sentences = 40), "en-US") }

        advanceTimeBy(1.seconds)
        opening.cancelAndJoin()

        assertEquals(listOf(OPENING), engine.requests)
        assertNull("The chunk was left holding a file it never got", queue.fileFor(0))
    }

    @Test
    fun `test that audio which cannot be measured still leaves the article readable`() = runTest {
        val engine = FakeSpeechSynthesizer()
        val queue = queueWith(engine, audioLength = null)

        queue.startReading(article(sentences = 200), "en-US")
        queue.moveWindowTo(playingChunk = 0)

        // No rate to size the chunks in seconds, so they fall back to the engine's limit. Longer chunks, but the
        // article is still in pieces the engine accepts and the reader still hears it.
        assertTrue(queue.chunkCount > 1)
        engine.requests.forEach { assertTrue("Request of ${it.length}", it.length <= engine.maxInputLength) }
    }

    @Test
    fun `test that clearing throws away every chunk's audio and forgets the article`() = runTest {
        val engine = FakeSpeechSynthesizer()
        val queue = queueWith(engine)
        queue.startReading(article(sentences = 200), "en-US")
        queue.moveWindowTo(playingChunk = 0)
        val made = (0..AUDIO_WINDOW_RADIUS).mapNotNull { queue.fileFor(it) }

        queue.clear()

        assertEquals(made, cache.deleted)
        assertEquals(0, queue.chunkCount)
        assertNull(queue.fileFor(0))
    }

    @Test
    fun `test that the rate is taken from audio the engine really wrote`() = runTest {
        val engine = FakeSpeechSynthesizer(audioDirectory = temporaryFolder.root, audioDuration = OPENING_AUDIO)
        val queue =
            SynthesisQueue(
                synthesizer = engine,
                audio = ChunkAudio(cache),
                chunker = TextChunker.android(),
                workDispatcher = Dispatchers.Unconfined,
                elapsedMs = { testScheduler.currentTime },
            )

        queue.startReading(article(sentences = 200), "en-US")
        queue.moveWindowTo(playingChunk = 0)

        // The opening is 25 characters of 2.5 seconds, so ten a second, so a minute is 600. Without the measurement
        // this would have fallen back to the engine's 4000 and made one chunk of the article.
        assertTrue("Only ${queue.chunkCount} chunks", queue.chunkCount > 3)
        assertTrue("Chunk of ${engine.requests[1].length}", engine.requests[1].length <= CHARS_PER_MINUTE)
    }

    @Test
    fun `test that the system reclaiming the cache directory does not stop the article`() = runTest {
        // The design uses cacheDir, which the system empties whenever it wants the space back, so the files can go
        // while the article is still being read.
        val engine = FakeSpeechSynthesizer(audioDirectory = temporaryFolder.root, audioDuration = OPENING_AUDIO)
        val queue =
            SynthesisQueue(
                synthesizer = engine,
                audio = ChunkAudio(cache),
                chunker = TextChunker.android(),
                workDispatcher = Dispatchers.Unconfined,
                elapsedMs = { testScheduler.currentTime },
            )
        queue.startReading(article(sentences = 200), "en-US")

        temporaryFolder.root.deleteRecursively()

        // The chunks still to come are unaffected, because the engine writes a new file and the directory comes back
        // with it. Re-making the one that went is bug 2064868's, so until then its path is stale rather than refreshed
        // and this asserts only that the article has somewhere to carry on from.
        assertNotNull(queue.audioFor(1))
        assertFalse("The chunk that was reclaimed still reports a file", queue.fileFor(0)!!.exists())
    }

    @Test
    fun `test that every chunk made reports how long it lasts`() = runTest {
        val engine = FakeSpeechSynthesizer()
        val queue = queueWith(engine)
        queue.startReading(article(sentences = 200), "en-US")

        queue.moveWindowTo(playingChunk = 0)

        // The opening and everything the window made, not the opening alone. A progress bar covering the article has
        // to add up the real lengths of the chunks behind it.
        (0..AUDIO_WINDOW_RADIUS).forEach { assertEquals("Chunk $it", OPENING_AUDIO, queue.durationOf(it)) }
        assertNull(queue.durationOf(AUDIO_WINDOW_RADIUS + 1))
    }

    @Test
    fun `test that a chunk keeps its measured length after its audio is thrown away`() = runTest {
        val queue = queueWith(FakeSpeechSynthesizer())
        queue.startReading(article(sentences = 200), "en-US")
        queue.moveWindowTo(playingChunk = 0)

        // Far enough that chunk 0 falls out of the window, so its file goes.
        queue.moveWindowTo(playingChunk = AUDIO_WINDOW_RADIUS * 2 + 1)

        assertNull("The audio should have gone", queue.fileFor(0))
        assertEquals("Its length should not have", OPENING_AUDIO, queue.durationOf(0))
    }

    @Test
    fun `test that a chunk which could not be measured offers its characters instead`() = runTest {
        val queue = queueWith(FakeSpeechSynthesizer(), audioLength = null)
        queue.startReading(article(sentences = 200), "en-US")

        // Nothing to add up, so whoever is covering the article sizes this chunk from its text and the rate. There is
        // no rate either here, which is the case a caller has to expect rather than the unusual one.
        assertNull(queue.durationOf(0))
        assertNull(queue.speechRate)
        assertTrue("Chunk of ${queue.lengthOf(0)} characters", queue.lengthOf(0) > 0)
    }

    @Test
    fun `test that the rate measured from the opening is offered to whoever asks`() = runTest {
        val queue = queueWith(FakeSpeechSynthesizer())

        queue.startReading(article(sentences = 200), "en-US")

        // The opening is 25 characters of 2.5 seconds of audio, so ten a second.
        assertEquals(CHARS_PER_SECOND, queue.speechRate?.charsIn(1.seconds))
    }

    @Test
    fun `test that clearing forgets the lengths as well as the audio`() = runTest {
        val queue = queueWith(FakeSpeechSynthesizer())
        queue.startReading(article(sentences = 200), "en-US")

        queue.clear()

        assertNull(queue.durationOf(0))
        assertNull(queue.speechRate)
    }

    @Test
    fun `test that an article with nothing to read out is rejected rather than played`() = runTest {
        val queue = queueWith(FakeSpeechSynthesizer())

        assertFailsWith<NothingToReadException> { queue.startReading("\n\n\n", "en-US") }
    }

    @Test
    fun `test that audio measuring as no time at all still leaves the article readable`() = runTest {
        val engine = FakeSpeechSynthesizer()
        val queue = queueWith(engine, audioLength = Duration.ZERO)

        queue.startReading(article(sentences = 200), "en-US")
        queue.moveWindowTo(playingChunk = 0)

        assertTrue(queue.chunkCount > 1)
        engine.requests.forEach { assertTrue("Request of ${it.length}", it.length <= engine.maxInputLength) }
    }

    @Test
    fun `test that the chunks after the opening grow rather than jumping to a full one`() = runTest {
        val slow = FakeSpeechSynthesizer(timePerRequest = 2500.milliseconds)
        val queue = queueWith(slow)

        queue.startReading(article(sentences = 200), "en-US")
        queue.moveWindowTo(playingChunk = 0)

        assertTrue("Chunk of ${slow.requests[1].length}", slow.requests[1].length < CHARS_PER_MINUTE / 2)
        assertTrue(
            "Chunks of ${slow.requests[1].length} then ${slow.requests[2].length}",
            slow.requests[2].length > slow.requests[1].length,
        )
    }

    @Test
    fun `test that growing to a full chunk still reads the whole article`() = runTest {
        val engine = FakeSpeechSynthesizer(timePerRequest = 2500.milliseconds)
        val queue = queueWith(engine)
        val text = article(sentences = 200)

        queue.startReading(text, "en-US")
        (1 until queue.chunkCount).forEach { queue.audioFor(it) }

        // Every chunk of the article, in order, with nothing dropped where one piece was cut off the front of another.
        assertEquals(
            text.filterNot { it.isWhitespace() },
            engine.requests.joinToString("").filterNot { it.isWhitespace() },
        )
    }

    @Test
    fun `test that a first sentence too long for one request is sized like the rest of the article`() = runTest {
        val engine = FakeSpeechSynthesizer()
        val queue =
            SynthesisQueue(
                synthesizer = engine,
                audio = ChunkAudio(cache),
                chunker = TextChunker.android(),
                workDispatcher = Dispatchers.Unconfined,
                measureAudio = { (engine.requests.last().length / CHARS_PER_SECOND).seconds },
                elapsedMs = { testScheduler.currentTime },
            )
        val openingSentence = "word ".repeat(1200).trim() + " and then it ends."

        queue.startReading("$openingSentence ${article(sentences = 100)}", "en-US")
        queue.moveWindowTo(playingChunk = 0)

        assertTrue("Only ${queue.chunkCount} chunks", queue.chunkCount > 3)
        engine.requests.drop(1).forEach {
            assertTrue("Chunk of ${it.length} characters", it.length <= CHARS_PER_MINUTE)
        }
    }

    @Test
    fun `test that asking for a chunk the window never made makes that one and no more`() = runTest {
        val engine = FakeSpeechSynthesizer()
        val queue = queueWith(engine)
        queue.startReading(article(sentences = 200), "en-US")
        val opening = engine.requests.size

        val file = queue.audioFor(1)

        // A reader waiting on this chunk must not also be made to wait for the chunks beyond it.
        assertNotNull(file)
        assertEquals(opening + 1, engine.requests.size)
    }

    @Test
    fun `test that asking past the last chunk has no audio rather than failing`() = runTest {
        val engine = FakeSpeechSynthesizer()
        val queue = queueWith(engine)
        queue.startReading("The only sentence there is.", "en-US")

        assertNull(queue.audioFor(queue.chunkCount))
        assertEquals(1, engine.requests.size)
    }

    @Test
    fun `test that a chunk the window already made is not made again for a reader reaching it`() = runTest {
        val engine = FakeSpeechSynthesizer()
        val queue = queueWith(engine)
        queue.startReading(article(sentences = 200), "en-US")
        queue.moveWindowTo(playingChunk = 0)
        val made = engine.requests.size

        assertEquals(queue.fileFor(1), queue.audioFor(1))
        assertEquals(made, engine.requests.size)
    }

    private fun TestScope.queueWith(
        engine: FakeSpeechSynthesizer,
        audioLength: Duration? = OPENING_AUDIO,
    ) =
        SynthesisQueue(
            synthesizer = engine,
            audio = ChunkAudio(cache),
            chunker = TextChunker.android(),
            workDispatcher = Dispatchers.Unconfined,
            measureAudio = { audioLength },
            elapsedMs = { testScheduler.currentTime },
        )

    private fun article(sentences: Int) = (1..sentences).joinToString(" ") { "Sentence $it is right here." }

    private fun Double.secondsOfSpeech() = (this * CHARS_PER_SECOND).toInt()
}
