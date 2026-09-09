/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.session

import kotlinx.coroutines.test.runTest
import mozilla.components.concept.storage.FrecencyThresholdOption
import mozilla.components.concept.storage.HistoryStorage
import mozilla.components.concept.storage.PageObservation
import mozilla.components.concept.storage.PageVisit
import mozilla.components.concept.storage.SearchResult
import mozilla.components.concept.storage.TopFrecentSiteInfo
import mozilla.components.concept.storage.VisitInfo
import mozilla.components.concept.storage.VisitType
import mozilla.components.concept.toolbar.AutocompleteProvider
import mozilla.components.concept.toolbar.AutocompleteResult
import mozilla.components.support.test.mock
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.mockito.Mockito.verify

class HistoryDelegateTest {

    @Test
    fun `history delegate passes through onVisited calls`() = runTest {
        val storage = mock<HistoryStorage>()
        val delegate = HistoryDelegate(lazy { storage })

        delegate.onVisited("http://www.mozilla.org", PageVisit(VisitType.LINK))
        verify(storage).recordVisit("http://www.mozilla.org", PageVisit(VisitType.LINK))

        delegate.onVisited("http://www.firefox.com", PageVisit(VisitType.RELOAD))
        verify(storage).recordVisit("http://www.firefox.com", PageVisit(VisitType.RELOAD))

        delegate.onVisited("http://www.firefox.com", PageVisit(VisitType.BOOKMARK))
        verify(storage).recordVisit("http://www.firefox.com", PageVisit(VisitType.BOOKMARK))
    }

    @Test
    fun `history delegate passes through onTitleChanged calls`() = runTest {
        val storage = mock<HistoryStorage>()
        val delegate = HistoryDelegate(lazy { storage })

        delegate.onTitleChanged("http://www.mozilla.org", "Mozilla")
        verify(storage).recordObservation("http://www.mozilla.org", PageObservation("Mozilla"))
    }

    @Test
    fun `history delegate passes through onPreviewImageChange calls`() = runTest {
        val storage = mock<HistoryStorage>()
        val delegate = HistoryDelegate(lazy { storage })

        val previewImageUrl = "https://test.com/og-image-url"
        delegate.onPreviewImageChange("http://www.mozilla.org", previewImageUrl)
        verify(storage)
            .recordObservation(
                "http://www.mozilla.org",
                PageObservation(previewImageUrl = previewImageUrl),
            )
    }

    @Test
    fun `history delegate passes through getVisited calls`() = runTest {
        val storage = TestHistoryStorage()
        val delegate = HistoryDelegate(lazy { storage })

        assertFalse(storage.getVisitedPlainCalled)
        assertFalse(storage.getVisitedListCalled)
        assertFalse(storage.canAddUriCalled)

        delegate.getVisited()
        assertTrue(storage.getVisitedPlainCalled)
        assertFalse(storage.getVisitedListCalled)
        assertFalse(storage.canAddUriCalled)

        delegate.getVisited(listOf("http://www.mozilla.org", "http://www.firefox.com"))
        assertTrue(storage.getVisitedListCalled)
        assertFalse(storage.canAddUriCalled)
    }

    @Test
    fun `history delegate checks with storage canAddUriCalled`() = runTest {
        val storage = TestHistoryStorage()
        val delegate = HistoryDelegate(lazy { storage })

        assertFalse(storage.canAddUriCalled)
        delegate.shouldStoreUri("test")
        assertTrue(storage.canAddUriCalled)
    }

    @Test
    fun `hasVisitedSince returns true when the host was visited in the window`() = runTest {
        val storage = TestHistoryStorage()
        storage.detailedVisits = listOf(visit("https://www.mozilla.org/en-US/"))
        val delegate = HistoryDelegate(lazy { storage })

        assertTrue(delegate.hasVisitedSince("mozilla.org", 1000L, 5000L))
    }

    @Test
    fun `hasVisitedSince matches subdomains of the eTLD+1`() = runTest {
        val storage = TestHistoryStorage()
        storage.detailedVisits = listOf(visit("https://support.mozilla.org/"))
        val delegate = HistoryDelegate(lazy { storage })

        assertTrue(delegate.hasVisitedSince("mozilla.org", 1000L, 5000L))
    }

