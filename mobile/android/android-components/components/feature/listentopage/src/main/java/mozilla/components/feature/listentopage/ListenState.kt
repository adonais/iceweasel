/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage

import java.util.Locale
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
 * @property playbackState State relating to the audio being played.
 * @property articleProgress How far through the whole article the playback has gotten.
 */
data class ListenState(
    val tabId: String? = null,
    val url: String? = null,
    val title: String? = null,
    val languageTag: String? = null,
    val mode: ListenMode = ListenMode.Player,
    val error: ListenError? = null,
    val voiceState: VoiceState = VoiceState(),
    val playbackState: PlaybackState = PlaybackState(),
    val articleProgress: ArticleProgress = ArticleProgress(),
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
 * @property availableVoices The offline voices of the article language, one per region and best first. Only says
 *   anything once [loadState] is [VoiceLoadState.Loaded], where an empty list means the language has no offline voice
 *   at all.
 * @property selectedVoice The currently selected voice.
 * @property loadState How far the engine has got in answering what it has for the article language.
 */
data class VoiceState(
    val availableVoices: List<Voice> = listOf(),
    val selectedVoice: Voice? = null,
    val loadState: VoiceLoadState = VoiceLoadState.NotLoaded,
)

/**
 * How far the engine has got in answering which voices it has for the article language.
 *
 * It exists so that [VoiceState.availableVoices] never carries two meanings: an empty list is a language the engine has
 * no offline voice for, never a list nobody has asked for yet.
 */
enum class VoiceLoadState {
    /** The engine has not answered yet, so [VoiceState.availableVoices] says nothing about the language. */
    NotLoaded,

    /** The engine has answered: an empty [VoiceState.availableVoices] means the language has no offline voice. */
    Loaded,
}

/**
 * Metadata defining a narrator voice.
 *
 * @property id The engine's own name for the voice, which is what it is selected and saved by.
 * @property locale The language and region the voice reads in. The list offers one voice per region.
 */
data class Voice(val id: String, val locale: Locale) {
    /**
     * The voice as the user reads it, for example "English (United Kingdom)".
     *
     * Written in the display language of the device rather than in the language of the voice, so that a reader who does
     * not know the article language can still tell which region each entry belongs to.
     */
    val displayName: String
        get() = locale.getDisplayName()
}

/**
 * State relating to the audio being played, as reported by the player.
 *
 * @property phase What the player is doing.
 * @property chunk The chunk being played.
 * @property positionMs How far into the article the playback has got, counting the chunks read before [chunk] rather
 *   than starting again at each one. It moves in whole seconds since that is user-facing granularity.
 */
data class PlaybackState(
    val phase: PlaybackPhase = PlaybackPhase.Idle,
    val chunk: ChunkState = ChunkState(),
    val positionMs: Long = 0,
)

/**
 * Current chunk state related to playback.
 *
 * @property index Which chunk of the article it is. The player holds the article as one playlist in reading order, so
 *   the item it is on is the chunk it is on.
 * @property durationMs How long it is, or `null` while the player does not know yet.
 */
data class ChunkState(
    val index: Int = 0,
    val durationMs: Long? = null,
)

/** What the player is doing. */
enum class PlaybackPhase {
    Idle,
    Buffering,
    Playing,
    Paused,
    Ended,
    Failed,
}

/**
 * How far through the whole article playback has got, worked out rather than reported.
 *
 * @property positionMs How far into the article, across every chunk before the one playing.
 * @property durationMs How long the whole article lasts: measured where chunks have been made, estimated where they
 *   have not, so it moves as the article is synthesized.
 * @property chunkDurationsMs How long each chunk lasts, in reading order. These lengths change as additional chunks are
 *   synthesized, so this should match what was last reported to the player.
 */
data class ArticleProgress(
    val positionMs: Long = 0,
    val durationMs: Long = 0,
    val chunkDurationsMs: List<Long> = emptyList(),
) {
    val fraction: Float
        get() = if (durationMs <= 0) 0f else (positionMs.toFloat() / durationMs).coerceIn(0f, 1f)
}
