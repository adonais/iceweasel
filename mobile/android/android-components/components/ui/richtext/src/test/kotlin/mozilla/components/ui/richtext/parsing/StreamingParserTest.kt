/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.ui.richtext.parsing

import mozilla.components.ui.richtext.ir.BlockContent.Heading
import mozilla.components.ui.richtext.ir.BlockContent.ListBlock
import mozilla.components.ui.richtext.ir.BlockContent.ListBlock.ListItem
import mozilla.components.ui.richtext.ir.BlockContent.Paragraph
import mozilla.components.ui.richtext.ir.HeadingLevel
import mozilla.components.ui.richtext.ir.InlineContent.Plain
import mozilla.components.ui.richtext.ir.RichDocument
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

internal class StreamingParserTest {

    @Test
    fun `empty document produces no blocks`() {
        val parser = StreamingParser()

        assertEquals(RichDocument(blocks = emptyList()), parser.toRichDocument())
    }

    @Test
    fun `appending an empty chunk produces no blocks`() {
        val parser = StreamingParser()

        parser.append("")

        assertEquals(RichDocument(blocks = emptyList()), parser.toRichDocument())
    }

    @Test
    fun `each chunk produces the document streamed so far`() {
        val parser = StreamingParser()
        val documents =
            listOf("# Title\n\nFirst para", "graph.\n\n- one\n", "- two\n\nThe end.").map { chunk ->
                parser.append(chunk)
                parser.toRichDocument()
            }

        val heading = Heading(level = HeadingLevel.H1, content = listOf(Plain("Title")))
        val paragraph = Paragraph(content = listOf(Plain("First paragraph.")))
        fun item(text: String) = ListItem(content = listOf(Paragraph(content = listOf(Plain(text)))))
        assertEquals(
            listOf(
                RichDocument(blocks = listOf(heading, Paragraph(content = listOf(Plain("First para"))))),
                RichDocument(blocks = listOf(heading, paragraph, ListBlock(items = listOf(item("one"))))),
                RichDocument(
                    blocks =
                        listOf(
                            heading,
                            paragraph,
                            ListBlock(items = listOf(item("one"), item("two"))),
                            Paragraph(content = listOf(Plain("The end."))),
                        )
                ),
            ),
            documents,
        )
    }

    @Test
    fun `chunk boundary inside an inline delimiter is parsed as a whole`() {
        val sources =
            listOf(
                "text with **strong** content" to 12,
                "text with `code` content" to 10,
                "text with [a link](https://example.com) content" to 11,
            )

        sources.forEach { (source, boundary) ->
            val parser = StreamingParser()

            parser.append(source.substring(0, boundary))
            parser.append(source.substring(boundary))

            assertEquals(source, Parser().parse(source), parser.toRichDocument())
        }
    }

    @Test
    fun `list followed by a blank line matches a full parse`() {
        val source = "- a list item\n- another list item\n\nA paragraph.\n"

        assertEquals(Parser().parse(source), streamedDocument(source, chunkSize = 1))
    }

    @Test
    fun `list with a blank line between its items keeps its items in one list`() {
        val unordered = "- a\n\n- b\n\n- c\n"
        val ordered = "1. first\n\n2. second\n\n3. third\n"

        assertEquals(Parser().parse(unordered), streamedDocument(unordered, chunkSize = 1))
        val orderedDocument = streamedDocument(ordered, chunkSize = 1)
        assertEquals(Parser().parse(ordered), orderedDocument)
        assertEquals(listOf(3), orderedDocument.blocks.filterIsInstance<ListBlock>().map { it.items.size })
    }

    @Test
    fun `code fence containing a blank line matches a full parse`() {
        val source = "```\ncode\n\nmore code\n```\n\nfollowing text\n"

        assertEquals(Parser().parse(source), streamedDocument(source, chunkSize = 1))
    }

    @Test
    fun `a document is still usable after a cancelled append`() {
        var cancelled = true
        val parser = StreamingParser { if (cancelled) throw TestCancellation() }

        assertThrows(TestCancellation::class.java) { parser.append("# A heading\n\nA paragraph.\n\n") }
        cancelled = false
        parser.append("More text.\n")

        assertEquals(Parser().parse("# A heading\n\nA paragraph.\n\nMore text.\n"), parser.toRichDocument())
    }

    @Test
    fun `cancellation is checked while the unstable tail grows`() {
        var checks = 0
        val parser = StreamingParser { checks++ }

        parser.append("a paragraph that stays unstable")
        val checksAfterFirstAppend = checks
        parser.append(" and keeps growing")

        assertTrue(checks > checksAfterFirstAppend)
    }

    private class TestCancellation : RuntimeException()
}

/**
 * Streams [source] into a [StreamingParser] in chunks of [chunkSize] characters and returns the resulting document.
 * With [buildAfterEachChunk], a document is also built after every chunk, as a streaming UI does, so stable blocks are
 * converted a few at a time rather than all at once at the end.
 */
internal fun streamedDocument(
    source: String,
    chunkSize: Int,
    buildAfterEachChunk: Boolean = true,
): RichDocument {
    val parser = StreamingParser()

    source.chunked(chunkSize).forEach { chunk ->
        parser.append(chunk)
        if (buildAfterEachChunk) {
            parser.toRichDocument()
        }
    }

    return parser.toRichDocument()
}
