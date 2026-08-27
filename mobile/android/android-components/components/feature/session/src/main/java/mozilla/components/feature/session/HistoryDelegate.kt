/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.session

import mozilla.components.concept.engine.history.HistoryTrackingDelegate
import mozilla.components.concept.storage.HistoryStorage
import mozilla.components.concept.storage.PageObservation
import mozilla.components.concept.storage.PageVisit
import mozilla.components.support.ktx.kotlin.tryGetHostFromUrl

/**
 * Implementation of the [HistoryTrackingDelegate] which delegates work to an instance of [HistoryStorage].
 */
class HistoryDelegate(private val historyStorage: Lazy<HistoryStorage>) : HistoryTrackingDelegate {
    override suspend fun onVisited(uri: String, visit: PageVisit) {
        historyStorage.value.recordVisit(uri, visit)
    }

    override suspend fun onTitleChanged(uri: String, title: String) {
        historyStorage.value.recordObservation(uri, PageObservation(title = title))
    }

    override suspend fun onPreviewImageChange(uri: String, previewImageUrl: String) {
        historyStorage.value.recordObservation(
            uri,
            PageObservation(previewImageUrl = previewImageUrl),
        )
    }

    override suspend fun getVisited(uris: List<String>): List<Boolean> {
        return historyStorage.value.getVisited(uris)
    }

    override suspend fun getVisited(): List<String> {
        return historyStorage.value.getVisited()
    }

    override suspend fun hasVisitedSince(
        host: String,
        afterEpochMillis: Long,
        beforeEpochMillis: Long,
    ): Boolean {
        if (beforeEpochMillis <= afterEpochMillis) {
            return false
        }
        // getDetailedVisits' end bound is inclusive, so subtract 1ms to keep the
        // window half-open and exclude the current load's own visit.
        return historyStorage.value
            .getDetailedVisits(afterEpochMillis, beforeEpochMillis - 1)
            .any { it.url.hostMatchesDomain(host) }
    }

    override fun shouldStoreUri(uri: String) = historyStorage.value.canAddUri(uri)
}

/**
 * Whether the host of this URL is [domain] or one of its subdomains.
 */
private fun String.hostMatchesDomain(domain: String): Boolean {
    val host = tryGetHostFromUrl()
    return host == domain || host.endsWith(".$domain")
}
