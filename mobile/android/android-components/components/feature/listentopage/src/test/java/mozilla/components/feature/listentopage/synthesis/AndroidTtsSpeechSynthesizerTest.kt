/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.synthesis

import android.speech.tts.TextToSpeech
import android.speech.tts.Voice as TtsVoice
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import java.util.Locale
import kotlin.test.assertIs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.runTest
import mozilla.components.feature.listentopage.Voice
import mozilla.components.feature.listentopage.playback.DirectoryAudioFileCache
import mozilla.components.support.test.robolectric.testContext
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowTextToSpeech

private const val NOT_INSTALLED = TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED

@RunWith(AndroidJUnit4::class)
class AndroidTtsSpeechSynthesizerTest {

    @get:Rule val temporaryFolder = TemporaryFolder()

    // Unconfined so that the file work runs in place. The tests that deliver the engine callbacks themselves rely on
    // the request having reached the engine before they fire one.
    private val cache by lazy { DirectoryAudioFileCache({ temporaryFolder.root }, Dispatchers.Unconfined) }

    // Built on first use rather than in a @Before, because the synthesis tests need to fire the init callback on an
    // engine of their own and a second instance here would be the one the shadow reports as the last.
    private val synthesizer by lazy { AndroidTtsSpeechSynthesizer(testContext, cache, Dispatchers.Unconfined) }

    @After
    fun tearDown() {
        ShadowTextToSpeech.reset()
    }

    @Test
    fun `test that a voice needing a network connection is not offered`() {
        installVoice("en-us-network", Locale.US, requiresNetwork = true)

        assertEquals(emptyList<Voice>(), synthesizer.loadAvailableVoices("en-US"))
    }

    @Test
    fun `test that a voice that is not installed on the device is not offered`() {
        installVoice("en-us-absent", Locale.US, features = setOf(NOT_INSTALLED))

        assertEquals(emptyList<Voice>(), synthesizer.loadAvailableVoices("en-US"))
    }

    @Test
    fun `test that only the offline voices are offered when the engine mixes them`() {
        installVoice("en-us-offline", Locale.US)
        installVoice("en-us-network", Locale.US, requiresNetwork = true)
        installVoice("en-us-absent", Locale.US, features = setOf(NOT_INSTALLED))

        assertEquals(listOf(Voice(id = "en-us-offline")), synthesizer.loadAvailableVoices("en-US"))
    }

    @Test
    fun `test that every offline voice of the matched language is offered`() {
        installVoice("en-us-gonzo", Locale.US)
        installVoice("en-us-animal", Locale.US)
        installVoice("de-de-gonzo", Locale.GERMANY)

        val voices = synthesizer.loadAvailableVoices("en-US")

        assertEquals(setOf(Voice(id = "en-us-gonzo"), Voice(id = "en-us-animal")), voices.toSet())
    }

    @Test
    fun `test that the exact region is preferred over another region of the same language`() {
        installVoice("en-gb-gonzo", Locale.UK)
        installVoice("en-us-gonzo", Locale.US)

        assertEquals(listOf(Voice(id = "en-gb-gonzo")), synthesizer.loadAvailableVoices("en-GB"))
    }

    @Test
    fun `test that another region of the same language is used when the exact region has none`() {
        installVoice("en-us-gonzo", Locale.US)

        assertEquals(listOf(Voice(id = "en-us-gonzo")), synthesizer.loadAvailableVoices("en-GB"))
    }

    @Test
    fun `test that a language with no offline voice is offered nothing`() {
        installVoice("de-de-gonzo", Locale.GERMANY)

        assertEquals(emptyList<Voice>(), synthesizer.loadAvailableVoices("ja-JP"))
    }

    @Test
    fun `test that an engine with no voices at all offers nothing`() {
        assertEquals(emptyList<Voice>(), synthesizer.loadAvailableVoices("en-US"))
    }

