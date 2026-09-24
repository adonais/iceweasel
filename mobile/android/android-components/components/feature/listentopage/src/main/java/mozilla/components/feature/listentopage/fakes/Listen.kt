/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.fakes

import java.io.File
import mozilla.components.feature.listentopage.Voice
import mozilla.components.feature.listentopage.playback.AudioFileCache
import mozilla.components.feature.listentopage.playback.PlaybackController
import mozilla.components.feature.listentopage.synthesis.SpeechSynthesizer

/**
 * A fake implementation of [SpeechSynthesizer] for use in tests and Compose previews.
 *
 * It never touches the speech engine and never writes a file: it names one and records what it was asked to say. Bug
 * 2064845 adds the delay and the fail-at-call behaviour that the synthesis queue needs.
 *
 * @property maxInputLength The limit to report. Set it low to exercise a caller's chunking.
 * @property voices The voices to offer for every language tag. Set it empty to exercise a caller's no-voice handling.
 * @property requests The text of every request, in the order it arrived.
 * @property voiceRequests The language tag of every voice lookup, in the order it arrived.
 * @property closed Whether [close] has been called.
 */
class FakeSpeechSynthesizer(
    override val maxInputLength: Int = 4000,
    private val voices: List<Voice> = listOf(Voice(id = "voice-1")),
) : SpeechSynthesizer {
    val requests = mutableListOf<String>()
    val voiceRequests = mutableListOf<String>()
    var closed = false

    override suspend fun synthesizeToFile(text: String): File {
        requests.add(text)
        return File("/audio/${requests.size}.wav")
    }

    override fun close() {
        closed = true
    }

    override fun loadAvailableVoices(langTag: String): List<Voice> {
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
 */
class FakeAudioFileCache : AudioFileCache {
    var cleared = false

    override suspend fun create(key: String): File = File("/audio/$key.wav")

    override suspend fun delete(file: File) = Unit

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
 * @property released Whether [release] has been called.
 */
class FakePlaybackController : PlaybackController {
    val played = mutableListOf<File>()
    var released = false

    override suspend fun play(file: File) {
        played.add(file)
    }

    override suspend fun pause() = Unit

    override suspend fun resume() = Unit

    override suspend fun seekTo(positionMs: Long) = Unit

    override suspend fun release() {
        released = true
    }
}
