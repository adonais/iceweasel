/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.search

import mozilla.components.browser.state.search.SearchEngine
import org.mozilla.fenix.components.metrics.MetricsUtils

/**
 * Current search state of the application.
 *
 * @property isSearchActive Whether or not a search is active.
 * @property selectedSearchEngine The search engine to use for in-progress searches.
 * @property sourceTabId The ID of the tab that triggered the search.
 * May be `null` if search was not started from a browser tab.
 * @property searchAccessPoint The source of the search.
 */
data class SearchState(
    val isSearchActive: Boolean,
    val selectedSearchEngine: SelectedSearchEngine?,
    val sourceTabId: String?,
    val searchAccessPoint: MetricsUtils.Source,
) {
    /**
     * Static configuration of [SearchState].
     */
    companion object {
        /**
         * Empty [SearchState].
         */
        val EMPTY = SearchState(
            isSearchActive = false,
            selectedSearchEngine = null,
            sourceTabId = null,
            searchAccessPoint = MetricsUtils.Source.NONE,
        )
    }
}

/**
 * Search engine to use for in-progress searches instead of the default one.
 *
 * @property searchEngine The search engine to use for in-progress searches.
 * @property isUserSelected Whether or not the search engine is selected by the user.
 */
data class SelectedSearchEngine(
    val searchEngine: SearchEngine,
    val isUserSelected: Boolean,
)
