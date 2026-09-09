/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.awesomebar.provider

import mozilla.components.feature.awesomebar.optimizedsuggestions.CombinedSuggestionsDataSource
import mozilla.components.feature.awesomebar.optimizedsuggestions.FlightItem
import mozilla.components.feature.awesomebar.optimizedsuggestions.SportItem
import mozilla.components.feature.awesomebar.optimizedsuggestions.StockItem

/** Simple fake data source used for unit tests. Records calls and returns the specified results. */
class FakeCombinedOnlineSuggestionDataSource(
    private val stockResults: List<StockItem> = emptyList(),
    private val sportResults: List<SportItem> = emptyList(),
    private val flightResults: List<FlightItem> = emptyList(),
) : CombinedSuggestionsDataSource {
    val calls = mutableListOf<String>()

    override suspend fun fetchStocks(query: String): List<StockItem> {
        calls += query
        return stockResults
    }

    override suspend fun fetchSports(query: String): List<SportItem> {
        calls += query
        return sportResults
    }

    override suspend fun fetchFlights(query: String): List<FlightItem> {
        calls += query
        return flightResults
    }
}
