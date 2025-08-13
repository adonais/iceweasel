/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.search

import org.mozilla.fenix.components.appstate.AppAction.SearchAction
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEnded
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEngineSelected
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchStarted
import org.mozilla.fenix.components.appstate.AppState

/**
 * [AppState] reducer functionality specific for [SearchAction].
 */
object SearchStateReducer {
    /**
     * [AppState] reducer of [SearchAction].
     */
    fun reduce(state: AppState, action: SearchAction): AppState = when (action) {
        is SearchStarted -> state.updateSearchState {
            copy(
                isSearchActive = true,
                sourceTabId = action.tabId,
                searchAccessPoint = action.source,
            )
        }
        is SearchEnded -> state.updateSearchState {
            SearchState.EMPTY
        }
        is SearchEngineSelected -> state.updateSearchState {
            copy(
                selectedSearchEngine = SelectedSearchEngine(
                    searchEngine = action.searchEngine,
                    isUserSelected = action.isUserSelected,
                ),
            )
        }
    }

    private fun AppState.updateSearchState(update: SearchState.() -> SearchState) = copy(
        searchState = searchState.update(),
    )
}
