/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.state.search

import mozilla.components.browser.state.state.selectedOrDefaultSearchEngine
import mozilla.components.browser.state.store.BrowserStore

/**
 * An interface for providing the default search engine.
 * This can be used to abstract the source of the default search engine.
 * */
interface SearchEngineProvider {
    /**
     * Retrieves the default search engine currently set.
     *
     * @return The [SearchEngine] object representing the default search engine,
     * or `null` if no default search engine is set or available.
     */
    fun getDefaultSearchEngine(): SearchEngine?
}

/**
 * A [SearchEngineProvider] that provides the default search engine based on the current
 * state of the [BrowserStore].
 *
 * @property store The [BrowserStore] instance to retrieve the search engine state from.
 */
class DefaultSearchEngineProvider(private val store: BrowserStore) : SearchEngineProvider {
    override fun getDefaultSearchEngine(): SearchEngine? {
        return store.state.search.selectedOrDefaultSearchEngine // The extension function call
    }
}
