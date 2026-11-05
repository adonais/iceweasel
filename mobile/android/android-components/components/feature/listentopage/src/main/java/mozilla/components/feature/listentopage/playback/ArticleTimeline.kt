/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import androidx.media3.common.Player
import androidx.media3.common.Timeline

/**
 * @property playlistStartMs Where the first item of the playlist starts in the article. It only changes along with the
 *   playlist, when playback starts or restarts, and comes with it in the first item's extras.
 * @property durationMs How long the article lasts, or `0` while nothing has been measured.
 * @property bufferingAtMs Where in the article a seek is waiting for its chunk to be made, or `null` when none is.
 */
internal data class ArticleTimeline(
    val playlistStartMs: Long = 0,
    val durationMs: Long = 0,
    val bufferingAtMs: Long? = null,
) {

    /** Where the chunk at [index] of [player]'s playlist starts in the article. */
    fun chunkStartMs(player: Player, index: Int = player.currentMediaItemIndex): Long {
        val timeline = player.currentTimeline
        val window = Timeline.Window()
        var startMs = playlistStartMs
        for (i in 0 until index.coerceAtMost(timeline.windowCount)) {
            startMs += timeline.getWindow(i, window).chunkMs() ?: 0
        }

        return startMs
    }

    fun toChunkMs(player: Player, index: Int, articleMs: Long): Long = articleMs - chunkStartMs(player, index)
}
