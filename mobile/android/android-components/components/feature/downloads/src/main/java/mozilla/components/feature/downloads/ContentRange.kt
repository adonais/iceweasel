/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.downloads

import mozilla.components.concept.fetch.Headers
import mozilla.components.concept.fetch.Headers.Names.CONTENT_RANGE

internal val CONTENT_RANGE_PATTERN = Regex(
    "^bytes\\s+(\\d+)-\\d+/(\\d+|\\*)$",
    RegexOption.IGNORE_CASE,
)

internal data class ParsedContentRange(
    val start: Long,
    val totalLength: Long?,
)

internal fun parseContentRange(headers: Headers): ParsedContentRange? {
    val contentRange = headers[CONTENT_RANGE] ?: return null
    val match = CONTENT_RANGE_PATTERN.matchEntire(contentRange) ?: return null

    return ParsedContentRange(
        start = match.groupValues[1].toLongOrNull() ?: return null,
        totalLength = match.groupValues[2].takeUnless { it == "*" }?.toLongOrNull(),
    )
}
