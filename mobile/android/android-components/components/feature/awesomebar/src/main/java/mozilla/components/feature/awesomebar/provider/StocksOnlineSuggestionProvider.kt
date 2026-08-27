/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.awesomebar.provider

import androidx.annotation.VisibleForTesting
import mozilla.components.concept.awesomebar.AwesomeBar
import mozilla.components.feature.awesomebar.facts.SuggestionCardType
import mozilla.components.feature.awesomebar.facts.emitOptimizedSuggestionCardClickedFact
import mozilla.components.feature.awesomebar.facts.emitOptimizedSuggestionCardDisplayedFact
import mozilla.components.feature.awesomebar.optimizedsuggestions.ChangePercent
import mozilla.components.feature.awesomebar.optimizedsuggestions.CombinedSuggestionsDataSource
import mozilla.components.feature.awesomebar.optimizedsuggestions.StockItem
import mozilla.components.feature.awesomebar.optimizedsuggestions.StockSuggestion
import mozilla.components.feature.search.SearchUseCases
import java.text.NumberFormat
import java.util.Locale
import java.util.UUID
import kotlin.math.abs

internal const val DEFAULT_STOCK_SUGGESTION_LIMIT = 1

/**
 * [AwesomeBar.SuggestionProvider] implementation that provides suggestions based on online stocks.
 *
 * @param suggestionsHeader optional parameter to specify if the suggestion should have a header.
 * @property maxNumberOfSuggestions the maximum number of suggestions to be provided.
 */
class StocksOnlineSuggestionProvider(
    private val searchUseCase: SearchUseCases.SearchUseCase,
    private val dataSource: CombinedSuggestionsDataSource,
    private val suggestionsHeader: String? = null,
    @get:VisibleForTesting internal val maxNumberOfSuggestions: Int = DEFAULT_STOCK_SUGGESTION_LIMIT,
    private val locale: Locale = Locale.getDefault(),
) : AwesomeBar.SuggestionProvider {
    override val id: String = UUID.randomUUID().toString()

    override fun groupTitle(): String? {
        return suggestionsHeader
    }

    override fun displayGroupTitle(): Boolean {
        return false
    }

    private val trailingCurrencyRegex = Regex("""([A-Z]{3})\s*$""")
    private val numericRegex = Regex("""-?\d+(\.\d+)?""")

    override suspend fun onInputChanged(text: String): List<StockSuggestion> {
        if (text.isBlank()) return emptyList()

        val items = dataSource.fetchStocks(text)

        return items
            .asSequence()
            .mapNotNull { it.toSuggestionOrNull(locale) }
            .take(maxNumberOfSuggestions)
            .toList()
            .also {
                if (it.isNotEmpty()) {
                    emitOptimizedSuggestionCardDisplayedFact(SuggestionCardType.STOCKS)
                }
            }
    }

    private fun StockItem.toSuggestionOrNull(locale: Locale): StockSuggestion? {
        val hasRequiredFields =
            query.isNotBlank() && ticker.isNotBlank() && name.isNotBlank() && exchange.isNotBlank()

        val formattedLastPrice = formatLastPrice(lastPrice, locale)
        val parsedChange = parseChangePercent(todaysChangePerc, locale)

        return if (hasRequiredFields && formattedLastPrice != null && parsedChange != null) {
            StockSuggestion(
                onSuggestionClicked = {
                    emitOptimizedSuggestionCardClickedFact(SuggestionCardType.STOCKS)
                    searchUseCase.invoke(query)
                },
                provider = this@StocksOnlineSuggestionProvider,
                score = Int.MAX_VALUE,
                query = query,
                ticker = ticker,
                name = name,
                index = exchange,
                lastPrice = formattedLastPrice,
                changePercToday = parsedChange,
            )
        } else {
            null
        }
    }

    @VisibleForTesting
    internal fun parseChangePercent(rawChangePerc: String?, locale: Locale): ChangePercent? {
        val raw = rawChangePerc?.trim().orEmpty()
        val cleaned = raw.removeSuffix("%").trim()
        val numeric = cleaned
            .takeIf { it.isNotEmpty() }
            ?.replace(",", ".")
            ?.toDoubleOrNull()

        return numeric?.let { n ->
            if (n == 0.0) {
                ChangePercent.Neutral
            } else {
                val formatter = NumberFormat.getNumberInstance(locale).apply {
                    minimumFractionDigits = 2
                    maximumFractionDigits = 2
                    isGroupingUsed = false
                }
                val magnitude = formatter.format(abs(n))
                if (n > 0) {
                    ChangePercent.Positive("+$magnitude")
                } else {
                    ChangePercent.Negative("-$magnitude")
                }
            }
        }
    }

    @VisibleForTesting
    internal fun formatLastPrice(rawLastPrice: String?, locale: Locale): String? {
        val trimmed = rawLastPrice?.trim().orEmpty()

        val currency = trailingCurrencyRegex
            .find(trimmed)
            ?.groupValues
            ?.getOrNull(1)

        val value = numericRegex
            .find(trimmed)
            ?.value
            ?.replace(",", ".")
            ?.toDoubleOrNull()

        return if (trimmed.isNotEmpty() && currency != null && value != null) {
            val formatter = NumberFormat.getNumberInstance(locale).apply {
                minimumFractionDigits = 2
                maximumFractionDigits = 2
                isGroupingUsed = true
            }
            "$currency ${formatter.format(value)}"
        } else {
            null
        }
    }
}
