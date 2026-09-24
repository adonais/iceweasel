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
        data class AvailableVoicesLoaded(val voices: List<Voice>) : Voices

        /** The engine has no installed, network-free voice for the article language. */
        data object NoOfflineVoicesAvailable : Voices
    }

    /** The error that needs to be cleared it is shown. */
    data object ErrorDismissed : ListenAction
}
