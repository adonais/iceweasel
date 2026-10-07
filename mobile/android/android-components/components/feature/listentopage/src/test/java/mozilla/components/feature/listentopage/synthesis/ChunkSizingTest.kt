/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.synthesis

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.feature.listentopage.content.TextChunker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

// The platform's own fixed limit, which is what an opening must stop being sized by.
private const val ENGINE_LIMIT = 4000

// Ten characters a second, so a minute of speech is 600 characters.
private val RATE = SpeechRate(10.0)
private const val MINUTE_OF_SPEECH = 600

// A fifth of the speed, so the same minute holds a fifth of the text.
private val SLOWER_RATE = SpeechRate(2.0)

@RunWith(AndroidJUnit4::class)
class ChunkSizingTest {

    private val chunker = TextChunker.android()

    @Test
    fun `test that the first request is one sentence rather than everything the engine accepts`() {
        val article = englishArticle(sentences = 200)

        val split = chunker.splitFirstSentence(article, "en-US", ENGINE_LIMIT)

        // Sized by the engine alone this would have been one request, and nothing would have played until the whole
        // article had been synthesized.
        assertTrue(article.length > ENGINE_LIMIT)
        assertEquals(listOf("Sentence 1 is right here."), split.firstChunks)
    }

    @Test
    fun `test that a language with no spaces is also split on its first sentence`() {
        val article = "今天天气很好。我们一起去公园散步吧。你觉得这个主意怎么样？"

        val split = chunker.splitFirstSentence(article, "zh-CN", ENGINE_LIMIT)

        assertEquals(listOf("今天天气很好。"), split.firstChunks)
        assertEquals("我们一起去公园散步吧。你觉得这个主意怎么样？", split.remainingText)
    }

    @Test
    fun `test that the text after the first sentence is kept exactly as the page gave it`() {
        val article = englishArticle(sentences = 50)

        val split = chunker.splitFirstSentence(article, "en-US", ENGINE_LIMIT)

        // A substring, not something the chunker returned, so nothing is dropped before the rate is known.
        assertTrue(article.endsWith(split.remainingText))
        assertTrue(split.remainingText.startsWith("Sentence 2"))
    }

    @Test
    fun `test that an article starting with a line break still has something to say`() {
        // ICU makes a line break a sentence boundary of its own, so the first sentence of this is whitespace. Taking it
        // would leave the opening empty and the session with nothing to play.
        val split =
            chunker.splitFirstSentence("\n\n  Sentence 1 is right here. Sentence 2 is too.", "en-US", ENGINE_LIMIT)

        assertEquals(listOf("Sentence 1 is right here."), split.firstChunks)
        assertTrue(split.remainingText.contains("Sentence 2"))
    }

    @Test
    fun `test that an article of nothing but line breaks has nothing to read rather than throwing`() {
        val split = chunker.splitFirstSentence("\n\n\n", "en-US", ENGINE_LIMIT)

        assertEquals(emptyList<String>(), split.firstChunks)
    }

    @Test
    fun `test that an article of one sentence leaves nothing after it`() {
        val split = chunker.splitFirstSentence("The only sentence there is.", "en-US", ENGINE_LIMIT)

        assertEquals(listOf("The only sentence there is."), split.firstChunks)
        assertEquals("", split.remainingText)
    }

    @Test
    fun `test that a first sentence longer than the engine accepts is split`() {
        val article = "word ".repeat(200) + "and then it ends. A second sentence."

        val split = chunker.splitFirstSentence(article, "en-US", 100)

        assertTrue(split.firstChunks.size > 1)
        split.firstChunks.forEach { assertTrue("Request of ${it.length} characters", it.length <= 100) }
        assertTrue(split.remainingText.startsWith("A second sentence."))
    }

    @Test
    fun `test that the text after the first sentence is chunked into minutes of speech at the rate it is given`() {
        val article = englishArticle(sentences = 400)
        val split = chunker.splitFirstSentence(article, "en-US", ENGINE_LIMIT)

        val chunks = chunker.chunkByDuration(split.remainingText, "en-US", RATE, ENGINE_LIMIT)

        assertTrue(chunks.size > 1)
        chunks.forEach { assertTrue("Chunk of ${it.length} characters", it.length <= MINUTE_OF_SPEECH) }
        // Every chunk but the last is filled, so the article is not read out in needlessly small pieces.
        chunks.dropLast(1).forEach {
            assertTrue("Chunk of ${it.length} characters", it.length > MINUTE_OF_SPEECH / 2)
        }
    }

    @Test
    fun `test that a slower measured rate gives shorter chunks`() {
        val remaining = chunker.splitFirstSentence(englishArticle(sentences = 400), "en-US", ENGINE_LIMIT).remainingText

        val fast = chunker.chunkByDuration(remaining, "en-US", RATE, ENGINE_LIMIT)
        val slow = chunker.chunkByDuration(remaining, "en-US", SLOWER_RATE, ENGINE_LIMIT)

        assertTrue(slow.size > fast.size)
        assertTrue(slow.first().length < fast.first().length)
    }

    @Test
    fun `test that no chunk of the rest is longer than the engine accepts`() {
        val remaining = chunker.splitFirstSentence(englishArticle(sentences = 200), "en-US", ENGINE_LIMIT).remainingText

        // A limit below a minute of speech at this rate, so the engine caps the size rather than the time target.
        val chunks = chunker.chunkByDuration(remaining, "en-US", RATE, 200)

        chunks.forEach { assertTrue("Chunk of ${it.length} characters", it.length <= 200) }
    }

    @Test
    fun `test that the whole article is still read out`() {
        val article = englishArticle(sentences = 400)
        val split = chunker.splitFirstSentence(article, "en-US", ENGINE_LIMIT)

        val everything = split.firstChunks + chunker.chunkByDuration(split.remainingText, "en-US", RATE, ENGINE_LIMIT)

        assertEquals(
            article.filterNot { it.isWhitespace() },
            everything.joinToString("").filterNot { it.isWhitespace() },
        )
    }

    private fun englishArticle(sentences: Int) = (1..sentences).joinToString(" ") { "Sentence $it is right here." }
}
