/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.fxsuggest.datasource

import mozilla.components.concept.awesomebar.AwesomeBar

/**
 * Mock implementation of [mozilla.components.concept.awesomebar.AwesomeBar.StocksSuggestionDataSource].
 *
 * This data source returns a static list of predefined stock suggestions and is intended
 * strictly for development, visual testing, and UI prototyping.
 *
 * It does not perform any network requests and does not simulate latency.
 * If realistic behaviour (e.g. delayed responses, cancellation, overlapping requests)
 * is required for testing asynchronous flows, consider adding an artificial delay
 * inside [fetch] or using a test-specific implementation.
 *
 * This implementation should not be used in production builds.
 */
class MockedStocksSuggestionDataSource : AwesomeBar.StocksSuggestionDataSource {
    override suspend fun fetch(query: String): List<AwesomeBar.StockItem> {
        if (query.contains("QQQ stock", ignoreCase = true)) {
            return listOf(
                AwesomeBar.StockItem(
                    query = "QQQ stock",
                    name = "Invesco QQQ Trust",
                    ticker = "QQQ",
                    todaysChangePerc = "+1.53",
                    lastPrice = "$539.78 USD",
                    exchange = "NASDAQ",
                    imageUrl = "",
                ),
            )
        } else if (query.contains("DIA stock", ignoreCase = true)) {
            return listOf(
                AwesomeBar.StockItem(
                    query = "DIA stock",
                    name = "SPDR Dow Jones ETF",
                    ticker = "DIA",
                    todaysChangePerc = "0",
                    lastPrice = "$430.80 USD",
                    exchange = "Dow Jones",
                    imageUrl = "",
                ),
            )
        }
        return listOf(
            AwesomeBar.StockItem(
                query = "VOO stock",
                name = "Vanguard S&P 500 ETF",
                ticker = "VOO",
                todaysChangePerc = "-0.11",
                lastPrice = "$559.44 USD",
                exchange = "S&P 500",
                imageUrl = "",
            ),
            AwesomeBar.StockItem(
                query = "QQQ stock",
                name = "Invesco QQQ Trust",
                ticker = "QQQ",
                todaysChangePerc = "+1.53",
                lastPrice = "$539.78 USD",
                exchange = "NASDAQ",
                imageUrl = "",
            ),
            AwesomeBar.StockItem(
                query = "DIA stock",
                name = "SPDR Dow Jones ETF",
                ticker = "DIA",
                todaysChangePerc = "0",
                lastPrice = "$430.80 USD",
                exchange = "Dow Jones",
                imageUrl = "",
            ),
        )
    }
}
