/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.awesomebar.optimizedsuggestions

import java.util.UUID
import mozilla.components.concept.awesomebar.AwesomeBar
import mozilla.components.concept.awesomebar.AwesomeBar.Suggestion
import mozilla.components.concept.awesomebar.AwesomeBar.Suggestion.Flag
import mozilla.components.concept.awesomebar.AwesomeBar.SuggestionItem
import mozilla.components.concept.awesomebar.AwesomeBar.SuggestionProvider

/**
 * [StockSuggestion] to be displayed by an [AwesomeBar] implementation for stock information.
 *
 * @property provider The provider this suggestion came from.
 * @property id A unique ID (provider scope) identifying this [StockSuggestion].
 * @property score A score used to rank suggestions of this provider against each other.
 * @property onSuggestionClicked A callback to be executed when the [StockSuggestion] was clicked by the user.
 * @property query The user input in the toolbar.
 * @property ticker The stock ticker symbol (e.g., "AAPL", "GOOGL").
 * @property name The full name of the stock.
 * @property index The stock index or exchange where the stock is listed (e.g., "NASDAQ", "NYSE").
 * @property lastPrice The ask price from the most recent quote for this ticker.
 * @property changePercToday The percentage change since the previous day.
 * @property flags A set of [Flag] values for this [Suggestion].
 */
data class StockSuggestion(
    override val provider: SuggestionProvider,
    override val id: String = UUID.randomUUID().toString(),
    override val score: Int = 0,
    override val onSuggestionClicked: (() -> Unit)? = null,
    val query: String,
    val ticker: String,
    val name: String,
    val index: String,
    val lastPrice: String,
    val changePercToday: ChangePercent,
    override val flags: Set<Flag> = emptySet(),
) : SuggestionItem

/**
 * Domain model representing a single stock suggestion result.
 *
 * This model is independent of UI classes and is used as an intermediate data representation before being mapped into
 * an AwesomeBar-specific suggestion type (e.g. [StockSuggestion]).
 *
 * @property query The full query string that triggered this suggestion.
 * @property name The full display name of the stock or fund.
 * @property ticker The stock ticker symbol.
 * @property todaysChangePerc The percentage change today.
 * @property lastPrice The last traded price, including currency.
 * @property exchange The index the stock belongs to.
 * @property imageUrl The URL of the stock's logo.
 */
data class StockItem(
    val query: String,
    val name: String,
    val ticker: String,
    val todaysChangePerc: String,
    val lastPrice: String,
    val exchange: String,
    val imageUrl: String?,
)

/** Represents the change percent used by the Stocks Suggestion. */
sealed class ChangePercent(val value: String) {
    /** Represents a positive percentage change. */
    class Positive(value: String) : ChangePercent(value)

    /** Represents a negative percentage change. */
    class Negative(value: String) : ChangePercent(value)

    /** Represents a neutral (zero) percentage change. */
    object Neutral : ChangePercent(value = "0")
}
