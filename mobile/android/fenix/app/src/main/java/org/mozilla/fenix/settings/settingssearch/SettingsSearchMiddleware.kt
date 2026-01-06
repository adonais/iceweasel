/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.core.os.bundleOf
import androidx.navigation.NavController
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext

/**
 * [Middleware] for the settings search screen.
 *
 * @param fenixSettingsIndexer [SettingsIndexer] to use for indexing and querying settings.
 * @param navController [NavController] used for navigation.
 * @param recentSettingsSearchesRepository [RecentSettingsSearchesRepository] used for storing recent searches.
 * @param scope [CoroutineScope] used for running long running operations in background.
 * @param dispatcher [CoroutineDispatcher] to use for performing background tasks.
 */
class SettingsSearchMiddleware(
    private val fenixSettingsIndexer: SettingsIndexer,
    private val navController: NavController,
    private val recentSettingsSearchesRepository: RecentSettingsSearchesRepository,
    private val scope: CoroutineScope,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : Middleware<SettingsSearchState, SettingsSearchAction> {
    override fun invoke(
        context: MiddlewareContext<SettingsSearchState, SettingsSearchAction>,
        next: (SettingsSearchAction) -> Unit,
        action: SettingsSearchAction,
    ) {
        val store = context.store as SettingsSearchStore
        when (action) {
            is SettingsSearchAction.Init -> {
                next(action)
                fenixSettingsIndexer.indexAllSettings()
                scope.launch { observeRecentSearches(store) }
            }
            is SettingsSearchAction.SearchQueryUpdated -> {
                next(action)
                CoroutineScope(dispatcher).launch {
                    val results = fenixSettingsIndexer.getSettingsWithQuery(action.query)
                    if (results.isEmpty()) {
                        store.dispatch(SettingsSearchAction.NoResultsFound(action.query))
                    } else {
                        store.dispatch(
                            SettingsSearchAction.SearchResultsLoaded(
                                query = action.query,
                                results = results,
                            ),
                        )
                    }
                }
            }
            is SettingsSearchAction.ResultItemClicked -> {
                val searchItem = action.item
                val bundle = bundleOf(
                    "preference_to_scroll_to" to searchItem.preferenceKey,
                    "search_in_progress" to true,
                )
                val fragmentId = searchItem.preferenceFileInformation.fragmentId
                CoroutineScope(dispatcher).launch {
                    recentSettingsSearchesRepository.addRecentSearchItem(searchItem)
                }
                CoroutineScope(Dispatchers.Main).launch {
                    navController.navigate(fragmentId, bundle)
                }
                next(action)
            }
            is SettingsSearchAction.ClearRecentSearchesClicked -> {
                next(action)
                CoroutineScope(Dispatchers.IO).launch {
                    recentSettingsSearchesRepository.clearRecentSearches()
                }
            }
            else -> {
                next(action)
                // no op in middleware layer
            }
        }
    }

    /**
     * Observes the recent searches repository and updates the store when the list of recent searches changes.
     *
     * @param store The [SettingsSearchStore] to dispatch the updates to.
     */
    private fun observeRecentSearches(store: SettingsSearchStore) {
        scope.launch {
            recentSettingsSearchesRepository.recentSearches.collect { recents ->
                store.dispatch(SettingsSearchAction.RecentSearchesUpdated(recents))
            }
        }
    }
}
