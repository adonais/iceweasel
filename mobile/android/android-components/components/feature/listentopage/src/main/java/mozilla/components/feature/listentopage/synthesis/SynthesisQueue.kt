/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.synthesis

import android.os.SystemClock
import java.io.File
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mozilla.components.feature.listentopage.ArticleProgress
import mozilla.components.feature.listentopage.content.TextChunker
import mozilla.components.feature.listentopage.playback.ChunkAudio
import mozilla.components.feature.listentopage.playback.ProgressMapper
import mozilla.components.feature.listentopage.playback.audioWindow

/** Thrown when the article holds nothing that can be read out loud. */
internal class NothingToReadException : Exception("The article has no words to read out")

/**
 * Decides which piece of the article the engine works on next, and keeps the audio of the pieces around the one playing
 * on disk.
 *
 * @param synthesizer The engine. Its input limit caps every request.
 * @param audio Where the audio of each chunk is kept and thrown away.
 * @param chunker Splits the article.
 * @param workDispatcher The dispatcher for the work that must not run on the thread a caller dispatched on.
 * @param measureAudio How long the audio in a file lasts, or `null` when it cannot be read.
 * @param elapsedMs Reads a monotonic clock, so that how long a request took can be measured under a test's virtual time
 *   as well as a device's real one.
 */