    @Test
    fun `test that a malformed language tag is offered nothing rather than throwing`() {
        installVoice("en-us-gonzo", Locale.US)

        assertEquals(emptyList<Voice>(), synthesizer.loadAvailableVoices("not a language tag"))
    }

    @Test
    fun `test that an empty language tag is offered nothing rather than throwing`() {
        installVoice("en-us-gonzo", Locale.US)

        assertEquals(emptyList<Voice>(), synthesizer.loadAvailableVoices(""))
    }

    @Test
    fun `test that voices are ranked by quality first and then by latency`() {
        installVoice("normal-fast", Locale.US, quality = TtsVoice.QUALITY_NORMAL, latency = TtsVoice.LATENCY_LOW)
        installVoice("high-slow", Locale.US, quality = TtsVoice.QUALITY_HIGH, latency = TtsVoice.LATENCY_HIGH)
        installVoice("high-fast", Locale.US, quality = TtsVoice.QUALITY_HIGH, latency = TtsVoice.LATENCY_LOW)
        installVoice("low-fast", Locale.US, quality = TtsVoice.QUALITY_LOW, latency = TtsVoice.LATENCY_VERY_LOW)

        assertEquals(
            listOf(Voice("high-fast"), Voice("high-slow"), Voice("normal-fast"), Voice("low-fast")),
            synthesizer.loadAvailableVoices("en-US"),
        )
    }

    @Test
    fun `test that voices of equal quality and latency are ranked by name`() {
        installVoice("en-us-zeta", Locale.US)
        installVoice("en-us-alpha", Locale.US)

        assertEquals(listOf(Voice("en-us-alpha"), Voice("en-us-zeta")), synthesizer.loadAvailableVoices("en-US"))
    }

    @Test
    fun `test that a synthesized utterance is returned as a file in the cache`() = runTest {
        val synthesizer = synthesizerWith(engineStatus = TextToSpeech.SUCCESS)

        val file = synthesizer.synthesizeToFile("Article text")

        assertEquals(temporaryFolder.root, file.parentFile)
        assertTrue(file.exists())
        assertEquals("Article text", engineShadow().lastSynthesizeToFileText)
    }

    @Test
    fun `test that every utterance gets its own file`() = runTest {
        val synthesizer = synthesizerWith(engineStatus = TextToSpeech.SUCCESS)

        val first = synthesizer.synthesizeToFile("First")
        val second = synthesizer.synthesizeToFile("Second")

        assertNotEquals(first, second)
    }

    @Test
    fun `test that a failure to start the engine is reported and nothing is synthesized`() = runTest {
        val synthesizer = synthesizerWith(engineStatus = TextToSpeech.ERROR)

        val failure = synthesizer.synthesisFailure("Article text")

        assertEquals(TextToSpeech.ERROR, failure.errorCode)
        assertNull(engineShadow().lastSynthesizeToFileText)
    }

    @Test
    fun `test that an engine error carries its code and leaves no audio behind`() = runTest {
        val synthesizer =
            synthesizerWith(
                engineStatus = TextToSpeech.SUCCESS,
                synthesisResult = TextToSpeech.ERROR_SYNTHESIS,
            )

        val failure = synthesizer.synthesisFailure("Article text")

        assertEquals(TextToSpeech.ERROR_SYNTHESIS, failure.errorCode)
        assertEquals(emptyList<String>(), temporaryFolder.root.list().orEmpty().toList())
    }

    // The engine only reaches for the network when it has no offline voice for the language, so both network codes are
    // reported as a missing offline voice rather than as a generic synthesis failure.
    @Test
    fun `test that a network error is reported as a missing offline voice and leaves no audio behind`() = runTest {
        val synthesizer =
            synthesizerWith(
                engineStatus = TextToSpeech.SUCCESS,
                synthesisResult = TextToSpeech.ERROR_NETWORK,
            )

        synthesizer.noOfflineVoiceFailure("Article text")

        assertEquals(emptyList<String>(), temporaryFolder.root.list().orEmpty().toList())
    }

