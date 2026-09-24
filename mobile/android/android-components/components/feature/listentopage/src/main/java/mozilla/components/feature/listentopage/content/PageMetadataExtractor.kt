/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.content

/** An interface to conform to to deliver the metadata of an article. */
fun interface PageMetadataExtractor {
    /** Retrieves the article metadata of the page loaded in [tabId]. */
    suspend fun getPageMetadata(tabId: String): Result<PageMetadata>
}

/**
 * The page metadata a listening session needs.
 *
 * @property languageTag BCP 47 language tag of the article, or an empty string when the page declares none.
 */
data class PageMetadata(val languageTag: String = "")
