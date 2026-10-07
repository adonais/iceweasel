/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.synthesis

import kotlin.math.min
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import mozilla.components.feature.listentopage.content.TextChunker

/**
 * Splits the first sentence off [text], to be synthesized before anything about the voice is known.
 *
 * @param text The article.
 * @param languageTag The language to read [text] as.
 * @param maxInputLength The engine's own limit, which caps a request because one over it is rejected outright and plays
 *   nothing at all.
 */
internal fun TextChunker.splitFirstSentence(text: String, languageTag: String, maxInputLength: Int): SplitArticle {
    val firstSentenceEnd = firstSentenceEnd(text, languageTag)

    return SplitArticle(
        firstChunks = chunk(text.substring(0, firstSentenceEnd), maxInputLength, languageTag),
        remainingText = text.substring(firstSentenceEnd),
    )
}

/** Splits [text] into chunks holding [target] of speech each at [rate], within whatever the engine accepts. */
internal fun TextChunker.chunkByDuration(
    text: String,
    languageTag: String,
    rate: SpeechRate,
    maxInputLength: Int,
    target: Duration = CHUNK_TARGET,
): List<String> = chunk(text, min(maxInputLength, rate.charsIn(target)), languageTag)

internal val CHUNK_TARGET = 60.seconds
