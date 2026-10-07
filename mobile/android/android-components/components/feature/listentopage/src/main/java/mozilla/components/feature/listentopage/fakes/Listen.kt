/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.fakes

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import mozilla.components.feature.listentopage.PlaybackPhase
import mozilla.components.feature.listentopage.PlaybackState
import mozilla.components.feature.listentopage.Voice
import mozilla.components.feature.listentopage.playback.ArticleDisplayData
import mozilla.components.feature.listentopage.playback.AudioFileCache
import mozilla.components.feature.listentopage.playback.PlaybackController
import mozilla.components.feature.listentopage.synthesis.SpeechSynthesisException
import mozilla.components.feature.listentopage.synthesis.SpeechSynthesizer

private const val FAKE_ENGINE_ERROR = -1

/**
 * A fake implementation of [SpeechSynthesizer] for use in tests and Compose previews.
 *
 * It never touches the speech engine, and by default it never writes a file either: it names one and records what it
 * was asked to say.
 *
 * @property maxInputLength The limit to report. Set it low to exercise a caller's chunking.
 * @property voices The voices to offer for every language tag. Set it empty to exercise a caller's no-voice handling.
 * @property audioDirectory Where to write the audio, or `null` to name a file without creating one.
 * @property audioDuration How long the audio it writes lasts. Ignored without an [audioDirectory].
 * @property timePerRequest How long a request takes. Set it to make synthesis slow enough for a caller to be seen
 *   falling behind what is playing, which is otherwise instantaneous and so never behind.
 * @property failAtRequest The request to fail, counting from one, or `null` to fail none. A caller's handling of a
 *   chunk failing part way through an article cannot be exercised by an engine that fails from the start, because the
 *   article never gets going.
 * @property failWith What to fail that request with.
 * @property requests The text of every request, in the order it arrived.
 * @property files Every file it wrote, in the order it wrote them, so a test can name the ones a session left behind.
 * @property voiceRequests The language tag of every voice lookup, in the order it arrived.
 * @property closed Whether [close] has been called.
 * @property enginePackageName The engine to report
 * @property voicesSet Every voice the engine was told to read with, in order.
 */
class FakeSpeechSynthesizer(
    override val maxInputLength: Int = 4000,
    private val voices: List<Voice> = listOf(Voice(id = "voice-1", locale = Locale.US)),
    override val enginePackageName: String = "com.example.tts",
    private val audioDirectory: File? = null,
    private val audioDuration: Duration = 5.seconds,
    private val timePerRequest: Duration = Duration.ZERO,
    private val failAtRequest: Int? = null,
    private val failWith: Exception = SpeechSynthesisException(FAKE_ENGINE_ERROR),
) : SpeechSynthesizer {
    val requests = mutableListOf<String>()
    val files = mutableListOf<File>()
    val voiceRequests = mutableListOf<String>()
    var closed = false
    val voicesSet = mutableListOf<Voice>()

    override suspend fun synthesizeToFile(text: String): File {
        requests.add(text)
        delay(timePerRequest)
        if (requests.size == failAtRequest) {
            throw failWith
        }

        val named = File(audioDirectory ?: File("/audio"), "${requests.size}.wav")

        // The directory is made here rather than once, because a caller emptying its cache deletes the directory
        // itself and the real cache makes it again on the next request.
        files.add(named)

        return named.also {
            if (audioDirectory != null) {
                audioDirectory.mkdirs()
                it.writeBytes(silentWav(audioDuration))
            }
        }
    }

    override suspend fun setVoice(voice: Voice) {
        voicesSet.add(voice)
    }

    override fun close() {
        closed = true
    }

    override suspend fun loadAvailableVoices(langTag: String): List<Voice> {
        voiceRequests.add(langTag)
        return voices
    }
}

/**
 * A fake implementation of [AudioFileCache] for use in tests and Compose previews.
 *
 * It names files without creating them, so nothing has to clean up after it.
 *
 * @property cleared Whether [clear] has been called.
 * @property deleted Every file it was asked to delete, in order.
 */
class FakeAudioFileCache : AudioFileCache {
    var cleared = false
    val deleted = mutableListOf<File>()

    override suspend fun create(key: String): File = File("/audio/$key.wav")

    override suspend fun delete(file: File) {
        deleted.add(file)
    }

    override suspend fun clear() {
        cleared = true
    }
}

