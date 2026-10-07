/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private const val TAB_ID = "tab-1"
private const val URL = "https://example.org/article"

/** A session with every field set, so a reset is visible in every one of them. */
private val fullState =
    ListenState(
        tabId = TAB_ID,
        url = URL,
        title = "Match Preview: Wrexham AFC vs Sunderland AFC",
        languageTag = "de-DE",
        mode = ListenMode.Player,
        error = ListenError.PlaybackFailed,
        voiceState =
            VoiceState(
                availableVoices =
                    listOf(Locale.GERMANY, Locale.forLanguageTag("de-AT"), Locale.forLanguageTag("de-CH")).map {
                        Voice(id = "de-voice-${it.country}", locale = it)
                    }
            ),
        playbackState =
            PlaybackState(
                phase = PlaybackPhase.Playing,
                chunk = ChunkState(index = 3, durationMs = 30_000),
                positionMs = 12_000,
            ),
        articleProgress = ArticleProgress(positionMs = 102_000, durationMs = 600_000),
    )

class ListenReducerTest {

    @Test
    fun `test that a listen request starts a session on the given tab`() {
        val state = listenReducer(ListenState(), ListenAction.Session.ListenRequested(TAB_ID, URL))

        assertEquals(TAB_ID, state.tabId)
    }

    @Test
    fun `test that a listen request drops everything the previous session held`() {
        val state = listenReducer(fullState, ListenAction.Session.ListenRequested("tab-2", URL))

        assertEquals("tab-2", state.tabId)
        assertEquals(URL, state.url)
        assertNull(state.title)
        assertNull(state.error)
        assertEquals(ListenMode.Player, state.mode)
        assertEquals("de-DE", state.languageTag)
        assertEquals(fullState.voiceState, state.voiceState)
        assertEquals(PlaybackState(), state.playbackState)
        assertEquals(ArticleProgress(), state.articleProgress)
    }

    @Test
    fun `test that a listen request records the article url`() {
        val state = listenReducer(ListenState(), ListenAction.Session.ListenRequested(TAB_ID, URL))

        assertEquals(URL, state.url)
    }

    @Test
    fun `test that stopping resets appropriate fields`() {
        assertEquals(
            ListenState(voiceState = fullState.voiceState.copy()),
            listenReducer(fullState, ListenAction.Session.StopRequested),
        )
    }

    @Test
    fun `test that dismissing an error clears it and leaves the session alone`() {
        val state = listenReducer(fullState, ListenAction.ErrorDismissed)

        assertNull(state.error)
        assertEquals(fullState.copy(error = null), state)
    }

    @Test
    fun `test that dismissing clears every kind of error`() {
        val errors =
            listOf(
                ListenError.NoOfflineVoice,
                ListenError.ContentUnavailable,
                ListenError.SynthesisFailed,
                ListenError.PlaybackFailed,
            )

        errors.forEach { error ->
            val state = listenReducer(fullState.copy(error = error), ListenAction.ErrorDismissed)

            assertNull("$error was not cleared", state.error)
        }
    }

    @Test
    fun `test that dismissing when there is no error changes nothing`() {
        val noError = fullState.copy(error = null)

        assertEquals(noError, listenReducer(noError, ListenAction.ErrorDismissed))
    }

    @Test
    fun `test that selecting a voice records it`() {
        val state =
            listenReducer(
                ListenState(),
                ListenAction.Voices.VoiceSelected(Voice(id = "en-us-female", locale = Locale.US)),
            )

        assertEquals(Voice(id = "en-us-female", locale = Locale.US), state.voiceState.selectedVoice)
    }

    @Test
    fun `test that loaded voices are recorded`() {
        val voices =
            listOf(Voice(id = "en-us-female", locale = Locale.US), Voice(id = "en-us-male", locale = Locale.US))

        val state = listenReducer(ListenState(), ListenAction.Voices.AvailableVoicesLoaded(voices, voices.first()))

        assertEquals(voices, state.voiceState.availableVoices)
    }

    @Test
    fun `test that loading voices again replaces the voices of the previous language`() {
        val german = listOf(Voice("de-de", Locale.GERMANY))
        val loaded = listenReducer(ListenState(), ListenAction.Voices.AvailableVoicesLoaded(german, german.first()))

        val english = listOf(Voice("en-us", Locale.US))
        val state = listenReducer(loaded, ListenAction.Voices.AvailableVoicesLoaded(english, english.first()))

        assertEquals(english, state.voiceState.availableVoices)
    }

