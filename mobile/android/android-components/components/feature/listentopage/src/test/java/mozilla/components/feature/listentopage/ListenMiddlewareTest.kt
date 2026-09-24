/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage

import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import mozilla.components.feature.listentopage.content.Content
import mozilla.components.feature.listentopage.content.ContentProvider
import mozilla.components.feature.listentopage.fakes.FakeAudioFileCache
import mozilla.components.feature.listentopage.fakes.FakePlaybackController
import mozilla.components.feature.listentopage.fakes.FakeSpeechSynthesizer
import mozilla.components.feature.listentopage.playback.AudioFileCache
import mozilla.components.feature.listentopage.playback.PlaybackController
import mozilla.components.feature.listentopage.synthesis.NoOfflineVoiceAvailableException
import mozilla.components.feature.listentopage.synthesis.SpeechSynthesisException
import mozilla.components.feature.listentopage.synthesis.SpeechSynthesizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private const val TAB_ID = "tab-1"
private const val OTHER_TAB_ID = "tab-2"
private const val URL = "https://example.org/article"

@OptIn(ExperimentalCoroutinesApi::class)
class ListenMiddlewareTest {

    @Test
    fun `test that the article of the requested tab is extracted and its language recorded`() = runTest {
        var extractedTabId: String? = null
        val store = storeWith { tabId ->
            extractedTabId = tabId
            Result.success(Content(text = "Article text", languageTag = "de-DE"))
        }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(TAB_ID, extractedTabId)
        assertEquals("de-DE", store.state.languageTag)
        assertNull(store.state.error)
    }

    @Test
    fun `test that a failed extraction reports the content as unavailable`() = runTest {
        val store = storeWith { Result.failure(RuntimeException("Content failed")) }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(ListenError.ContentUnavailable, store.state.error)
        assertNull(store.state.languageTag)
    }

    @Test
    fun `test that a page with no usable text reports the content as unavailable`() = runTest {
        val store = storeWith { Result.success(Content(text = "   ", languageTag = "en-US")) }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(ListenError.ContentUnavailable, store.state.error)
        assertNull(store.state.languageTag)
    }

    @Test
    fun `test that an article extracted after the session stopped is dropped`() = runTest {
        val extraction = CompletableDeferred<Result<Content>>()
        val store = storeWith { extraction.await() }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()
        store.dispatch(ListenAction.Session.StopRequested)
        extraction.complete(Result.success(Content(text = "Article text", languageTag = "de-DE")))
        advanceUntilIdle()

        assertEquals(ListenState(), store.state)
    }