/**
 * A fake implementation of [PlaybackController] for use in tests and Compose previews.
 *
 * It records what it was asked to play rather than starting a media session.
 *
 * @property played Every file it was asked to play, in order.
 * @property queued Every file it was asked to queue behind what is playing, in order. A caller's joins are only gapless
 *   for the chunks that reach this rather than [played], which replaces what is playing.
 * @property displayData What each file in the playlist says it is, in the order the files were handed over.
 * @property resumed How many times [resume] has been called.
 * @property released Whether [release] has been called.
 * @property status What to report about the playback. Set it to drive a caller's monitoring, including changes no
 *   command of theirs asked for.
 * @property positionMs The position to report as reached.
 * @property seekedTo Every position it was asked to move to, in order.
 */
class FakePlaybackController(var positionMs: Long = 0L) : PlaybackController {
    val played = mutableListOf<File>()
    val queued = mutableListOf<File>()
    val displayDataList = mutableListOf<ArticleDisplayData>()
    var resumed = 0
    val seekedTo = mutableListOf<Long>()
    val seekedToItem = mutableListOf<Pair<Int, Long>>()
    val restartedAt = mutableListOf<Pair<File, Long>>()
    var released = false

    override val status = MutableStateFlow(PlaybackState())

    // What the article now playing says it is, as the real controller keeps it.
    private var displayData: ArticleDisplayData? = null

    override suspend fun play(file: File, articleDisplayData: ArticleDisplayData) {
        displayData = articleDisplayData
        played.add(file)
        displayDataList.add(articleDisplayData)

        status.value = PlaybackState(phase = PlaybackPhase.Buffering)
    }

    override suspend fun enqueue(file: File) {
        val displayData = displayData ?: return
        queued.add(file)
        displayDataList.add(displayData)
    }

    override suspend fun pause() = Unit

    override suspend fun resume() {
        resumed += 1
    }

    override suspend fun seekTo(positionMs: Long) {
        seekedTo.add(positionMs)
    }

    override suspend fun seekTo(itemIndex: Int, positionMs: Long) {
        seekedToItem.add(itemIndex to positionMs)
    }

    override suspend fun restartAt(file: File, positionMs: Long) {
        restartedAt.add(file to positionMs)
        played.add(file)
    }

    override suspend fun release() {
        released = true
        displayData = null
        status.value = PlaybackState()
    }

    override suspend fun currentPositionMs(): Long = positionMs
}

/** A WAV file of [duration]'s worth of silence, in the format the platform engine was measured producing. */
private fun silentWav(duration: Duration): ByteArray {
    val sampleBytes = (duration.inWholeMilliseconds * BYTES_PER_SECOND / MILLIS_PER_SECOND).toInt()
    val buffer = ByteBuffer.allocate(RIFF_HEADER_BYTES + sampleBytes).order(ByteOrder.LITTLE_ENDIAN)

    buffer.put("RIFF".toByteArray(Charsets.US_ASCII))
    buffer.putInt(RIFF_HEADER_BYTES - RIFF_TAG_AND_SIZE_BYTES + sampleBytes)
    buffer.put("WAVE".toByteArray(Charsets.US_ASCII))

    buffer.put("fmt ".toByteArray(Charsets.US_ASCII))
    buffer.putInt(FORMAT_CHUNK_BYTES)
    buffer.putShort(PCM_ENCODING)
    buffer.putShort(CHANNELS)
    buffer.putInt(SAMPLE_RATE)
    buffer.putInt(BYTES_PER_SECOND)
    buffer.putShort(BYTES_PER_FRAME)
    buffer.putShort(BITS_PER_SAMPLE)

    buffer.put("data".toByteArray(Charsets.US_ASCII))
    buffer.putInt(sampleBytes)

    // The samples are left as they were allocated, which for silence is what they should be anyway.
    return buffer.array()
}

// 24 kHz, 16-bit, mono, which is what both measured devices produced for every language and every voice.
private const val SAMPLE_RATE = 24_000
private const val BYTES_PER_SECOND = 48_000
private const val MILLIS_PER_SECOND = 1_000
private const val PCM_ENCODING: Short = 1
private const val CHANNELS: Short = 1
private const val BITS_PER_SAMPLE: Short = 16
private const val BYTES_PER_FRAME: Short = 2

private const val FORMAT_CHUNK_BYTES = 16
private const val RIFF_TAG_AND_SIZE_BYTES = 8
private const val RIFF_HEADER_BYTES = 44
