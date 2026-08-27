/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.awesomebar.optimizedsuggestions

/**
 * Combined data source for stocks, sports, and flights online suggestions.
 *
 * All three providers share one instance so that concurrent requests for the same query
 * are coalesced into a single network call.
 */
interface CombinedSuggestionsDataSource {
    /**
     * Fetch stock suggestions for [query].
     */
    suspend fun fetchStocks(query: String): List<StockItem>

    /**
     * Fetch sports suggestions for [query].
     */
    suspend fun fetchSports(query: String): List<SportItem>

    /**
     * Fetch flight suggestions for [query].
     */
    suspend fun fetchFlights(query: String): List<FlightItem>
}
