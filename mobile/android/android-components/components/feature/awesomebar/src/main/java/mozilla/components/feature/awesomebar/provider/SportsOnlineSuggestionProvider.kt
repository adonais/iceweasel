/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.awesomebar.provider

import androidx.annotation.VisibleForTesting
import kotlinx.coroutines.delay
import mozilla.components.concept.awesomebar.AwesomeBar
import mozilla.components.concept.awesomebar.optimizedsuggestions.SportSuggestionDate
import mozilla.components.concept.awesomebar.optimizedsuggestions.SportSuggestionStatus
import mozilla.components.concept.awesomebar.optimizedsuggestions.SportSuggestionStatusType
import mozilla.components.concept.awesomebar.optimizedsuggestions.SportSuggestionTeam
import mozilla.components.feature.search.SearchUseCases
import java.time.DateTimeException
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.FormatStyle
import java.util.Locale
import java.util.UUID

const val DEFAULT_SPORT_SUGGESTION_LIMIT = 1

/**
 * [AwesomeBar.SuggestionProvider] implementation that provides suggestions based on online sports.
 *
 * @property dataSource the [AwesomeBar.SportsSuggestionDataSource] to be used.
 * @property suggestionsHeader optional parameter to specify if the suggestion should have a header.
 * @property maxNumberOfSuggestions the maximum number of suggestions to be provided.
 */
class SportsOnlineSuggestionProvider(
    private val searchUseCase: SearchUseCases.SearchUseCase,
    private val dataSource: AwesomeBar.SportsSuggestionDataSource,
    private val suggestionsHeader: String? = null,
    @get:VisibleForTesting internal val maxNumberOfSuggestions: Int = DEFAULT_SPORT_SUGGESTION_LIMIT,
) : AwesomeBar.SuggestionProvider {
    override val id: String = UUID.randomUUID().toString()

    override fun groupTitle(): String? {
        return suggestionsHeader
    }

    override fun displayGroupTitle(): Boolean {
        return false
    }

    override suspend fun onInputChanged(text: String): List<AwesomeBar.SportSuggestion> {
        if (text.isBlank()) return emptyList()

        delay(ARTIFICIAL_DELAY)

        val results = dataSource.fetch(text)

        return results
            .asSequence()
            .mapNotNull { it.toSuggestionOrNull() }
            .take(maxNumberOfSuggestions)
            .toList()
    }

    private fun AwesomeBar.SportItem.toSuggestionOrNull(): AwesomeBar.SportSuggestion? {
        val hasRequiredFields =
            query.isNotBlank() && sport.isNotBlank()
        val date = parseDate(date)
        val status = parseStatus(status)
        val statusType = parseStatusType(statusType)
        val homeTeam = parseTeam(homeTeam)
        val awayTeam = parseTeam(awayTeam)
        val hasAllFields = date != null && homeTeam != null && awayTeam != null

        return if (hasRequiredFields && hasAllFields) {
            AwesomeBar.SportSuggestion(
                onSuggestionClicked = { searchUseCase.invoke(query) },
                provider = this@SportsOnlineSuggestionProvider,
                score = Int.MAX_VALUE,
                query = query,
                sport = sport,
                date = date,
                status = status,
                statusType = statusType,
                homeTeam = homeTeam,
                awayTeam = awayTeam,
            )
        } else {
            null
        }
    }

    @VisibleForTesting
    internal fun parseDate(
        date: String,
        locale: Locale = Locale.getDefault(),
        timeZone: ZoneId = ZoneId.systemDefault(),
    ): SportSuggestionDate? {
        val parsedDate = parseIsoDate(date, timeZone) ?: return null
        val today = LocalDateTime.now(timeZone).toLocalDate()
        val tomorrow = today.plusDays(1)

        return try {
            when (parsedDate.toLocalDate()) {
                today -> {
                    SportSuggestionDate.Today
                }
                tomorrow -> {
                    val time = parsedDate.format(
                        DateTimeFormatter
                            .ofLocalizedTime(FormatStyle.SHORT)
                            .withLocale(locale),
                    )
                    SportSuggestionDate.Tomorrow(time)
                }
                else -> {
                    val date = parsedDate.format(
                        DateTimeFormatter
                            .ofPattern("d MMM yyyy")
                            .withLocale(locale),
                    )
                    SportSuggestionDate.General(date)
                }
            }
        } catch (_: DateTimeException) {
            null
        }
    }

    private fun parseIsoDate(
        date: String,
        timeZone: ZoneId,
    ): LocalDateTime? = try {
        OffsetDateTime.parse(date).atZoneSameInstant(timeZone).toLocalDateTime()
    } catch (_: DateTimeParseException) {
        null
    }

    @VisibleForTesting
    internal fun parseStatus(status: String): SportSuggestionStatus {
        return when (status) {
            "Scheduled" -> SportSuggestionStatus.Scheduled
            "Delayed" -> SportSuggestionStatus.Delayed
            "Postponed" -> SportSuggestionStatus.Postponed
            "In Progress" -> SportSuggestionStatus.InProgress
            "Suspended" -> SportSuggestionStatus.Suspended
            "Canceled" -> SportSuggestionStatus.Canceled
            "Final" -> SportSuggestionStatus.Final
            "Final - Over Time" -> SportSuggestionStatus.FinalOverTime
            "Final - Shoot Out" -> SportSuggestionStatus.FinalShootOut
            "Forfeit" -> SportSuggestionStatus.Forfeit
            "Not Necessary" -> SportSuggestionStatus.NotNecessary
            else -> SportSuggestionStatus.Unknown
        }
    }

    @VisibleForTesting
    internal fun parseStatusType(statusType: String): SportSuggestionStatusType {
        return when (statusType) {
            "past" -> SportSuggestionStatusType.PAST
            "live" -> SportSuggestionStatusType.LIVE
            "scheduled" -> SportSuggestionStatusType.SCHEDULED
            else -> SportSuggestionStatusType.NONE
        }
    }

    @VisibleForTesting
    internal fun parseTeam(team: AwesomeBar.SportItem.Team): SportSuggestionTeam? {
        return team.name.takeIf { it.isNotBlank() }?.let {
            SportSuggestionTeam(it, team.score)
        }
    }
}
