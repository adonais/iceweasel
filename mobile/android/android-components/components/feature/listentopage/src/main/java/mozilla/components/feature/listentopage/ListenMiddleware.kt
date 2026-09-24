/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import mozilla.components.feature.listentopage.content.ContentProvider
import mozilla.components.feature.listentopage.playback.AudioFileCache
import mozilla.components.feature.listentopage.playback.PlaybackController
import mozilla.components.feature.listentopage.synthesis.NoOfflineVoiceAvailableException
import mozilla.components.feature.listentopage.synthesis.SpeechSynthesizer
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import mozilla.components.support.base.log.logger.Logger

/**
 * [Middleware] that extracts the article a listening session reads out, synthesizes it and plays it.
 *
 * @property contentProvider Provides the article text and language for a tab.
 * @property synthesizerProvider Builds the speech engine. A provider rather than an instance for two reasons: building
 *   one binds the platform engine over IPC, which must not happen on the caller's thread, and [SpeechSynthesizer.close]
 *   is terminal, so a session that closes its engine needs a way to get another one.
 * @property audioCache Holds the audio files. It is emptied when the session stops.
 * @property playbackController Plays the audio file. It is used instead of the player directly, because only playback
 *   commanded through the media session keeps the audio alive in the background and shows the notification.
 * @property scope The [CoroutineScope] the extraction, the synthesis and the playback commands run in. It has to
 *   dispatch on one thread: the session fields below are read from `invoke`, which the store runs on whichever thread
 *   dispatched, and written from this scope.
 * @property ioDispatcher The dispatcher that binding the engine, asking it for its voices, and closing it run on.
 */