internal class SynthesisQueue(
    private val synthesizer: SpeechSynthesizer,
    private val audio: ChunkAudio,
    private val chunker: TextChunker,
    private val workDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val measureAudio: suspend (File) -> Duration? = { readWavDurationOrNull(it) },
    private val elapsedMs: () -> Long = SystemClock::elapsedRealtime,
) {

    private var chunks: List<String> = emptyList()

    // How long each chunk made so far lasts.
    private val measured = mutableMapOf<Int, Duration>()

    /** How many pieces the article came to, or `0` until [startReading] has run. */
    val chunkCount: Int
        get() = chunks.size

    /** What the opening measured at, or `null` when it could not be measured. */
    var speechRate: SpeechRate? = null
        private set

    /**
     * How long chunk [index] lasts, or `null` while it has not been measured.
     *
     * A chunk can have audio and no duration, because the file is added before it is read, so this being `null` does
     * not mean [fileFor] is too. Size such a chunk from [lengthOf] and [speechRate] instead.
     */
    fun durationOf(index: Int): Duration? = measured[index]

    /** The characters in chunk [index], for sizing one that has no measured duration. */
    fun lengthOf(index: Int): Int = chunks[index].length

    /**
     * Synthesizes the opening of [text] and returns its audio, then works out how the rest of it divides up.
     *
     * The first request is one sentence, because how fast this voice reads is not known until its audio exists. Once it
     * does, the rest is sized in seconds from that measurement rather than from a table of languages.
     *
     * @throws NothingToReadException if [text] holds no words, in which case there is nothing to play and the session
     *   has no article rather than a failed one.
     * @throws SpeechSynthesisException if the engine cannot make the opening, in which case there is nothing to play
     *   and the session has failed.
     */
    suspend fun startReading(text: String, languageTag: String): File {
        val split =
            withContext(workDispatcher) { chunker.splitFirstSentence(text, languageTag, synthesizer.maxInputLength) }
        val opening = split.firstChunks.firstOrNull() ?: throw NothingToReadException()

        val startedAt = elapsedMs()
        val file = synthesizer.synthesizeToFile(opening)
        val synthesisMs = elapsedMs() - startedAt
        audio.add(0, file)

        // A file the system reclaimed, and one an interrupted request left behind, both measure as no audio at all.
        // That is not a rate, so it has to read the same as a file whose header could not be understood.
        val audioLength = measure(0, file)
        val rate = audioLength?.let { SpeechRate.measuredFrom(opening.length, it) }
        speechRate = rate

        chunks =
            withContext(workDispatcher) {
                listOf(opening) + chunksAfterOpening(split, languageTag, rate, audioLength, synthesisMs)
            }

        return file
    }

    /**
     * The audio of chunk [index], making it now if the window has not got to it yet, or `null` when the article has no
     * such chunk and so has ended.
     *
     * @throws SpeechSynthesisException if the engine cannot make it.
     */
    suspend fun audioFor(index: Int): File? {
        if (index !in chunks.indices) return null

        return audio.fileFor(index) ?: make(index)
    }

    /**
     * Moves the window of chunks kept on disk to sit around [playingChunk], making what it is missing and throwing away
     * what has fallen outside it.
     *
     * @throws SpeechSynthesisException if the engine cannot make one of them. What was made before it stays, so
     *   playback carries on as far as it can, and the chunk it stopped on is made again by [audioFor] if playback ever
     *   reaches it.
     */
    suspend fun moveWindowTo(playingChunk: Int) {
        val window = audioWindow(playingChunk, chunks.size)
        audio.keepOnly(window)

        for (index in window) {
            if (audio.fileFor(index) != null) continue

            make(index)
        }
    }

    /** The audio of chunk [index], or `null` when it has not been made or has been thrown away. */
    fun fileFor(index: Int): File? = audio.fileFor(index)

    /** Throws away every chunk's audio and forgets the article. */
    suspend fun clear() {
        chunks = emptyList()
        measured.clear()
        speechRate = null
        audio.clear()
    }

    fun progress(
        previous: ArticleProgress,
        playingChunk: Int,
        chunkPositionMs: Long,
        chunkEnded: Boolean,
    ): ArticleProgress = mapper().progress(previous, playingChunk, chunkPositionMs, chunkEnded)

    fun mapper() = ProgressMapper(chunkCount, ::durationOf, ::lengthOf, speechRate)

    /**
     * Makes chunk [index] and measures what came back. The one place a chunk is made, so neither caller can skip it.
     */
    private suspend fun make(index: Int): File {
        val file = synthesizer.synthesizeToFile(chunks[index])
        audio.add(index, file)
        measure(index, file)

        return file
    }

    /**
     * Records how long the audio in [file] lasts, and reports it.
     *
     * A file the system reclaimed, and one an interrupted request left behind, both measure as no audio at all. That is
     * not a duration, so it has to read the same as a file whose header could not be understood.
     */
    private suspend fun measure(index: Int, file: File): Duration? =
        withContext(workDispatcher) { measureAudio(file) }?.takeIf { it > Duration.ZERO }?.also { measured[index] = it }

    /**
     * The article after its opening, in chunks of [CHUNK_TARGET], growing up to it from what this device managed while
     * the opening played.
     */
    private fun chunksAfterOpening(
        split: SplitArticle,
        languageTag: String,
        rate: SpeechRate?,
        openingLength: Duration?,
        synthesisMs: Long,
    ): List<String> {
        val rest =
            split.firstChunks.drop(1).flatMap { chunksOf(it, languageTag, rate) } +
                chunksOf(split.remainingText, languageTag, rate)

        val firstTarget = firstChunkTarget(openingLength, synthesisMs)
        if (rate == null || firstTarget == null || rest.isEmpty()) {
            return rest
        }

        return growingChunksOf(rest.first(), languageTag, rate, firstTarget) + rest.drop(1)
    }

    /** The chunks of [text] at [rate], within whatever the engine accepts in one request. */
    private fun chunksOf(text: String, languageTag: String, rate: SpeechRate?) =
        if (rate == null) {
            chunker.chunk(text, synthesizer.maxInputLength, languageTag)
        } else {
            chunker.chunkByDuration(text, languageTag, rate, synthesizer.maxInputLength)
        }

    /** [chunk] cut into pieces that grow from [firstTarget] towards [CHUNK_TARGET], doubling each time. */
    private fun growingChunksOf(
        chunk: String,
        languageTag: String,
        rate: SpeechRate,
        firstTarget: Duration,
    ): List<String> {
        val growing = mutableListOf<String>()
        var rest = chunk
        var target = firstTarget

        while (rest.isNotEmpty() && target < CHUNK_TARGET) {
            val piece =
                chunker.chunkByDuration(rest, languageTag, rate, synthesizer.maxInputLength, target).firstOrNull()
                    ?: break
            val remainder = rest.removePrefix(piece).trimStart()

            // A piece holding all that is left, or one the chunker did not take off the front, stops the growing. What
            // is left then goes out whole rather than being cut again, so that no part of the article is dropped.
            if (remainder.isEmpty() || remainder.length == rest.length) break

            growing += piece
            rest = remainder
            target *= 2
        }

        return if (rest.isEmpty()) growing else growing + rest
    }

    /**
     * How long the first chunk after the opening should be, or `null` to let it have the full [CHUNK_TARGET].
     *
     * It is the audio this device produced while the opening played, so the chunk after the opening is one the device
     * has shown it can make in time. Every chunk after it grows from here.
     */
    private fun firstChunkTarget(playedFor: Duration?, synthesisTookMs: Long): Duration? {
        if (playedFor == null || synthesisTookMs <= 0) {
            return null
        }

        val producedPerMs = playedFor.inWholeMilliseconds.toDouble() / synthesisTookMs

        return (playedFor * producedPerMs).coerceAtLeast(MIN_FIRST_TARGET).takeIf { it < CHUNK_TARGET }
    }

    private companion object {
        // A floor under the first chunk, so that an engine which measured badly does not start on a chunk of a word or
        // two and spend more of the article growing than reading.
        val MIN_FIRST_TARGET = 5.seconds
    }
}

private fun readWavDurationOrNull(file: File): Duration? = runCatching { readWavAudio(file) }.getOrNull()?.duration
