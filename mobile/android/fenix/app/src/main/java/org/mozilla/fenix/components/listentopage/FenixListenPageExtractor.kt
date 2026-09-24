/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.listentopage

import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import mozilla.components.concept.engine.EngineSession
import mozilla.components.concept.engine.pageextraction.ContentParams
import mozilla.components.feature.listentopage.content.PageContentExtractor
import mozilla.components.feature.listentopage.content.PageMetadata
import mozilla.components.feature.listentopage.content.PageMetadataExtractor

/** Plain prose is what gets synthesized, so links contribute their text but not their target. */
private val CONTENT_PARAMS = ContentParams(removeBoilerplate = true, useSimpleText = true)

/**
 * Fenix specific implementation of [PageContentExtractor] and [PageMetadataExtractor], reading the article of a tab
 * from its [EngineSession].
 *
 * The tab is named on every call rather than held, because a listening session outlives the tab being selected and the
 * session it was requested for is the one that must be read.
 *
 * @param engineSessionProvider Closure to provide the [EngineSession] of a given tab, or `null` when the tab is gone.
 */
class FenixListenPageExtractor(private val engineSessionProvider: (tabId: String) -> EngineSession?) :
    PageContentExtractor, PageMetadataExtractor {

    override suspend fun getPageContent(tabId: String): Result<String> = runCatching {
        suspendCancellableCoroutine { continuation ->
            engineSession(tabId)
                .getPageContent(
                    options = CONTENT_PARAMS,
                    onResult = { content ->
                        continuation.resume(content)
                    },
                    onException = { error ->
                        continuation.resumeWithException(error)
                    },
                )
        }
    }

    override suspend fun getPageMetadata(tabId: String): Result<PageMetadata> = runCatching {
        suspendCancellableCoroutine { continuation ->
            engineSession(tabId)
                .getPageMetadata(
                    onResult = { metadata ->
                        continuation.resume(PageMetadata(languageTag = metadata.language))
                    },
                    onException = { error ->
                        continuation.resumeWithException(error)
                    },
                )
        }
    }

    private fun engineSession(tabId: String): EngineSession =
        requireNotNull(engineSessionProvider(tabId)) { "No engine session for tab $tabId" }
}
