/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage

import mozilla.components.lib.state.State

/**
 * The [State] of the [ListenStore].
 *
 * @property tabId The tab the session belongs to, or `null` when there is no session.
 * @property url The article being read, kept so a URL change can reset the session.
 * @property title The article title, or `null` when the page has none. Shown on the player and on the media
 *   notification, so it is state rather than something the UI reads from the tab.
 * @property languageTag The BCP 47 language of the article, used to pick a voice.
 * @property error The last error, or `null`.
 * @property voiceState State relating to narrator voice.
 */
data class ListenState(
    val tabId: String? = null,
    val url: String? = null,
    val title: String? = null,
    val languageTag: String? = null,
    val mode: ListenMode = ListenMode.Player,
    val error: ListenError? = null,
    val voiceState: VoiceState = VoiceState(),
) : State

/** What the user asked to see. */
enum class ListenMode {
    /** The playback controls. */
    Player
}

/** The ways a session can fail. */
sealed interface ListenError {
    /** No installed, network-free voice exists for the article language. Reported as a snackbar, with no player. */
    data object NoOfflineVoice : ListenError

    /** The page gave back no usable text. Reported as a snackbar, with no player. */
    data object ContentUnavailable : ListenError

    /** The synthesizer failed part-way through. Reported as a dialog over the player. */
    data object SynthesisFailed : ListenError

    /** The player failed part-way through. Reported as a dialog over the player. */
    data object PlaybackFailed : ListenError
}

/**
 * State relating to narrator voice.
 *
 * @property availableVoices The currently available voices.
 * @property selectedVoice The currently selected voice.
 */
data class VoiceState(
    val availableVoices: List<Voice> = listOf(),
    val selectedVoice: Voice? = null,
)

/** Metadata defining a narrator voice. */
data class Voice(val id: String)
