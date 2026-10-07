/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import android.content.Context
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.exoplayer.ExoPlayer
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** How far back the back control jumps. */
internal const val SEEK_BACK_INCREMENT_MS = 10_000L

/** How far forward the forward control jumps. */
internal const val SEEK_FORWARD_INCREMENT_MS = 30_000L

/** Turns an audio file into something the player accepts. */
internal fun File.toMediaItem(displayData: ArticleDisplayData): MediaItem =
    MediaItem.Builder()
        .setUri(Uri.fromFile(this))
        .setMediaMetadata(MediaMetadata.Builder().setTitle(displayData.title).setArtist(displayData.site).build())
        .build()

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
 * An article is one playlist rather than a run of separate tracks. [play] takes the opening, and every chunk after it
 * is handed over by [appendChunk] while the chunk in front of it is still playing, so the player loads across the join
 * and the article comes out as seamless audio.
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

    /** Plays [file], replacing anything already playing, as [displayData] describes it. */
    suspend fun play(file: File, displayData: ArticleDisplayData) =
        withContext(Dispatchers.Main) {
            exoPlayer.setMediaItem(file.toMediaItem(displayData))
            exoPlayer.prepare()
            exoPlayer.play()
        }

    /** Adds [file] to the end of the playlist, to be read out once the chunks already in the playlist have been. */
    suspend fun appendChunk(file: File, displayData: ArticleDisplayData) =
        withContext(Dispatchers.Main) {
            exoPlayer.addMediaItem(file.toMediaItem(displayData))
        }

    /** Releases the player, from the main thread. This instance cannot be used afterwards. */
    fun release() {
        exoPlayer.release()
    }
}
