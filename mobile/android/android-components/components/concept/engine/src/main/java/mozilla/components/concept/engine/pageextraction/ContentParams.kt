/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.concept.engine.pageextraction

/**
 * Options for controlling how text is extracted from a page.
 *
 * @property removeBoilerplate When true, attempts to remove boilerplate content from the page using reader mode.
 * @property useSimpleText When true, returns plain prose instead of the default markdown-annotated text. Links
 *   contribute their text but not their target, and whitespace within a paragraph is collapsed, while the breaks
 *   between paragraphs are kept.
 */
data class ContentParams(
    val removeBoilerplate: Boolean = false,
    val useSimpleText: Boolean = false,
)
