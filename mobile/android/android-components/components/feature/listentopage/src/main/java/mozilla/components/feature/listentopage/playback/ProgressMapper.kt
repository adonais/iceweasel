/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import kotlin.time.Duration
import kotlin.time.DurationUnit
import mozilla.components.feature.listentopage.ArticleProgress
import mozilla.components.feature.listentopage.synthesis.SpeechRate

/** A place in the article: which chunk holds it, and how far into that chunk it is. */
internal data class ChunkPosition(val chunkIndex: Int, val positionMs: Long)

/**
 * Works out how far through the whole article playback has got, from chunks of which only a few exist at a time.
 *
 * @param chunkCount How many chunks the article came to, or `0` before it has been split.
 * @param measuredDurationOf How long a chunk's audio lasted, or `null` while it has not been measured.
 * @param charactersIn How many characters a chunk holds.
 * @param speechRate What the opening measured at, or `null` when it could not be measured.
 */
internal class ProgressMapper(
    private val chunkCount: Int,
    private val measuredDurationOf: (Int) -> Duration?,
    private val charactersIn: (Int) -> Int,
    speechRate: SpeechRate?,
) {

    private val rate: SpeechRate? = speechRate ?: impliedRate()

    /**
     * How far through the article playback has got. If estimates of total playback length become smaller between calls,
     * the current active position is held at its current place in order to avoid jumps. Progress reports will continue
     * to hold it there until playback has caught up.
     *
     * @param previous The last reported progress
     * @param playingChunk Which chunk of the article is playing.
     * @param chunkPositionMs How far into that chunk the player reports it has got.
     * @param chunkEnded Whether that chunk has finished, in which case it counts as played in full rather than as far
     *   as the player last sampled. The last chunk of the article having finished is what lands the bar on exactly 1.0.
     */
    fun progress(
        previous: ArticleProgress,
        playingChunk: Int,
        chunkPositionMs: Long,
        chunkEnded: Boolean,
    ): ArticleProgress {
        if (chunkCount == 0) return ArticleProgress()

        val index = playingChunk.coerceIn(0, chunkCount - 1)
        val chunkMs = lengthOf(index)
        val intoChunk = if (chunkEnded) chunkMs else chunkPositionMs.coerceIn(0, chunkMs)
        val positionMs = maxOf(previous.positionMs, msBefore(index) + intoChunk)
        val readToEnd = chunkEnded && index == chunkCount - 1

        return ArticleProgress(positionMs = positionMs, durationMs = heldLength(positionMs, previous, readToEnd))
    }

    /** How long each chunk lasts. Empty if nothing has been sized. */
    fun chunkLengthsMs(): List<Long> = (0 until chunkCount).map(::lengthOf).takeIf { it.sum() > 0 }.orEmpty()

    /** Which chunk holds [characterOffset], counting the characters of the chunks rather than the page's own text. */
    fun chunkAt(characterOffset: Int): Int {
        var end = 0
        for (index in 0 until chunkCount) {
            end += charactersIn(index)
            if (characterOffset < end) return index
        }

        return (chunkCount - 1).coerceAtLeast(0)
    }

    /** Where chunk [index] starts, counted in the characters of the chunks before it. */
    fun characterOffsetOf(index: Int): Int = (0 until index.coerceIn(0, chunkCount)).sumOf(charactersIn)

    /** How far along the bar [characterOffset] is, between 0 and 1. */
    fun fractionAt(characterOffset: Int): Float {
        val articleMs = articleMs()
        if (articleMs <= 0) return 0f

        val index = chunkAt(characterOffset)
        val chars = charactersIn(index)
        val into = (characterOffset - characterOffsetOf(index)).coerceIn(0, chars)
        val intoChunkMs = if (chars == 0) 0 else lengthOf(index) * into / chars

        return ((msBefore(index) + intoChunkMs).toFloat() / articleMs).coerceIn(0f, 1f)
    }

    fun positionAt(fraction: Float): ChunkPosition? {
        if (chunkCount == 0) return null

        val target = (fraction.coerceIn(0f, 1f) * articleMs()).toLong()
        var passed = 0L
        for (index in 0 until chunkCount) {
            val chunkMs = lengthOf(index)
            if (target < passed + chunkMs || index == chunkCount - 1) {
                return ChunkPosition(index, (target - passed).coerceIn(0, chunkMs))
            }
            passed += chunkMs
        }

        return null
    }

    /**
     * How long chunk [index] lasts.
     *
     * A chunk that has been made but not measured is sized exactly like one that does not exist yet: the file is added
     * before it is read, so having audio does not mean having a duration.
     */
    private fun lengthOf(index: Int): Long =
        measuredDurationOf(index)?.inWholeMilliseconds
            ?: rate?.durationOf(charactersIn(index))?.inWholeMilliseconds
            ?: 0

    private fun msBefore(index: Int): Long = (0 until index).sumOf(::lengthOf)

    private fun articleMs(): Long = (0 until chunkCount).sumOf(::lengthOf)

    /**
     * How long the article lasts: held short of its estimate where the estimate would move the bar backwards, and held
     * past [positionMs] until the article has been [readToEnd] so that a bar with audio left never reads as full.
     */
    private fun heldLength(positionMs: Long, previous: ArticleProgress, readToEnd: Boolean): Long {
        val articleMs = articleMs()
        if (articleMs <= 0) return 0

        val shortest = if (readToEnd) positionMs else positionMs + 1
        val held =
            if (previous.positionMs > 0 && previous.durationMs > 0) {
                positionMs * previous.durationMs / previous.positionMs
            } else {
                articleMs
            }

        return minOf(articleMs, held).coerceAtLeast(shortest)
    }

    /** The rate the chunks measured so far imply, or `null` when none of them has been measured. */
    private fun impliedRate(): SpeechRate? {
        var chars = 0
        var seconds = 0.0
        for (index in 0 until chunkCount) {
            val measured = measuredDurationOf(index) ?: continue
            chars += charactersIn(index)
            seconds += measured.toDouble(DurationUnit.SECONDS)
        }

        return if (chars > 0 && seconds > 0) SpeechRate(chars / seconds) else null
    }
}

/**
 * Where [positionMs] into an article falls, given how long each of its chunks lasts.
 *
 * Taken over the lengths rather than over a [ProgressMapper] so that it can be answered from a snapshot.
 */
internal fun List<Long>.chunkPositionAt(positionMs: Long): ChunkPosition? {
    if (isEmpty()) return null

    val target = positionMs.coerceAtLeast(0)
    var passed = 0L
    for ((index, chunkMs) in withIndex()) {
        if (target < passed + chunkMs || index == lastIndex) {
            return ChunkPosition(index, (target - passed).coerceIn(0, chunkMs))
        }
        passed += chunkMs
    }

    return null
}
