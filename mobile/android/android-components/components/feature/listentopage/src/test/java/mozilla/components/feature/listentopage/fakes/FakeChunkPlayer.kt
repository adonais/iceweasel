/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.fakes

import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import mozilla.components.feature.listentopage.playback.KEY_MEASURED_DURATION_MS
import mozilla.components.feature.listentopage.playback.SEEK_BACK_INCREMENT_MS
import mozilla.components.feature.listentopage.playback.SEEK_FORWARD_INCREMENT_MS

/**
 * A player that reads a playlist of chunks the way the ExoPlayer under [SessionPlayer] does, as far as the session and
 * the controller can tell: each item lasts the length it was measured at, and audio only moves on when a test plays it
 * with [play].
 *
 * @property seeks Every item and position into it this was asked to move to, in order.
 * @property startPositions Every position into its first item a new playlist was started at, in order.
 * @property stops How many times this was stopped.
 */
@OptIn(UnstableApi::class)
internal class FakeChunkPlayer : SimpleBasePlayer(Looper.getMainLooper()) {
    val seeks = mutableListOf<Pair<Int, Long>>()
    val startPositions = mutableListOf<Long>()
    var stops = 0
        private set

    // Each item with the id the playlist knows it by, so that an item keeps its id when items are added around it.
    private val items = mutableListOf<Pair<Int, MediaItem>>()
    private var nextId = 0
    private var index = 0
    private var positionMs = 0L
    private var playWhenReady = false
    private var playbackState = STATE_IDLE
    private var speed = 1f

    /** Plays [durationMs] of audio, moving on to the next item at the end of each and ending after the last. */
    fun play(durationMs: Long) {
        if (!playWhenReady || playbackState != Player.STATE_READY) return

        positionMs += durationMs
        while (positionMs >= lengthOf(index)) {
            if (index == items.lastIndex) {
                positionMs = lengthOf(index)
                playbackState = STATE_ENDED
                break
            }
            positionMs -= lengthOf(index)
            index += 1
        }
        invalidateState()
    }

    override fun getState(): State =
        State.Builder()
            .setAvailableCommands(Player.Commands.Builder().addAllCommands().build())
            .setPlaylist(
                items.map { (id, item) ->
                    MediaItemData.Builder(id)
                        .setMediaItem(item)
                        .setDurationUs(lengthOf(item) * MICROS_PER_MILLI)
                        .setIsSeekable(true)
                        .build()
                }
            )
            .setCurrentMediaItemIndex(index)
            .setContentPositionMs(positionMs)
            .setPlayWhenReady(playWhenReady, PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
            .setPlaybackState(if (items.isEmpty()) STATE_IDLE else playbackState)
            .setPlaybackParameters(PlaybackParameters(speed))
            .setSeekBackIncrementMs(SEEK_BACK_INCREMENT_MS)
            .setSeekForwardIncrementMs(SEEK_FORWARD_INCREMENT_MS)
            .build()

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        this.playWhenReady = playWhenReady
        return Futures.immediateVoidFuture()
    }

    override fun handlePrepare(): ListenableFuture<*> {
        if (playbackState == STATE_IDLE) playbackState = STATE_READY
        return Futures.immediateVoidFuture()
    }

    override fun handleStop(): ListenableFuture<*> {
        stops += 1
        playbackState = STATE_IDLE
        return Futures.immediateVoidFuture()
    }

    override fun handleSetMediaItems(
        mediaItems: MutableList<MediaItem>,
        startIndex: Int,
        startPositionMs: Long,
    ): ListenableFuture<*> {
        items.clear()
        mediaItems.forEach { items.add(nextId++ to it) }
        index = if (startIndex == C.INDEX_UNSET) 0 else startIndex
        positionMs = if (startPositionMs == C.TIME_UNSET) 0 else startPositionMs
        startPositions.add(positionMs)
        if (playbackState == STATE_ENDED) playbackState = STATE_READY
        return Futures.immediateVoidFuture()
    }

    override fun handleAddMediaItems(index: Int, mediaItems: MutableList<MediaItem>): ListenableFuture<*> {
        items.addAll(index, mediaItems.map { nextId++ to it })
        return Futures.immediateVoidFuture()
    }

    override fun handleRemoveMediaItems(fromIndex: Int, toIndex: Int): ListenableFuture<*> {
        items.subList(fromIndex, toIndex).clear()
        index = index.coerceAtMost((items.size - 1).coerceAtLeast(0))
        // Like ExoPlayer, which has no position left in an empty playlist.
        if (items.isEmpty()) positionMs = 0
        return Futures.immediateVoidFuture()
    }

    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
        val seekedIndex = if (mediaItemIndex == C.INDEX_UNSET) index else mediaItemIndex
        val seekedMs = if (positionMs == C.TIME_UNSET) 0 else positionMs
        seeks.add(seekedIndex to seekedMs)
        index = seekedIndex
        this.positionMs = seekedMs
        if (playbackState == Player.STATE_ENDED) playbackState = Player.STATE_READY
        return Futures.immediateVoidFuture()
    }

    override fun handleSetPlaybackParameters(playbackParameters: PlaybackParameters): ListenableFuture<*> {
        speed = playbackParameters.speed
        return Futures.immediateVoidFuture()
    }

    override fun handleRelease(): ListenableFuture<*> = Futures.immediateVoidFuture()

    private fun lengthOf(index: Int): Long = items.getOrNull(index)?.second?.let(::lengthOf) ?: 0

    private fun lengthOf(item: MediaItem): Long =
        item.mediaMetadata.extras?.getLong(KEY_MEASURED_DURATION_MS)?.takeIf { it > 0 } ?: DEFAULT_LENGTH_MS

    private companion object {
        const val MICROS_PER_MILLI = 1_000L
        const val DEFAULT_LENGTH_MS = 10_000L
    }
}
