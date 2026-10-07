/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.content

import android.icu.text.BreakIterator
import java.util.Locale
import kotlin.math.ceil

/**
 * Splits article text into the chunks.
 *
 * Use [android] for the implementation backed by the platform ICU sentence boundaries, or supply a custom one.
 */
interface TextChunker {
    /**
     * Splits [text] into chunks of at most [maxInputLength] characters each, in reading order.
     *
     * Chunks are cut on sentence boundaries, so a chunk holds whole sentences and never starts mid-sentence. A single
     * sentence longer than [maxInputLength] is the one exception: it has no boundary to cut on, so it is split into
     * roughly equal parts instead of being dropped.
     *
     * @param text The article text.
     * @param maxInputLength The longest acceptable chunk. Must be positive.
     * @param languageTag BCP 47 language tag of the article, which decides where the sentences are. Must be well-
     *   formed: a page that declares no language of its own is the caller's to answer for, with the device language or
     *   with one it has guessed, because a chunker cannot tell which of the two the article is in.
     * @return The chunks, none of them blank, or an empty list when [text] holds nothing to read out.
     */
    fun chunk(text: String, maxInputLength: Int, languageTag: String): List<String>

    /**
     * Where the first sentence of [text] with something in it ends, or the length of [text] when it has none.
     *
     * @param text The article text.
     * @param languageTag BCP 47 language tag of the article, which decides where the sentences are.
     */
    fun firstSentenceEnd(text: String, languageTag: String): Int

    companion object {
        /** Creates a [TextChunker] that cuts on the sentence boundaries the platform ICU library reports. */
        fun android(): TextChunker = AndroidTextChunker()
    }
}

/**
 * [TextChunker] backed by the platform ICU [BreakIterator], which knows the sentence terminators of every language an
 * article can be in, rather than the ASCII ones alone.
 */
internal class AndroidTextChunker : TextChunker {

    override fun chunk(text: String, maxInputLength: Int, languageTag: String): List<String> {
        require(maxInputLength > 0) { "maxInputLength must be positive, was $maxInputLength" }

        val locale = localeFor(languageTag)

        return partitionIntoChunks(sentences(text, locale), maxInputLength, locale)
    }

    override fun firstSentenceEnd(text: String, languageTag: String): Int {
        val boundaries = BreakIterator.getSentenceInstance(localeFor(languageTag))
        boundaries.setText(text)

        var end = boundaries.next()
        while (end != BreakIterator.DONE && text.substring(0, end).isBlank()) {
            end = boundaries.next()
        }

        return if (end == BreakIterator.DONE) text.length else end
    }

    /**
     * Fills a chunk with [sentences] until the next one would not fit, then starts the next chunk on it.
     *
     * The whitespace the article had around a sentence is dropped, and sentences sharing a chunk are put back together
     * with a single [SEPARATOR].
     */
    private fun partitionIntoChunks(sentences: List<String>, maxInputLength: Int, locale: Locale): List<String> {
        val chunks = mutableListOf<String>()
        val pending = StringBuilder()

        for (rawSentence in sentences) {
            val sentence = rawSentence.trim()
            if (sentence.isEmpty()) continue

            val oversized = sentence.length > maxInputLength
            val full = pending.length + SEPARATOR.length + sentence.length > maxInputLength
            if (pending.isNotEmpty() && (oversized || full)) {
                chunks.add(pending.toString())
                pending.clear()
            }

            if (oversized) {
                chunks.addAll(splitOversizedSentence(sentence, maxInputLength, locale))
            } else {
                if (pending.isNotEmpty()) pending.append(SEPARATOR)
                pending.append(sentence)
            }
        }
        if (pending.isNotEmpty()) chunks.add(pending.toString())

        return chunks
    }

    /**
     * The sentences of [text], each one carrying the whitespace that separates it from the next. A blank line between
     * two paragraphs is a sentence of nothing but whitespace, which is why a caller has to expect blank ones.
     */
    private fun sentences(text: String, locale: Locale): List<String> {
        val boundaries = BreakIterator.getSentenceInstance(locale)
        boundaries.setText(text)

        val sentences = mutableListOf<String>()
        var start = boundaries.first()
        var end = boundaries.next()
        while (end != BreakIterator.DONE) {
            sentences.add(text.substring(start, end))
            start = end
            end = boundaries.next()
        }

        return sentences
    }

    /**
     * Splits one sentence that does not fit in a chunk on its own into parts of at most [maxInputLength] characters.
     *
     * The parts are as close to equal in length as the text allows, so that a sentence of two and a bit chunks is read
     * out as three even parts rather than as two full ones and a fragment. Each cut is moved back to the nearest line
     * boundary, which keeps words and CJK phrases whole; a stretch with no boundary at all, such as a very long URL, is
     * cut where it has to be.
     */
    private fun splitOversizedSentence(sentence: String, maxInputLength: Int, locale: Locale): List<String> {
        val parts = mutableListOf<String>()
        val boundaries = BreakIterator.getLineInstance(locale)
        var rest = sentence

        while (rest.length > maxInputLength) {
            val partCount = ceil(rest.length.toDouble() / maxInputLength)
            val target = ceil(rest.length / partCount).toInt()

            boundaries.setText(rest)
            val boundary = boundaries.preceding(target + 1)
            val cut = if (boundary >= (target + 1) / 2) boundary else hardCut(rest, target)

            parts.add(rest.substring(0, cut).trimEnd())
            rest = rest.substring(cut).trimStart()
        }
        if (rest.isNotEmpty()) parts.add(rest)

        return parts
    }

    /** Cuts [text] at [target], or one character earlier when that would tear a surrogate pair in half. */
    private fun hardCut(text: String, target: Int): Int =
        if (text[target - 1].isHighSurrogate()) (target - 1).coerceAtLeast(1) else target

    /** The locale [languageTag] names. Requires a well-formed tag. */
    private fun localeFor(languageTag: String): Locale {
        val locale = Locale.forLanguageTag(languageTag)
        require(locale.language.isNotEmpty()) { "languageTag must be a well formed BCP 47 tag, was \"$languageTag\"" }

        return locale
    }
}

private const val SEPARATOR = " "