    @Test
    fun `test that loading voices records the voice they were resolved for`() {
        val voices =
            listOf(Voice(id = "en-us-female", locale = Locale.US), Voice(id = "en-us-male", locale = Locale.US))

        val state =
            listenReducer(
                fullState,
                ListenAction.Voices.AvailableVoicesLoaded(
                    voices,
                    selectedVoice = Voice(id = "en-us-male", locale = Locale.US),
                ),
            )

        assertEquals(voices, state.voiceState.availableVoices)
        assertEquals(Voice(id = "en-us-male", locale = Locale.US), state.voiceState.selectedVoice)
    }

    @Test
    fun `test that having no offline voice is reported as an error`() {
        val state = listenReducer(ListenState(), ListenAction.Voices.NoOfflineVoicesAvailable)

        assertEquals(ListenError.NoOfflineVoice, state.error)
    }

    @Test
    fun `test that having no offline voice leaves the article alone`() {
        val state = listenReducer(fullState.copy(error = null), ListenAction.Voices.NoOfflineVoicesAvailable)

        assertEquals(
            fullState.copy(
                error = ListenError.NoOfflineVoice,
                voiceState = VoiceState(loadState = VoiceLoadState.Loaded),
            ),
            state,
        )
    }

    // An empty list only means the language has no offline voice, so the voices of the language before it cannot be
    // left behind for the popup to offer.
    @Test
    fun `test that having no offline voice empties the voices and marks them loaded`() {
        val state = listenReducer(fullState, ListenAction.Voices.NoOfflineVoicesAvailable)

        assertEquals(emptyList<Voice>(), state.voiceState.availableVoices)
        assertNull(state.voiceState.selectedVoice)
        assertEquals(VoiceLoadState.Loaded, state.voiceState.loadState)
    }

    @Test
    fun `test that loaded voices are marked as loaded`() {
        val voices = listOf(Voice(id = "en-us-female", locale = Locale.US))

        val state = listenReducer(ListenState(), ListenAction.Voices.AvailableVoicesLoaded(voices, voices.first()))

        assertEquals(VoiceLoadState.Loaded, state.voiceState.loadState)
    }

    @Test
    fun `test that a session has no voices by default`() {
        val initial = ListenState()

        assertEquals(emptyList<Voice>(), initial.voiceState.availableVoices)
        assertNull(initial.voiceState.selectedVoice)
        assertEquals(VoiceLoadState.NotLoaded, initial.voiceState.loadState)
    }

    @Test
    fun `test that a failed synthesis becomes an error the session can show`() {
        val state = listenReducer(ListenState(tabId = "tab-1"), ListenAction.Synthesis.SynthesisFailed)

        assertEquals(ListenError.SynthesisFailed, state.error)
        assertEquals("tab-1", state.tabId)
    }

    @Test
    fun `test that a failed synthesis can be dismissed`() {
        val failed = listenReducer(ListenState(tabId = "tab-1"), ListenAction.Synthesis.SynthesisFailed)

        val dismissed = listenReducer(failed, ListenAction.ErrorDismissed)

        assertNull(dismissed.error)
    }

    @Test
    fun `test that a session has no tab, no error and the player mode by default`() {
        val initial = ListenState()

        assertNull(initial.tabId)
        assertNull(initial.url)
        assertNull(initial.title)
        assertNull(initial.languageTag)
        assertNull(initial.error)
        assertEquals(ListenMode.Player, initial.mode)
    }

    @Test
    fun `test that an article in the language of the previous one keeps its voices`() {
        val state = listenReducer(fullState, ListenAction.Content.ContentReady(languageTag = "de-DE"))

        assertEquals(fullState, state)
    }

    @Test
    fun `test that an article in another language drops the voices of the previous one`() {
        val state = listenReducer(fullState, ListenAction.Content.ContentReady(languageTag = "fr-FR"))

        assertEquals("fr-FR", state.languageTag)
        assertEquals(VoiceState(), state.voiceState)
    }

    @Test
    fun `test that a session is playing nothing by default`() {
        val initial = ListenState()

        assertEquals(PlaybackPhase.Idle, initial.playbackState.phase)
        assertEquals(0, initial.playbackState.chunk.index)
        assertEquals(0, initial.playbackState.positionMs)
        assertNull(initial.playbackState.chunk.durationMs)
    }

    // The bar has nothing to draw until the opening has been measured, which is a few seconds into the session.
    @Test
    fun `test that a session has got nowhere through its article by default`() {
        val initial = ListenState()

        assertEquals(ArticleProgress(), initial.articleProgress)
        assertEquals(0f, initial.articleProgress.fraction, 0f)
    }

