/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.ui.richtext.parsing

import mozilla.components.ui.richtext.ir.RichDocument
import org.intellij.markdown.flavours.commonmark.CommonMarkFlavourDescriptor
import org.intellij.markdown.parser.CancellationToken
import org.intellij.markdown.parser.MarkdownParser

/**
 * Parser that delegates to Jetbrains [MarkdownParser]
 */
class Parser {
    /**
     * Parses text into a [RichDocument].
     *
     * @param source the text to parse.
     * @return a [RichDocument].
     */
    fun parse(source: CharSequence): RichDocument {
        val flavour = CommonMarkFlavourDescriptor()
        val parser = MarkdownParser(flavour, cancellationToken = CancellationToken.NonCancellable)
        val blocks = parser.buildMarkdownTreeFromString(source)
            .children
            .flatMap { node ->
                node.toBlocks(source)
            }
        return RichDocument(blocks = blocks)
    }
}
