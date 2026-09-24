/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import android.content.ComponentName
import android.content.Context
import androidx.core.content.ContextCompat
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import java.io.File
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

/** Commands the playback of the synthesized audio. */
interface PlaybackController {
    /** Plays [file], replacing anything already playing. */
    suspend fun play(file: File)

    /** Pauses playback, keeping the position. */
    suspend fun pause()

    /** Resumes playback from the position it was paused at. */
    suspend fun resume()

    /** Moves playback to [positionMs] in the current audio. */
    suspend fun seekTo(positionMs: Long)

    /** Gives up the playback, which takes the notification away. A later call starts it again. */
    suspend fun release()
}

/**
 * A [PlaybackController] that drives [ListenMediaSessionService] through a [MediaController].
 *
 * This is the client half of the media session, and the only place in the module that holds a [MediaController]. It
 * exists so that a caller can drive playback without naming a media3 type, which a caller in Fenix cannot resolve.
 *
 * A [MediaController] may only be used on the main thread, so every method here moves to it. The connection is made on
 * first use and reused afterwards.
 *
 * Bug 2064876 adds the listener that reports the session's state back to the store.
 *
 * @param context Used to connect to [ListenMediaSessionService].
 * @param scope The [CoroutineScope] the connection is held in.
 * @param ioDispatcher The dispatcher the service lookup runs on.
 */
class ListenPlaybackController(
    private val context: Context,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : PlaybackController {

    // Main thread only, like the controller it produces.
    private var connection: Deferred<MediaController>? = null

    override suspend fun play(file: File) = onController {
        it.setMediaItem(file.toMediaItem())
        it.prepare()
        it.play()
    }

    override suspend fun pause() = onController { it.pause() }

    override suspend fun resume() = onController { it.play() }

    override suspend fun seekTo(positionMs: Long) = onController { it.seekTo(positionMs) }

    override suspend fun release() {
        withContext(Dispatchers.Main) {
            val released = connection ?: return@withContext
            connection = null

            // A connection that failed has no controller to release.
            val controller = runCatching { released.await() }.getOrNull() ?: return@withContext

            controller.stop()
            controller.release()
        }
    }

    private suspend fun onController(command: (MediaController) -> Unit) =
        withContext(Dispatchers.Main) {
            command(connection?.await() ?: newConnection().await())
        }

    /**
     * Starts connecting, and keeps the attempt so that later commands reuse it.
     *
     * A failed attempt drops itself rather than being cached, because otherwise the first failure is replayed to every
     * later command and the session can never recover without restarting the process.
     */
    private fun newConnection(): Deferred<MediaController> =
        scope
            .async(Dispatchers.Main) { connect() }
            .also { connecting ->
                connection = connecting
                connecting.invokeOnCompletion { failure ->
                    if (failure != null && connection === connecting) {
                        connection = null
                    }
                }
            }

    private suspend fun connect(): MediaController {
        // The SessionToken constructor asks the package manager to resolve the service, which is a blocking IPC. Only
        // buildAsync below has to be on the main thread.
        val token =
            withContext(ioDispatcher) {
                SessionToken(context, ComponentName(context, ListenMediaSessionService::class.java))
            }
        val pending =
            MediaController.Builder(context, token)
                .setListener(
                    object : MediaController.Listener {
                        // The session goes away on its own, so a kept controller can go stale: media3 stops the
                        // service once the article ends with nobody commanding it. Commands sent to a disconnected
                        // controller are dropped without a word, so the next request has to build a new one.
                        override fun onDisconnected(controller: MediaController) {
                            connection = null
                        }
                    }
                )
                .buildAsync()

        return suspendCancellableCoroutine { continuation ->
            // The listener only runs once the future is done, so `get` returns rather than waits. Whichever terminal
            // state it reports, success, failure or cancellation, belongs to the coroutine that is waiting for it.
            pending.addListener(
                { continuation.resumeWith(runCatching { pending.get() }) },
                ContextCompat.getMainExecutor(context),
            )

            continuation.invokeOnCancellation { MediaController.releaseFuture(pending) }
        }
    }
}
