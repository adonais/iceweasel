/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Timeline
import androidx.media3.exoplayer.ExoPlayer
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** How far back the back control jumps. */
internal const val SEEK_BACK_INCREMENT_MS = 10_000L

/** How far forward the forward control jumps. */
internal const val SEEK_FORWARD_INCREMENT_MS = 30_000L

// What an item carries in its extras, written by [File.toMediaItem] and read back by the readers below it.
internal const val KEY_MEASURED_DURATION_MS = "mozilla.components.feature.listentopage.MEASURED_DURATION_MS"
private const val KEY_CHUNK_INDEX = "mozilla.components.feature.listentopage.CHUNK_INDEX"
private const val KEY_PLAYLIST_START_MS = "mozilla.components.feature.listentopage.PLAYLIST_START_MS"
private const val KEY_ARTICLE_DURATION_MS = "mozilla.components.feature.listentopage.ARTICLE_DURATION_MS"

/**
 * The audio of one chunk of the article.
 *
 * @property index Which index the chunk of the article it is.
 * @property file Where the audio is.
 * @property durationMs How long it lasts, or `null` when it could not be measured.
 */
data class ChunkFile(val index: Int, val file: File, val durationMs: Long?)

/** Turns [ChunkFile] into something the player accepts. See [File.toMediaItem]. */
internal fun ChunkFile.toMediaItem(displayData: ArticleDisplayData, articleTimeline: ArticleTimeline? = null) =
    file.toMediaItem(displayData, durationMs, articleTimeline, chunkIndex = index)

/**
 * Turns an audio file into something the player accepts.
 *
 * @param durationMs How long the file lasts, or `null` when it could not be measured.
 * @param articleTimeline Where the playlist this file starts sits in the article, or `null` when it is queued behind
 *   others rather than starting one.
 * @param chunkIndex The index of the article's chunk the file holds, so that the player's reports name it, or `null`
 *   when the file is not a chunk.
 */
internal fun File.toMediaItem(
    displayData: ArticleDisplayData,
    durationMs: Long? = null,
    articleTimeline: ArticleTimeline? = null,
    chunkIndex: Int? = null,
): MediaItem {
    val extras =
        Bundle().apply {
            chunkIndex?.let { putInt(KEY_CHUNK_INDEX, it) }
            durationMs?.let { putLong(KEY_MEASURED_DURATION_MS, it) }
            articleTimeline?.let { putPlaylistTimeline(it) }
        }

    return MediaItem.Builder()
        .setUri(Uri.fromFile(this))
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(displayData.title)
                .setArtist(displayData.site)
                .setExtras(extras.takeUnless { it.isEmpty })
                .build()
        )
        .build()
}

/** How long the item lasts: as it was measured, or as the player found it where it was not measured, or `null`. */
internal fun Timeline.Window.chunkMs(): Long? =
    mediaItem.measuredDurationMs() ?: durationMs.takeIf { it != C.TIME_UNSET }

/** Which index the chunk of the article the item is, or `null` when it is not one. */
internal fun MediaItem.chunkIndex(): Int? =
    mediaMetadata.extras?.takeIf { it.containsKey(KEY_CHUNK_INDEX) }?.getInt(KEY_CHUNK_INDEX)

/** How long the item was measured to last, or `null` when it was not measured. */
internal fun MediaItem.measuredDurationMs(): Long? =
    mediaMetadata.extras?.getLong(KEY_MEASURED_DURATION_MS)?.takeIf { it > 0 }

private fun Bundle.putPlaylistTimeline(timeline: ArticleTimeline) {
    putLong(KEY_PLAYLIST_START_MS, timeline.playlistStartMs)
    putLong(KEY_ARTICLE_DURATION_MS, timeline.durationMs)
}

/** Where the playlist this item starts sits in the article, or `null` when it does not start one. */
internal fun MediaItem.playlistTimeline(): ArticleTimeline? {
    val extras = mediaMetadata.extras ?: return null
    if (!extras.containsKey(KEY_PLAYLIST_START_MS)) return null

    return ArticleTimeline(
        playlistStartMs = extras.getLong(KEY_PLAYLIST_START_MS),
        durationMs = extras.getLong(KEY_ARTICLE_DURATION_MS),
    )
}

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
            // The speech content type will cause our player to pause when other media sources request focus
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(),
                true,
            )
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
