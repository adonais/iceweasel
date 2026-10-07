/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage

/**
 * Reduces the given [action] and current [state] into a new [ListenState].
 *
 * @param state The current [ListenState].
 * @param action The [ListenAction] to process.
 * @return The resulting [ListenState] after applying the action.
 */
fun listenReducer(state: ListenState, action: ListenAction): ListenState =
    when (action) {
        is ListenAction.Session -> reduceSession(state, action)
        is ListenAction.Content -> reduceContent(state, action)
        is ListenAction.Voices -> reduceVoices(state, action)
        is ListenAction.Playback -> reducePlayback(state, action)
        is ListenAction.Synthesis -> reduceSynthesis(state, action)
        ListenAction.ErrorDismissed -> state.copy(error = null)
    }

private fun reduceSession(state: ListenState, action: ListenAction.Session): ListenState =
    when (action) {
        is ListenAction.Session.ListenRequested -> {
            ListenState(
                tabId = action.tabId,
                url = action.url,
                languageTag = state.languageTag,
                voiceState = state.voiceState,
            )
        }

        ListenAction.Session.StopRequested -> {
            ListenState(tabId = null, url = null, voiceState = state.voiceState.copy())
        }
    }

private fun reduceContent(state: ListenState, action: ListenAction.Content): ListenState =
    when (action) {
        is ListenAction.Content.ContentReady ->
            if (action.languageTag == state.languageTag) {
                state
            } else {
                state.copy(languageTag = action.languageTag, voiceState = VoiceState())
            }

        ListenAction.Content.ContentUnavailable -> state.copy(error = ListenError.ContentUnavailable)
    }

private fun reducePlayback(state: ListenState, action: ListenAction.Playback): ListenState =
    when (action) {
        is ListenAction.Playback.StateChangeObserved -> state.copy(playbackState = action.playbackState)

        is ListenAction.Playback.PlaybackStarted ->
            state.copy(
                playbackState =
                    state.playbackState.copy(
                        phase = PlaybackPhase.Playing,
                        chunk = action.chunk,
                        positionMs = action.positionMs,
                    )
            )

        ListenAction.Playback.PlaybackWaiting ->
            state.copy(playbackState = state.playbackState.copy(phase = PlaybackPhase.Buffering))

        ListenAction.Playback.PlaybackEnded ->
            state.copy(playbackState = state.playbackState.copy(phase = PlaybackPhase.Ended))

        ListenAction.Playback.PlaybackFailed ->
            state.copy(
                playbackState = state.playbackState.copy(phase = PlaybackPhase.Failed),
                error = ListenError.PlaybackFailed,
            )
        is ListenAction.Playback.SeekRequested -> state

        is ListenAction.Playback.ArticleProgressChanged -> {
            val durationMs = action.durationMs.coerceAtLeast(0)
            state.copy(
                articleProgress =
                    ArticleProgress(
                        positionMs = action.positionMs.coerceIn(0, durationMs),
                        durationMs = durationMs,
                        chunkDurationsMs = action.chunkDurationsMs,
                    )
            )
        }
    }

private fun reduceSynthesis(state: ListenState, action: ListenAction.Synthesis): ListenState =
    when (action) {
        ListenAction.Synthesis.SynthesisFailed -> state.copy(error = ListenError.SynthesisFailed)
    }

private fun reduceVoices(state: ListenState, action: ListenAction.Voices): ListenState =
    when (action) {
        is ListenAction.Voices.VoiceSelected ->
            state.copy(voiceState = state.voiceState.copy(selectedVoice = action.voice))

        is ListenAction.Voices.AvailableVoicesLoaded ->
            state.copy(
                voiceState =
                    state.voiceState.copy(
                        availableVoices = action.voices,
                        selectedVoice = action.selectedVoice,
                        loadState = VoiceLoadState.Loaded,
                    )
            )

        // The empty list is the answer, not the absence of one: the engine has been asked and has nothing offline for
        // this language.
        ListenAction.Voices.NoOfflineVoicesAvailable ->
            state.copy(
                voiceState = VoiceState(loadState = VoiceLoadState.Loaded),
                error = ListenError.NoOfflineVoice,
            )
    }
