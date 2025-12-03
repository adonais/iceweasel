/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.core.os.bundleOf
import androidx.lifecycle.Lifecycle.State.RESUMED
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext

/**
 * [Middleware] for the settings search screen.
 *
 * @property fenixSettingsIndexer [SettingsIndexer] to use for indexing and querying settings.
 * @property dispatcher [CoroutineDispatcher] to use for performing background tasks.
 */
class SettingsSearchMiddleware(
    val fenixSettingsIndexer: SettingsIndexer,
    val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : Middleware<SettingsSearchState, SettingsSearchAction> {
    internal var environment: SettingsSearchEnvironment? = null

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
            }
            is SettingsSearchAction.EnvironmentRehydrated -> {
                next(action)
                environment = action.environment
                environment?.fragment?.viewLifecycleOwner?.lifecycleScope?.launch {
                    observeRecentSearches(store)
                }
            }
            is SettingsSearchAction.EnvironmentCleared -> {
                next(action)
                environment = null
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
                    environment?.recentSettingsSearchesRepository?.addRecentSearchItem(searchItem)
                }
                CoroutineScope(Dispatchers.Main).launch {
                    environment?.navController?.navigate(fragmentId, bundle)
                }
                next(action)
            }
            is SettingsSearchAction.ClearRecentSearchesClicked -> {
                next(action)
                CoroutineScope(Dispatchers.IO).launch {
                    environment?.recentSettingsSearchesRepository?.clearRecentSearches()
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
        environment?.fragment?.viewLifecycleOwner?.run {
            lifecycleScope.launch {
                repeatOnLifecycle(RESUMED) {
                    environment?.recentSettingsSearchesRepository?.recentSearches?.collect { recents ->
                        store.dispatch(SettingsSearchAction.RecentSearchesUpdated(recents))
                    }
                }
            }
        }
    }
}
