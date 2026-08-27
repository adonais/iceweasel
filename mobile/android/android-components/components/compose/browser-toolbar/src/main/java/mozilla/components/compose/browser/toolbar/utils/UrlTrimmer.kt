/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar.utils

/**
 * Sanitizes a URL for display by trimming leading and trailing whitespace and removing
 * any internal whitespace characters that are not regular spaces (e.g., tabs or newlines).
 *
 * Similar to what desktop is doing here - https://searchfox.org/firefox-main/rev/
 * 91d6cd2d1476bca635bb96f82ca34eda283b5460/netwerk/base/nsURLHelper.cpp#461.
 *
 * @param url The URL string to sanitize.
 * @param registrableDomainIndexRange An optional pair of start and end indices representing the
 * registrable domain within the original URL.
 *
 * @return The sanitized URL and the adjusted domain index range.
 */
internal fun sanitizeUrlForDisplay(
    url: String,
    registrableDomainIndexRange: Pair<Int, Int>?,
): Pair<String, Pair<Int, Int>?> {
    val firstContentIndex = url.indexOfFirst { !it.isWhitespace() }
    if (firstContentIndex == -1) {
        return "" to null
    }

    val contentRange = firstContentIndex..url.indexOfLast { !it.isWhitespace() }

    fun isKept(index: Int) =
        index in contentRange && (url[index] == ' ' || !url[index].isWhitespace())

    val sanitizedUrl = url.filterIndexed { index, _ -> isKept(index) }

    val adjustedDomainRange = registrableDomainIndexRange
        ?.takeIf { (start, end) -> start in 0..<end && end <= url.length }
        ?.let { (start, end) ->
            // New index == number of kept characters before the original index.
            val newStart = (0 until start).count(::isKept)
            val newEnd = (0 until end).count(::isKept)
            (newStart to newEnd).takeIf { newStart < newEnd }
        }

    return sanitizedUrl to adjustedDomainRange
}

/**
 * Truncates a URL to a specific length around its registrable domain.
 *
 * @param url The full URL string.
 * @param registrableDomainIndexRange The start and end indices of the domain within the full URL.
 * @param maxCharCountAroundDomain The maximum number of characters to preserve on either side of the domain.
 *
 * @return A [Pair] containing the truncated URL string and the adjusted index range for the domain,
 * or the original inputs if no truncation is needed or possible.
 */
internal fun truncateUrlAroundDomain(
    url: String,
    registrableDomainIndexRange: Pair<Int, Int>?,
    maxCharCountAroundDomain: Int = 300,
): Pair<String, Pair<Int, Int>?> {
    if (registrableDomainIndexRange == null) {
        // If there's no domain, we can't center on it. Return a simple truncation.
        return url.take(maxCharCountAroundDomain * 2) to null
    }

    val (domainStart, domainEnd) = registrableDomainIndexRange
    val truncatedUrlStart = (domainStart - maxCharCountAroundDomain).coerceAtLeast(0)
    val truncatedUrlEnd = (domainEnd + maxCharCountAroundDomain).coerceAtMost(url.length)

    val truncatedUrl = url.substring(truncatedUrlStart, truncatedUrlEnd)

    // Slide the window of the registrable domain by how many characters from the start were removed.
    val newDomainStart = domainStart - truncatedUrlStart
    val newDomainEnd = domainEnd - truncatedUrlStart
    val newRange = newDomainStart to newDomainEnd

    return truncatedUrl to newRange
}
