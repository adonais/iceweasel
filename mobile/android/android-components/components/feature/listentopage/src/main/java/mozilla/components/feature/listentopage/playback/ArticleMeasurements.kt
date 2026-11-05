/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import kotlin.time.Duration
import mozilla.components.feature.listentopage.synthesis.SpeechRate

/**
 * What the article's length is estimated from, filled in as synthesis finds it out.
 *
 * @property chunkCharacters How many characters each chunk holds, in reading order, or empty until the article is
 *   split.
 * @property measuredDurations How long each chunk that has been made lasts, by chunk.
 * @property speechRate What the opening measured at, or `null` when it could not be measured.
 */
@ConsistentCopyVisibility
data class ArticleMeasurements
internal constructor(
    internal val chunkCharacters: List<Int> = emptyList(),
    internal val measuredDurations: Map<Int, Duration> = emptyMap(),
    internal val speechRate: SpeechRate? = null,
) {
    /** How many chunks the article came to, or `0` before it has been split. */
    internal val chunkCount: Int
        get() = chunkCharacters.size

    /** Whether chunk at [index] is the last one of the article. */
    internal fun isLastChunk(index: Int): Boolean = index == chunkCount - 1

    /** @param chunkDurationsBeforePlaylistMs See [ProgressMapper]. */
    internal fun mapper(chunkDurationsBeforePlaylistMs: List<Long> = emptyList()) =
        ProgressMapper(
            chunkCount = chunkCount,
            measuredDurationOf = measuredDurations::get,
            charactersIn = chunkCharacters::get,
            speechRate = speechRate,
            chunkDurationsBeforePlaylistMs = chunkDurationsBeforePlaylistMs,
        )
}
