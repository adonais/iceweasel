/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.ui.richtext.parsing

import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
internal class StreamingParserEquivalenceTest(private val testCase: ParserTestCase) {

    @Test
    fun `streamed document matches a full parse regardless of chunking`() {
        val expected = Parser().parse(testCase.source)

        CHUNK_SIZES.forEach { chunkSize ->
            assertEquals(
                "Failed case: ${testCase.description}, chunks of $chunkSize characters",
                expected,
                streamedDocument(testCase.source, chunkSize),
            )
        }
    }

    @Test
    fun `streamed document matches a full parse when it is only built at the end`() {
        assertEquals(
            "Failed case: ${testCase.description}",
            Parser().parse(testCase.source),
            streamedDocument(testCase.source, chunkSize = 1, buildAfterEachChunk = false),
        )
    }

    @Test
    fun `every partially streamed document matches a full parse of what has arrived`() {
        val parser = StreamingParser()

        testCase.source.forEachIndexed { index, character ->
            parser.append(character.toString())

            assertEquals(
                "Failed case: ${testCase.description}, after ${index + 1} characters",
                Parser().parse(testCase.source.take(index + 1)),
                parser.toRichDocument(),
            )
        }
    }

    companion object {
        private val CHUNK_SIZES = listOf(1, 2, 3, 7, 64)

        @JvmStatic @Parameterized.Parameters fun testCases(): List<ParserTestCase> = ParserTestCases
    }
}
