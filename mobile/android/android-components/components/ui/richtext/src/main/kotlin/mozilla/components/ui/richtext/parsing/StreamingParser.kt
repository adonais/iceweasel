/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.ui.richtext.parsing

import mozilla.components.ui.richtext.ir.BlockContent
import mozilla.components.ui.richtext.ir.RichDocument
import org.intellij.markdown.flavours.commonmark.CommonMarkFlavourDescriptor
import org.intellij.markdown.parser.CancellationToken
import org.intellij.markdown.parser.EmptyStreamingMarkdownFile

/**
 * Parser for text that arrives in chunks, e.g. a streamed response. An [append] reparses only the tail of the document
 * that can still change.
 *
 * An instance holds one document and is not thread safe: use one per stream, and never call it concurrently.
 *
 * @param checkCancelled Called while parsing. Throw from it to abort the parse in progress; the instance must not be
 *   used again after any of its calls throws.
 */
class StreamingParser(checkCancelled: () -> Unit = {}) {
    private val source = StringBuilder()
    private val file = EmptyStreamingMarkdownFile(CommonMarkFlavourDescriptor(), CancellationToken(checkCancelled))
    private val stableBlocks = mutableListOf<BlockContent>()
    private var parsedStableChildCount = 0

    /** Appends a chunk of text to the document. */
    fun append(chunk: CharSequence) {
        source.append(chunk)
        file.append(chunk)
    }

    /**
     * Builds a [RichDocument] out of everything appended so far. Blocks that can no longer change are converted once;
     * the rest are converted again on every call.
     */
    fun toRichDocument(): RichDocument {
        val stableChildren = file.stableChildren
        stableChildren.subList(parsedStableChildCount, stableChildren.size).flatMapTo(stableBlocks) {
            it.toBlocks(source)
        }
        parsedStableChildCount = stableChildren.size

        return RichDocument(blocks = stableBlocks + file.unstableTail.flatMap { it.toBlocks(source) })
    }
}
