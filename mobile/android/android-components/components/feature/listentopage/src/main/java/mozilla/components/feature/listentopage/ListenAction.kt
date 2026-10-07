/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage

import mozilla.components.lib.state.Action

/** Actions for the [ListenStore]. */
sealed interface ListenAction : Action {
    /** Actions that start and end a listening session. */
    sealed interface Session : ListenAction {
        /**
         * The user asked to listen to an article.
         *
         * @property tabId The tab the article is in.
         * @property url The article.
         */
        data class ListenRequested(
            val tabId: String,
            val url: String,
        ) : Session

        /** The listening session is over. It resets to the initial state. */
        data object StopRequested : Session
    }

    /** Actions reporting the article the session reads out. */
    sealed interface Content : ListenAction {
        /**
         * The article was extracted from the page.
         *
         * @property languageTag language of the article.
         */
        data class ContentReady(val languageTag: String) : Content

        /** The page gave back no usable text. */
        data object ContentUnavailable : Content
    }

    /** Actions reporting the change in selected voice. */
    sealed interface Voices : ListenAction {
        /**
         * The voice was changed.
         *
         * @property voice The voice selected for the article.
         */
        data class VoiceSelected(val voice: Voice) : Voices

        /** Available voices were loaded from the engine. */
        data class AvailableVoicesLoaded(val voices: List<Voice>, val selectedVoice: Voice) : Voices

        /** The engine has no installed, network-free voice for the article language. */
        data object NoOfflineVoicesAvailable : Voices
    }

    /** Actions reporting what the player is doing. */
    sealed interface Playback : ListenAction {
        /**
         * The player reported a change.
         *
         * @property playbackState What the player is doing now.
         */
        data class StateChangeObserved(val playbackState: PlaybackState) : Playback

        /**
         * How far through the article playback has got was worked out afresh.
         *
         * @property positionMs How far into the article.
         * @property durationMs How long the whole article lasts.
         * @property chunkDurationsMs How long each chunk lasts, as they stood when this was worked out.
         */
        data class ArticleProgressChanged(
            val positionMs: Long,
            val durationMs: Long,
            val chunkDurationsMs: List<Long> = emptyList(),
        ) : Playback

        /**
         * The player moved on to a chunk and is reading it out.
         *
         * @property chunk The chunk being read.
         * @property positionMs How far into [chunk] the player has got.
         */
        data class PlaybackStarted(val chunk: ChunkState, val positionMs: Long) : Playback

        /**
         * The reader chose a place in the article to carry on from.
         *
         * @property positionMs How far into the article to move to, measured against the lengths in
         *   [ArticleProgress.chunkDurationsMs].
         */
        data class SeekRequested(val positionMs: Long) : Playback

        /** The player read out every chunk it had been given and the article has more to come. */
        data object PlaybackWaiting : Playback

        /** The player read the last chunk of the article out. */
        data object PlaybackEnded : Playback

        /** The player could not read the article out. */
        data object PlaybackFailed : Playback
    }

    /** Actions reporting what the speech engine did with the article. */
    sealed interface Synthesis : ListenAction {
        /** The engine could not turn the article into audio. */
        data object SynthesisFailed : Synthesis
    }

    /** The error that needs to be cleared it is shown. */
    data object ErrorDismissed : ListenAction
}