    @Test
    fun `test that a network timeout is reported as a missing offline voice and leaves no audio behind`() = runTest {
        val synthesizer =
            synthesizerWith(
                engineStatus = TextToSpeech.SUCCESS,
                synthesisResult = TextToSpeech.ERROR_NETWORK_TIMEOUT,
            )

        synthesizer.noOfflineVoiceFailure("Article text")

        assertEquals(emptyList<String>(), temporaryFolder.root.list().orEmpty().toList())
    }

    @Test
    fun `test that text longer than the engine accepts is rejected before anything is written`() = runTest {
        val synthesizer = synthesizerWith(engineStatus = TextToSpeech.SUCCESS)

        val failure = runCatching {
            synthesizer.synthesizeToFile("a".repeat(synthesizer.maxInputLength + 1))
        }
            .exceptionOrNull()

        assertIs<IllegalArgumentException>(failure)
        assertNull(engineShadow().lastSynthesizeToFileText)
    }

    @Test
    fun `test that a result for another utterance is ignored`() = runTest {
        val pending = startPendingSynthesis()

        engineShadow().utteranceProgressListener.onError("another-utterance", TextToSpeech.ERROR_SYNTHESIS)
        engineShadow().utteranceProgressListener.onDone("another-utterance")

        assertTrue(pending.isActive)

        engineShadow().utteranceProgressListener.onDone(lastUtteranceId())

        assertEquals(engineShadow().lastSynthesizeToFile, pending.await().getOrThrow())
    }

    // The engine can report one failure two times, so the second report must not resume the request again. Were the
    // guard against that gone, the listener call below would throw IllegalStateException and fail this test.
    @Test
    fun `test that an error after the utterance finished is ignored`() = runTest {
        val synthesizer = synthesizerWith(engineStatus = TextToSpeech.SUCCESS)

        val file = synthesizer.synthesizeToFile("Article text")
        engineShadow().utteranceProgressListener.onError(lastUtteranceId(), TextToSpeech.ERROR_SYNTHESIS)

        assertTrue(file.exists())
    }

    @Test
    fun `test that a completion after the utterance failed is ignored`() = runTest {
        val synthesizer =
            synthesizerWith(
                engineStatus = TextToSpeech.SUCCESS,
                synthesisResult = TextToSpeech.ERROR_SYNTHESIS,
            )

        val failure = synthesizer.synthesisFailure("Article text")
        engineShadow().utteranceProgressListener.onDone(lastUtteranceId())

        assertEquals(TextToSpeech.ERROR_SYNTHESIS, failure.errorCode)
    }

    @Test
    @Suppress("DEPRECATION")
    fun `test that an error without a code is reported as a generic error`() = runTest {
        val pending = startPendingSynthesis()

        engineShadow().utteranceProgressListener.onError(lastUtteranceId())

        assertEquals(TextToSpeech.ERROR, pending.awaitFailure().errorCode)
        assertEquals(emptyList<String>(), temporaryFolder.root.list().orEmpty().toList())
    }

    @Test
    fun `test that cancelling stops the engine and leaves the audio behind`() = runTest {
        val pending = startPendingSynthesis()
        val file = engineShadow().lastSynthesizeToFile

        pending.cancelAndJoin()

        assertTrue(engineShadow().isStopped)
        assertTrue(file.exists())
    }

    @Test
    fun `test that closing shuts the engine down`() = runTest {
        val synthesizer = synthesizerWith(engineStatus = TextToSpeech.SUCCESS)

        synthesizer.close()

        assertTrue(engineShadow().isShutdown)
    }

