/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.content

import kotlinx.coroutines.CancellationException

/**
 * The article a listening session reads out.
 *
 * @property text The article text, as plain prose.
 * @property languageTag BCP 47 language tag of the article, used to pick a voice, or an empty string when the page
 * - *
 */
data class Content(
    val text: String,
    val languageTag: String,
)

/**
 * Provides the [Content] of the article a listening session reads out.
 *
 * Use [fromPage] to create an instance backed by a [PageContentExtractor] and a [PageMetadataExtractor], or supply a
 * custom implementation.
 */
fun interface ContentProvider {
    /** Returns the [Content] of the page loaded in [tabId], or a failure if it could not be retrieved. */
    suspend fun getContent(tabId: String): Result<Content>

    companion object {
        /**
         * Creates a [ContentProvider] that derives [Content] from the given extractors.
         *
         * A failure of either extractor fails the returned [Result].
         *
         * @param pageContentExtractor Extracts the article text.
         * @param pageMetadataExtractor Extracts the metadata the article language is read from.
         */
        @Suppress("TooGenericExceptionCaught")
        fun fromPage(
            pageContentExtractor: PageContentExtractor,
            pageMetadataExtractor: PageMetadataExtractor,
        ) = ContentProvider { tabId ->
            try {
                val metadata = pageMetadataExtractor.getPageMetadata(tabId).getOrThrow()
                val text = pageContentExtractor.getPageContent(tabId).getOrThrow()

                Result.success(Content(text = text, languageTag = metadata.languageTag))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                Result.failure(e)
            }
        }
    }
}