    @Test
    fun `test that what the player reports is recorded`() {
        val reported = PlaybackState(phase = PlaybackPhase.Playing, chunk = ChunkState(index = 2), positionMs = 4_000)

        val state = listenReducer(ListenState(), ListenAction.Playback.StateChangeObserved(reported))

        assertEquals(reported, state.playbackState)
    }

    @Test
    fun `test that what the player reports leaves the rest of the session alone`() {
        val reported = PlaybackState(phase = PlaybackPhase.Paused, positionMs = 1_000)

        val state = listenReducer(fullState, ListenAction.Playback.StateChangeObserved(reported))

        assertEquals(fullState.copy(playbackState = reported), state)
    }

    @Test
    fun `test that how far through the article playback has got is recorded`() {
        val state = listenReducer(ListenState(), ListenAction.Playback.ArticleProgressChanged(30_000, 600_000))

        assertEquals(ArticleProgress(positionMs = 30_000, durationMs = 600_000), state.articleProgress)
        assertEquals(0.05f, state.articleProgress.fraction, 0.0001f)
    }

    // A real duration shorter than the estimate it replaced shortens the whole article, and a position left outside it
    // would hold the bar at full while there is still audio to play.
    @Test
    fun `test that a position outside a shortened article is pulled back inside it`() {
        val state = listenReducer(fullState, ListenAction.Playback.ArticleProgressChanged(90_000, 60_000))

        assertEquals(ArticleProgress(positionMs = 60_000, durationMs = 60_000), state.articleProgress)
    }

    @Test
    fun `test that article progress leaves the rest of the session alone`() {
        val state = listenReducer(fullState, ListenAction.Playback.ArticleProgressChanged(1_000, 2_000))

        assertEquals(fullState.copy(articleProgress = ArticleProgress(1_000, 2_000)), state)
    }

    @Test
    fun `test that an article of no length reads as no progress rather than as not a number`() {
        val state = listenReducer(fullState, ListenAction.Playback.ArticleProgressChanged(0, 0))

        assertEquals(ArticleProgress(), state.articleProgress)
        assertEquals(0f, state.articleProgress.fraction, 0f)
    }

    @Test
    fun `test that a failed player is reported as an error`() {
        val state = listenReducer(ListenState(), ListenAction.Playback.PlaybackFailed)

        assertEquals(ListenError.PlaybackFailed, state.error)
        assertEquals(PlaybackPhase.Failed, state.playbackState.phase)
    }

    @Test
    fun `test that the chunk the player has reached is recorded`() {
        val chunk = ChunkState(index = 4, durationMs = 60_000)

        val state = listenReducer(ListenState(), ListenAction.Playback.PlaybackStarted(chunk, positionMs = 1_000))

        assertEquals(chunk, state.playbackState.chunk)
        assertEquals(1_000, state.playbackState.positionMs)
        assertEquals(PlaybackPhase.Playing, state.playbackState.phase)
    }

    @Test
    fun `test that waiting on the next chunk is recorded as a wait rather than an end`() {
        val playing = fullState.copy(playbackState = fullState.playbackState.copy(phase = PlaybackPhase.Playing))

        val state = listenReducer(playing, ListenAction.Playback.PlaybackWaiting)

        assertEquals(PlaybackPhase.Buffering, state.playbackState.phase)
        assertEquals(playing.playbackState.chunk, state.playbackState.chunk)
    }

    @Test
    fun `test that the article being read out is recorded as ended`() {
        val readOut = fullState.copy(error = null)

        val state = listenReducer(readOut, ListenAction.Playback.PlaybackEnded)

        assertEquals(PlaybackPhase.Ended, state.playbackState.phase)
        assertNull(state.error)
    }

    @Test
    fun `test that a failed player can be dismissed`() {
        val failed = listenReducer(ListenState(), ListenAction.Playback.PlaybackFailed)

        assertNull(listenReducer(failed, ListenAction.ErrorDismissed).error)
    }

    // An error the user has not seen yet outlives a report that has nothing to say about it, so that a phase change
    // arriving in between cannot take the dialog away.
    @Test
    fun `test that a player with nothing wrong leaves an existing error alone`() {
        val state =
            listenReducer(
                fullState.copy(error = ListenError.SynthesisFailed),
                ListenAction.Playback.StateChangeObserved(PlaybackState(phase = PlaybackPhase.Paused)),
            )

        assertEquals(ListenError.SynthesisFailed, state.error)
    }
}