    @Test
    fun `hasVisitedSince returns false when only other hosts were visited`() = runTest {
        val storage = TestHistoryStorage()
        storage.detailedVisits =
            listOf(
                visit("https://www.firefox.com/"),
                visit("https://notmozilla.org/"),
            )
        val delegate = HistoryDelegate(lazy { storage })

        assertFalse(delegate.hasVisitedSince("mozilla.org", 1000L, 5000L))
    }

    @Test
    fun `hasVisitedSince returns false when there are no visits`() = runTest {
        val storage = TestHistoryStorage()
        val delegate = HistoryDelegate(lazy { storage })

        assertFalse(delegate.hasVisitedSince("mozilla.org", 1000L, 5000L))
    }

    @Test
    fun `hasVisitedSince queries a half-open window ending before the upper bound`() = runTest {
        val storage = TestHistoryStorage()
        val delegate = HistoryDelegate(lazy { storage })

        delegate.hasVisitedSince("mozilla.org", 1000L, 5000L)

        assertEquals(1000L, storage.detailedVisitsStart)
        assertEquals(4999L, storage.detailedVisitsEnd)
    }

    @Test
    fun `hasVisitedSince returns false without querying for an empty window`() = runTest {
        val storage = TestHistoryStorage()
        val delegate = HistoryDelegate(lazy { storage })

        assertFalse(delegate.hasVisitedSince("mozilla.org", 5000L, 5000L))
        assertEquals(null, storage.detailedVisitsStart)
    }

    private fun visit(url: String) =
        VisitInfo(
            url = url,
            title = null,
            visitTime = 0L,
            visitType = VisitType.LINK,
            previewImageUrl = null,
            isRemote = false,
        )

    private class TestHistoryStorage : HistoryStorage, AutocompleteProvider {
        var getVisitedListCalled = false
        var getVisitedPlainCalled = false
        var canAddUriCalled = false

        var detailedVisits: List<VisitInfo> = emptyList()
        var detailedVisitsStart: Long? = null
        var detailedVisitsEnd: Long? = null

        override suspend fun warmUp() {
            fail()
        }

        override suspend fun recordVisit(uri: String, visit: PageVisit) {}

        override suspend fun recordObservation(uri: String, observation: PageObservation) {}

        override fun canAddUri(uri: String): Boolean {
            canAddUriCalled = true
            return true
        }

        override suspend fun getVisited(uris: List<String>): List<Boolean> {
            getVisitedListCalled = true
            assertEquals(listOf("http://www.mozilla.org", "http://www.firefox.com"), uris)
            return emptyList()
        }

        override suspend fun getVisited(): List<String> {
            getVisitedPlainCalled = true
            return emptyList()
        }

        override suspend fun getDetailedVisits(start: Long, end: Long, excludeTypes: List<VisitType>): List<VisitInfo> {
            detailedVisitsStart = start
            detailedVisitsEnd = end
            return detailedVisits
        }

        override suspend fun getVisitsPaginated(
            offset: Long,
            count: Long,
            excludeTypes: List<VisitType>,
        ): List<VisitInfo> {
            fail()
            return emptyList()
        }

        override suspend fun getTopFrecentSites(
            numItems: Int,
            frecencyThreshold: FrecencyThresholdOption,
        ): List<TopFrecentSiteInfo> {
            fail()
            return emptyList()
        }

        override fun getSuggestions(query: String, limit: Int): List<SearchResult> {
            fail()
            return listOf()
        }

        override suspend fun getAutocompleteSuggestion(query: String): AutocompleteResult? {
            fail()
            return null
        }

        override suspend fun deleteEverything() {
            fail()
        }

        override suspend fun deleteVisitsSince(since: Long) {
            fail()
        }

        override suspend fun deleteVisitsBetween(startTime: Long, endTime: Long) {
            fail()
        }

        override suspend fun deleteVisitsFor(url: String) {
            fail()
        }

        override suspend fun deleteVisit(url: String, timestamp: Long) {
            fail()
        }

        override suspend fun runMaintenance(dbSizeLimit: UInt) {
            fail()
        }

        override fun cleanup() {
            fail()
        }

        override fun cancelWrites() {
            fail()
        }

        override fun cancelReads() {
            fail()
        }

        override fun cancelReads(nextQuery: String) {
            fail()
        }
    }
}