    @Test
    fun `test that the voices of the article language are loaded once the article is ready`() = runTest {
        val voices = listOf(Voice(id = "de-de-female"), Voice(id = "de-de-male"))
        val synthesizer = FakeSpeechSynthesizer(voices = voices)
        val store =
            storeWith(synthesizerProvider = { synthesizer }) {
                Result.success(Content(text = "Article text", languageTag = "de-DE"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(listOf("de-DE"), synthesizer.voiceRequests)
        assertEquals(voices, store.state.voiceState.availableVoices)
        assertNull(store.state.error)
    }

    @Test
    fun `test that an article language with no offline voice is reported as an error`() = runTest {
        val store =
            storeWith(synthesizerProvider = { FakeSpeechSynthesizer(voices = emptyList()) }) {
                Result.success(Content(text = "Article text", languageTag = "ja-JP"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(ListenError.NoOfflineVoice, store.state.error)
        assertTrue(store.state.voiceState.availableVoices.isEmpty())
    }

    @Test
    fun `test that no voices are loaded when the article could not be extracted`() = runTest {
        val synthesizer = FakeSpeechSynthesizer()
        val store =
            storeWith(synthesizerProvider = { synthesizer }) { Result.failure(RuntimeException("Content failed")) }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertTrue(synthesizer.voiceRequests.isEmpty())
        assertEquals(ListenError.ContentUnavailable, store.state.error)
    }

    @Test
    fun `test that the extracted article is synthesized and played`() = runTest {
        val synthesizer = FakeSpeechSynthesizer()
        val playback = FakePlaybackController()
        val store =
            storeWith(synthesizerProvider = { synthesizer }, playbackController = playback) {
                Result.success(Content(text = "Article text.", languageTag = "en-US"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(listOf("Article text."), synthesizer.requests)
        assertEquals(listOf(File("/audio/1.wav")), playback.played)
    }

    @Test
    fun `test that an article longer than the engine limit is cut at the last sentence end that fits`() = runTest {
        val synthesizer = FakeSpeechSynthesizer(maxInputLength = 20)
        val playback = FakePlaybackController()
        val store =
            storeWith(synthesizerProvider = { synthesizer }, playbackController = playback) {
                Result.success(Content(text = "One. Two. Three is over the limit.", languageTag = "en-US"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(listOf("One. Two."), synthesizer.requests)
        assertEquals(1, playback.played.size)
    }

    @Test
    fun `test that an article with no sentence end that fits is cut at the engine limit`() = runTest {
        val synthesizer = FakeSpeechSynthesizer(maxInputLength = 5)
        val playback = FakePlaybackController()
        val store =
            storeWith(synthesizerProvider = { synthesizer }, playbackController = playback) {
                Result.success(Content(text = "abcdefghij", languageTag = "en-US"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(listOf("abcde"), synthesizer.requests)
    }

    @Test
    fun `test that a synthesis failure does not play anything`() = runTest {
        val playback = FakePlaybackController()
        val failing =
            object : SpeechSynthesizer {
                override val maxInputLength = 4000

                override suspend fun synthesizeToFile(text: String): File = throw SpeechSynthesisException(-1)

                override fun close() = Unit

                override fun loadAvailableVoices(langTag: String): List<Voice> = emptyList()
            }
        val store =
            storeWith(synthesizerProvider = { failing }, playbackController = playback) {
                Result.success(Content(text = "Article text.", languageTag = "en-US"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertTrue(playback.played.isEmpty())
    }

    // The voice list is not empty here, so the error can only have come from the synthesis path rather than from the
    // check that reports a language with no offline voice before anything is synthesized.
    @Test
    fun `test that a synthesis failing for want of an offline voice reports it as an error`() = runTest {
        val playback = FakePlaybackController()
        val store =
            storeWith(
                synthesizerProvider = { failingSynthesizer { throw NoOfflineVoiceAvailableException() } },
                playbackController = playback,
            ) {
                Result.success(Content(text = "Article text.", languageTag = "en-US"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(ListenError.NoOfflineVoice, store.state.error)
        assertTrue(playback.played.isEmpty())
    }

    @Test
    fun `test that a synthesis failing for exceptions other than offline voice log is swallowed`() = runTest {
        val playback = FakePlaybackController()
        val store =
            storeWith(
                synthesizerProvider = { failingSynthesizer { throw SpeechSynthesisException(-1) } },
                playbackController = playback,
            ) {
                Result.success(Content(text = "Article text.", languageTag = "en-US"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertNull(store.state.error)
        assertTrue(playback.played.isEmpty())
    }

    @Test
    fun `test that stopping the session gives up the playback`() = runTest {
        val playback = FakePlaybackController()
        val store =
            storeWith(playbackController = playback) {
                Result.success(Content(text = "Article text.", languageTag = "en-US"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()
        store.dispatch(ListenAction.Session.StopRequested)
        advanceUntilIdle()

        assertTrue(playback.released)
    }

    // The engine is an IPC binding that lives until it is shut down, and close() is terminal, so the next session has
    // to get an engine of its own.
    @Test
    fun `test that stopping the session closes the engine and the next session builds another`() = runTest {
        val engines = mutableListOf<FakeSpeechSynthesizer>()
        val store =
            storeWith(synthesizerProvider = { FakeSpeechSynthesizer().also(engines::add) }) {
                Result.success(Content(text = "Article text.", languageTag = "en-US"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(1, engines.size)
        assertFalse(engines[0].closed)

        store.dispatch(ListenAction.Session.StopRequested)
        advanceUntilIdle()

        assertTrue(engines[0].closed)

        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(2, engines.size)
        assertFalse(engines[1].closed)
    }

    @Test
    fun `test that the engine is built once for a session`() = runTest {
        var built = 0
        val store =
            storeWith(synthesizerProvider = { FakeSpeechSynthesizer().also { built++ } }) {
                Result.success(Content(text = "Article text.", languageTag = "en-US"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()
        store.dispatch(ListenAction.Content.ContentReady(languageTag = "en-US"))
        advanceUntilIdle()

        assertEquals(1, built)
    }

    @Test
    fun `test that stopping the session empties the audio cache`() = runTest {
        val audioCache = FakeAudioFileCache()
        val store =
            storeWith(audioCache = audioCache) {
                Result.success(Content(text = "Article text.", languageTag = "en-US"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertFalse(audioCache.cleared)

        store.dispatch(ListenAction.Session.StopRequested)
        advanceUntilIdle()

        assertTrue(audioCache.cleared)
    }

    // The article carries the tab it came from, so a session cannot read the article the session before it left
    // behind, however the two raced.
    @Test
    fun `test that an article belonging to an earlier session is not read out`() = runTest {
        val synthesizer = FakeSpeechSynthesizer()
        val secondExtraction = CompletableDeferred<Result<Content>>()
        val store =
            storeWith(synthesizerProvider = { synthesizer }) { tabId ->
                if (tabId == TAB_ID) {
                    Result.success(Content(text = "First article.", languageTag = "en-US"))
                } else {
                    secondExtraction.await()
                }
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()

        assertEquals(listOf("First article."), synthesizer.requests)

        // The second session never gets its own article, so the first one's is all that is left in the field.
        store.dispatch(ListenAction.Session.ListenRequested(OTHER_TAB_ID, URL))
        advanceUntilIdle()
        store.dispatch(ListenAction.Content.ContentReady(languageTag = "en-US"))
        advanceUntilIdle()

        assertEquals(listOf("First article."), synthesizer.requests)

        // Let the second extraction finish, so the test scope has nothing left running when the body returns.
        secondExtraction.complete(Result.failure(RuntimeException("Extraction abandoned")))
        advanceUntilIdle()
    }

    @Test
    fun `test that the article is cleared when the session stops`() = runTest {
        val synthesizer = FakeSpeechSynthesizer()
        val store =
            storeWith(synthesizerProvider = { synthesizer }) {
                Result.success(Content(text = "Article text.", languageTag = "en-US"))
            }
        store.dispatch(ListenAction.Session.ListenRequested(TAB_ID, URL))
        advanceUntilIdle()
        store.dispatch(ListenAction.Session.StopRequested)
        advanceUntilIdle()

        // The article is gone, so nothing is left to synthesize a second time.
        store.dispatch(ListenAction.Content.ContentReady(languageTag = "en-US"))
        advanceUntilIdle()

        assertEquals(listOf("Article text."), synthesizer.requests)
    }

    /** An engine that offers a voice, so that only [synthesizeToFile] can fail a test that uses it. */
    private fun failingSynthesizer(failure: () -> Nothing) =
        object : SpeechSynthesizer {
            override val maxInputLength = 4000

            override suspend fun synthesizeToFile(text: String): File = failure()

            override fun close() = Unit

            override fun loadAvailableVoices(langTag: String): List<Voice> = listOf(Voice(id = "voice-1"))
        }

    private fun TestScope.storeWith(
        synthesizerProvider: () -> SpeechSynthesizer = { FakeSpeechSynthesizer() },
        playbackController: PlaybackController = FakePlaybackController(),
        audioCache: AudioFileCache = FakeAudioFileCache(),
        contentProvider: ContentProvider,
    ) =
        ListenStore(
            initialState = ListenState(),
            reducer = ::listenReducer,
            middleware =
                listOf(
                    ListenMiddleware(
                        contentProvider = contentProvider,
                        synthesizerProvider = synthesizerProvider,
                        audioCache = audioCache,
                        playbackController = playbackController,
                        scope = this,
                        ioDispatcher = Dispatchers.Unconfined,
                    )
                ),
        )
}