    // The engine keeps one listener for every request, so a second request must not cost the first one its callbacks.
    @Test
    fun `test that two requests at once each get their own result`() = runTest {
        val synthesizer = AndroidTtsSpeechSynthesizer(testContext, cache, Dispatchers.Unconfined)
        engineShadow().onInitListener.onInit(TextToSpeech.SUCCESS)

        val first = async(start = CoroutineStart.UNDISPATCHED) { synthesizer.synthesizeToFile("First") }
        val firstId = lastUtteranceId()
        val second = async(start = CoroutineStart.UNDISPATCHED) { synthesizer.synthesizeToFile("Second") }
        val secondId = lastUtteranceId()

        assertNotEquals(firstId, secondId)

        engineShadow().utteranceProgressListener.onDone(secondId)
        engineShadow().utteranceProgressListener.onDone(firstId)

        assertEquals(firstId, first.await().nameWithoutExtension)
        assertEquals(secondId, second.await().nameWithoutExtension)
    }

    /**
     * Builds a synthesizer that reports [synthesisResult] for every request, and fires the init callback, which the
     * shadow does not fire on its own because the real engine delivers it asynchronously.
     *
     * The shadow reports [synthesisResult] through the utterance listener rather than from `synthesizeToFile`, which
     * always returns success. The path that rejects a failed return value therefore cannot be reached from here.
     */
    private fun synthesizerWith(engineStatus: Int, synthesisResult: Int = TextToSpeech.SUCCESS): SpeechSynthesizer {
        val synthesizer = AndroidTtsSpeechSynthesizer(testContext, cache, Dispatchers.Unconfined)

        engineShadow().simulateSynthesizeToFileResult(synthesisResult)
        engineShadow().onInitListener.onInit(engineStatus)

        return synthesizer
    }

    /**
     * Starts a request that stays pending, so that a test can deliver the engine callbacks itself: without a call to
     * [ShadowTextToSpeech.simulateSynthesizeToFileResult] the shadow reports no result of its own.
     * [CoroutineStart.UNDISPATCHED] runs the request as far as its suspension point, so the engine already holds the
     * text when this returns.
     */
    private fun CoroutineScope.startPendingSynthesis(text: String = "Article text"): Deferred<Result<File>> {
        val synthesizer = AndroidTtsSpeechSynthesizer(testContext, cache, Dispatchers.Unconfined)

        engineShadow().onInitListener.onInit(TextToSpeech.SUCCESS)

        return async(start = CoroutineStart.UNDISPATCHED) { runCatching { synthesizer.synthesizeToFile(text) } }
    }

    private fun engineShadow(): ShadowTextToSpeech = shadowOf(ShadowTextToSpeech.getLastTextToSpeechInstance())

    /** The identifier of the request the engine holds, which [AndroidTtsSpeechSynthesizer] keeps to itself. */
    private fun lastUtteranceId(): String = engineShadow().lastSynthesizeToFile.nameWithoutExtension

    private suspend fun SpeechSynthesizer.synthesisFailure(text: String): SpeechSynthesisException {
        val failure = runCatching { synthesizeToFile(text) }.exceptionOrNull()

        assertIs<SpeechSynthesisException>(failure)
        return failure
    }

    private suspend fun SpeechSynthesizer.noOfflineVoiceFailure(text: String): NoOfflineVoiceAvailableException {
        val failure = runCatching { synthesizeToFile(text) }.exceptionOrNull()

        assertIs<NoOfflineVoiceAvailableException>(failure)
        return failure
    }

    private suspend fun Deferred<Result<File>>.awaitFailure(): SpeechSynthesisException {
        val failure = await().exceptionOrNull()

        assertIs<SpeechSynthesisException>(failure)
        return failure
    }

    private fun installVoice(
        name: String,
        locale: Locale,
        quality: Int = TtsVoice.QUALITY_NORMAL,
        latency: Int = TtsVoice.LATENCY_NORMAL,
        requiresNetwork: Boolean = false,
        features: Set<String> = emptySet(),
    ) = ShadowTextToSpeech.addVoice(TtsVoice(name, locale, quality, latency, requiresNetwork, features))
}