class ListenMiddleware(
    private val contentProvider: ContentProvider,
    private val synthesizerProvider: () -> SpeechSynthesizer,
    private val audioCache: AudioFileCache,
    private val playbackController: PlaybackController,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : Middleware<ListenState, ListenAction> {

    private val logger = Logger("ListenMiddleware")

    private var contentJob: Job? = null
    private var voicesJob: Job? = null
    private var playbackJob: Job? = null

    // The article the session reads out. Bug 2064848 replaces this with the chunk list.
    //
    // It carries the tab it was extracted for, so that an extraction finishing after its session ended cannot be read
    // by the session after it. Clearing it on stop is still not optional: the store is a singleton, so the middleware
    // is too, and an article left here would live until the process dies.
    private var article: Article? = null

    // The engine this session reads with, built on first use and closed when the session stops.
    private var synthesizer: SpeechSynthesizer? = null

    // Guards building the engine, so that a request arriving while another is still binding cannot leave a second
    // engine bound with nothing to close it.
    private val synthesizerLock = Mutex()

    override fun invoke(
        store: Store<ListenState, ListenAction>,
        next: (ListenAction) -> Unit,
        action: ListenAction,
    ) {
        next(action)

        when (action) {
            is ListenAction.Session.ListenRequested -> requestContent(store, action.tabId)

            ListenAction.Session.StopRequested -> stop()

            // synthesizeAndPlay will be called from the PlaybackStarted action in Bug 2064848
            is ListenAction.Content.ContentReady -> {
                store.requestVoices(action.languageTag)
                synthesizeAndPlay(store.state.tabId, store::dispatch)
            }

            ListenAction.Content.ContentUnavailable,
            is ListenAction.Voices.VoiceSelected,
            is ListenAction.Voices.AvailableVoicesLoaded,
            ListenAction.Voices.NoOfflineVoicesAvailable,
            ListenAction.ErrorDismissed -> Unit
        }
    }

    private fun requestContent(store: Store<ListenState, ListenAction>, tabId: String) {
        contentJob?.cancel()
        contentJob = scope.launch {
            val content = contentProvider.getContent(tabId)

            // A session for another tab was started, or the session was stopped, while the article was extracted.
            if (store.state.tabId != tabId) {
                return@launch
            }

            content
                .onSuccess {
                    if (it.text.isBlank()) {
                        store.dispatch(ListenAction.Content.ContentUnavailable)
                    } else {
                        article = Article(tabId = tabId, text = it.text)
                        store.dispatch(ListenAction.Content.ContentReady(languageTag = it.languageTag))
                    }
                }
                .onFailure { store.dispatch(ListenAction.Content.ContentUnavailable) }
        }
    }

    private fun ListenStore.requestVoices(langTag: String) {
        voicesJob?.cancel()
        voicesJob =
            scope.launch(ioDispatcher) {
                val voices = synthesizer().loadAvailableVoices(langTag)

                dispatch(
                    if (voices.isEmpty()) {
                        ListenAction.Voices.NoOfflineVoicesAvailable
                    } else {
                        ListenAction.Voices.AvailableVoicesLoaded(voices)
                    }
                )
            }
    }

    /**
     * Synthesizes the article and plays it.
     *
     * Only the first [SpeechSynthesizer.maxInputLength] characters are read out, because the engine rejects a longer
     * request outright and returns an error before making any audio. Bug 2064848 replaces this with real chunking.
     *
     * @param tabId The tab the live session is reading. A session that has already ended may still have written its
     *   article to the field, so anything extracted for a different tab is ignored.
     * @param dispatch Dispatch an action to the store.
     */
    private fun synthesizeAndPlay(tabId: String?, dispatch: (ListenAction) -> Unit) {
        val text = article?.takeIf { it.tabId == tabId }?.text ?: return

        playbackJob?.cancel()
        playbackJob = scope.launch {
            try {
                val engine = synthesizer()
                val file = engine.synthesizeToFile(firstChunk(text, engine.maxInputLength))
                playbackController.play(file)
            } catch (e: CancellationException) {
                throw e
            } catch (_: NoOfflineVoiceAvailableException) {
                // The engine only reaches for the network when it has no offline voice for the language, so a network
                // failure during synthesis means the same thing to the user as an empty voice list.
                dispatch(ListenAction.Voices.NoOfflineVoicesAvailable)
            } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
                // TODO Bug 2064849: dispatch Synthesis.SynthesisFailed so that the user sees this, rather than only
                // logging it. That action group belongs to epic 3 and does not exist yet, so a failure is silent in
                // the UI today.
                logger.error("Could not read the article out loud", e)
            }
        }
    }

    /** The engine for this session, bound on first use because binding it is IPC. */
    private suspend fun synthesizer(): SpeechSynthesizer = synthesizerLock.withLock {
        synthesizer ?: withContext(ioDispatcher) { synthesizerProvider() }.also { synthesizer = it }
    }

    /** Stops everything the session has in flight, and takes the notification away with the service. */
    private fun stop() {
        contentJob?.cancel()
        voicesJob?.cancel()
        playbackJob?.cancel()
        article = null

        val closing = synthesizer
        synthesizer = null

        scope.launch {
            playbackController.release()

            // The engine is an IPC binding into the text to speech app, which stays alive for the rest of this app's
            // life unless it is shut down. Closing is terminal, which is why the next session builds its own.
            withContext(ioDispatcher) { closing?.close() }

            // Nothing else deletes the audio, so without this a session leaves its files behind for as long as the
            // system keeps the cache directory. Only safe once the playback above has given up the files.
            audioCache.clear()
        }
    }
}

/**
 * Returns the longest prefix of [text] that ends a sentence at or before [maxLength].
 *
 * Bug 2064848 replaces this with the real chunker, which splits the whole article on ICU sentence boundaries instead of
 * throwing the rest of it away.
 */
private fun firstChunk(text: String, maxLength: Int): String {
    if (text.length <= maxLength) return text

    val head = text.substring(0, maxLength)
    val lastSentenceEnd = head.indexOfLast { it in SENTENCE_TERMINATORS }

    return if (lastSentenceEnd < 0) head else head.substring(0, lastSentenceEnd + 1)
}

/** The article of one listening session, and the tab it was extracted from. */
private class Article(val tabId: String, val text: String)

// The CJK terminators are here because Chinese and Japanese do not use the ASCII ones, and a cut that finds no
// boundary at all would hand the engine the full over-length article.
private const val SENTENCE_TERMINATORS = ".!?。！？"
