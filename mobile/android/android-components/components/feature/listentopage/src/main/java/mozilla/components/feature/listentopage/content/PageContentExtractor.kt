/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.content

/** An interface to conform to to deliver the text of an article. */
fun interface PageContentExtractor {
    /** Retrieves the article text of the page loaded in [tabId]. */
    suspend fun getPageContent(tabId: String): Result<String>
}
