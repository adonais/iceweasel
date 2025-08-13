/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.search

import io.mockk.mockk
import mozilla.components.browser.state.search.SearchEngine
import mozilla.components.support.test.ext.joinBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEnded
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEngineSelected
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchStarted
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.components.metrics.MetricsUtils

class SearchStateReducerTest {
    @Test
    fun `GIVEN no parameters provided WHEN the search is started THEN update the app state with default search related values`() {
        val appStore = AppStore()

        appStore.dispatch(SearchStarted()).joinBlocking()

        assertEquals(true, appStore.state.searchState.isSearchActive)
        assertNull(appStore.state.searchState.selectedSearchEngine)
        assertNull(appStore.state.searchState.sourceTabId)
        assertEquals(MetricsUtils.Source.NONE, appStore.state.searchState.searchAccessPoint)
    }

    @Test
    fun `GIVEN search details provided WHEN the search is started THEN update the app state with the provided details`() {
        val sourceTabId = "test"
        val source = MetricsUtils.Source.SUGGESTION
        val appStore = AppStore()

        appStore.dispatch(SearchStarted(sourceTabId, source)).joinBlocking()

        assertEquals(true, appStore.state.searchState.isSearchActive)
        assertNull(appStore.state.searchState.selectedSearchEngine)
        assertEquals(sourceTabId, appStore.state.searchState.sourceTabId)
        assertEquals(source, appStore.state.searchState.searchAccessPoint)
    }

    @Test
    fun `WHEN the search is ended THEN reset the search state in the app state`() {
        val appStore = AppStore(
            AppState(
                searchState = SearchState(
                    isSearchActive = true,
                    selectedSearchEngine = mockk(),
                    sourceTabId = "test",
                    searchAccessPoint = MetricsUtils.Source.ACTION,
                ),
            ),
        )

        appStore.dispatch(SearchEnded).joinBlocking()

        assertEquals(SearchState.EMPTY, appStore.state.searchState)
    }

    @Test
    fun `WHEN a new search engine is selected THEN add it in the app state`() {
        val searchEngine: SearchEngine = mockk()
        val appStore = AppStore()

        appStore.dispatch(SearchEngineSelected(searchEngine, true)).joinBlocking()

        assertEquals(searchEngine, appStore.state.searchState.selectedSearchEngine?.searchEngine)
        assertEquals(true, appStore.state.searchState.selectedSearchEngine?.isUserSelected)
    }
}
