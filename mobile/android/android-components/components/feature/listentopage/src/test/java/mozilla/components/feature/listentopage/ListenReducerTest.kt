/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage

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
        voiceState = VoiceState(availableVoices = listOf("Gonzo", "Animal", "Kermit").map { Voice(it) }),
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
        assertNull(state.languageTag)
        assertNull(state.error)
        assertEquals(ListenMode.Player, state.mode)
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
        val state = listenReducer(ListenState(), ListenAction.Voices.VoiceSelected(Voice(id = "en-us-female")))

        assertEquals(Voice(id = "en-us-female"), state.voiceState.selectedVoice)
    }

    @Test
    fun `test that loaded voices are recorded`() {
        val voices = listOf(Voice(id = "en-us-female"), Voice(id = "en-us-male"))

        val state = listenReducer(ListenState(), ListenAction.Voices.AvailableVoicesLoaded(voices))

        assertEquals(voices, state.voiceState.availableVoices)
    }

    @Test
    fun `test that loading voices again replaces the voices of the previous language`() {
        val loaded = listenReducer(ListenState(), ListenAction.Voices.AvailableVoicesLoaded(listOf(Voice("de-de"))))

        val state = listenReducer(loaded, ListenAction.Voices.AvailableVoicesLoaded(listOf(Voice("en-us"))))

        assertEquals(listOf(Voice("en-us")), state.voiceState.availableVoices)
    }

    @Test
    fun `test that loading voices leaves the selected voice alone`() {
        val selected = listenReducer(fullState, ListenAction.Voices.VoiceSelected(Voice(id = "en-us-female")))

        val state = listenReducer(selected, ListenAction.Voices.AvailableVoicesLoaded(listOf(Voice("en-us-male"))))

        assertEquals(Voice(id = "en-us-female"), state.voiceState.selectedVoice)
    }

    @Test
    fun `test that having no offline voice is reported as an error`() {
        val state = listenReducer(ListenState(), ListenAction.Voices.NoOfflineVoicesAvailable)

        assertEquals(ListenError.NoOfflineVoice, state.error)
    }

    @Test
    fun `test that having no offline voice leaves the article alone`() {
        val state = listenReducer(fullState.copy(error = null), ListenAction.Voices.NoOfflineVoicesAvailable)

        assertEquals(fullState.copy(error = ListenError.NoOfflineVoice), state)
    }

    @Test
    fun `test that a session has no voices by default`() {
        val initial = ListenState()

        assertEquals(emptyList<Voice>(), initial.voiceState.availableVoices)
        assertNull(initial.voiceState.selectedVoice)
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
}
