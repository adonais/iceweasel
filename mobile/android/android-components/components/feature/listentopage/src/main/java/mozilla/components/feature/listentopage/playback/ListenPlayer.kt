/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import android.content.Context
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Turns an audio file into something the player accepts. Bug 2064873 adds the title and site metadata here. */
internal fun File.toMediaItem(): MediaItem = MediaItem.fromUri(Uri.fromFile(this))

/**
 * Plays the audio files the speech engine produces.
 *
 * One instance owns one [ExoPlayer] for its whole life. The player is built in the constructor and [release] is
 * terminal, so nothing can swap the underlying player out from under a listening session. Constructing this class
 * therefore acquires a resource: whoever builds it must release it.
 *
 * [ExoPlayer] is not thread safe, and it takes its looper from the thread that builds it. [ListenMediaSessionService]
 * builds this in `onCreate`, so the player lives on the main thread.
 *
 * That service owns the instance that plays a session, and callers command it through [ListenPlaybackController] rather
 * than through this class.
 *
 * @param context Used to build the player.
 */
class ListenPlayer(context: Context) {

    /**
     * The player a [androidx.media3.session.MediaSession] is built on.
     *
     * Internal because the session needs the instance itself, and because no caller outside this module can resolve a
     * media3 type.
     */
    internal val exoPlayer: ExoPlayer =
        ExoPlayer.Builder(context)
            // The session reads both values off the player, so the notification and the player sheet agree.
            .setSeekBackIncrementMs(SEEK_BACK_INCREMENT_MS)
            .setSeekForwardIncrementMs(SEEK_FORWARD_INCREMENT_MS)
            .build()
            .apply {
                // A foreground service keeps the process alive but not the CPU, so playback stalls once the device
                // dozes. LOCAL rather than NETWORK because the audio is always a local file.
                setWakeMode(C.WAKE_MODE_LOCAL)
            }

    /** Plays [file], replacing anything already playing. */
    suspend fun play(file: File) =
        withContext(Dispatchers.Main) {
            exoPlayer.setMediaItem(file.toMediaItem())
            exoPlayer.prepare()
            exoPlayer.play()
        }

    /** Releases the player, from the main thread. This instance cannot be used afterwards. */
    fun release() {
        exoPlayer.release()
    }

    private companion object {
        const val SEEK_BACK_INCREMENT_MS = 10_000L
        const val SEEK_FORWARD_INCREMENT_MS = 30_000L
    }
}
