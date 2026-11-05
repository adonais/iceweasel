/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import android.content.Context
import android.os.Looper
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.test.core.app.ApplicationProvider
import java.io.File
import java.time.Duration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import mozilla.components.feature.listentopage.fakes.FakeChunkPlayer
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowSystemClock

/**
 * The playback the way the app has it, short of the ExoPlayer: a [ListenPlaybackController] connected through the
 * session the service builds to a [FakeChunkPlayer], with a second controller standing in for the notification and the
 * lock screen. What the session hands the player, and what it reports back, is then the session's own doing.
 *
 * Everything runs on the main looper, which only moves on when a test idles it, so the order of what happens is the
 * order the test asks for.
 *
 * @property player The player under the session.
 * @property controller The controller the middleware drives playback through.
 * @property connections How many times [controller] has looked for the session to connect to.
 * @property seekRequests Every position into the article the session's owner was asked to seek to.
 * @property notificationStates Every playback state the notification was told of, in order.
 */
internal class ListenSessionHarness : AutoCloseable {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    val player = FakeChunkPlayer()
    private val session = listenMediaSession(context, player)

    var connections = 0
        private set

    val controller =
        ListenPlaybackController(
            context = context,
            scope = scope,
            sessionToken = {
                connections += 1
                session.token
            },
        )

    val seekRequests = mutableListOf<Long>()
    val notificationStates = mutableListOf<Int>()

    private var connectedNotification: MediaController? = null

    /** Connected on first use, as the notification connects once there is playback to show. */
    val notification: MediaController
        get() =
            connectedNotification
                ?: MediaController.Builder(context, session.token).buildAsync().let { connecting ->
                    idle()
                    connecting.get().also {
                        it.addListener(
                            object : Player.Listener {
                                override fun onPlaybackStateChanged(playbackState: Int) {
                                    notificationStates.add(playbackState)
                                }
                            }
                        )
                        connectedNotification = it
                    }
                }

    init {
        scope.launch { controller.seekRequests.collect { seekRequests.add(it) } }
    }

    /**
     * Runs [command] against [controller] and idles the main looper until it has been carried out.
     *
     * The clock then moves on a millisecond. A controller told to play or pause keeps the position it had until the
     * session reports one from after that, and with a clock that never moves no report ever is.
     */
    fun <T> run(command: suspend PlaybackController.() -> T): T {
        var result: Result<T>? = null
        scope.launch { result = runCatching { controller.command() } }
        repeat(MAX_IDLES) {
            result?.let {
                ShadowSystemClock.advanceBy(Duration.ofMillis(1))
                return it.getOrThrow()
            }
            idle()
        }
        error("the command did not finish")
    }

    /** Lets everything that has been posted to the main looper run, which is how media3 hands messages over. */
    fun idle() {
        repeat(MAX_IDLES) { shadowOf(Looper.getMainLooper()).idle() }
    }

    override fun close() {
        run { release() }
        connectedNotification?.release()
        session.release()
        scope.cancel()
        idle()
    }

    companion object {
        private const val MAX_IDLES = 20

        /** A chunk's audio, which the fake player only names, lasting [durationMs]. */
        fun chunk(index: Int, durationMs: Long) = ChunkFile(index, File("/chunks/$index.wav"), durationMs)
    }
}
