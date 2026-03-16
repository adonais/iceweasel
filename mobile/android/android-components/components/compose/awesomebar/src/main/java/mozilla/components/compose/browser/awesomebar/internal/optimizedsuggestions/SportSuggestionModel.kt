/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.awesomebar.internal.optimizedsuggestions

/**
 * Represents the sports status type used by the Sports Suggestion.
 */
enum class SportSuggestionStatusType { PAST, LIVE, SCHEDULED }

/**
 * Represents the sports date used by the Sports Suggestion.
 */
sealed class SportSuggestionDate {
    /**
     * Represents a date either in the past or in the future, but not including tomorrow e.g. 28 Oct 2025.
     */
    class General(val date: String) : SportSuggestionDate()

    /**
     * Represents Today's date.
     */
    object Today : SportSuggestionDate()

    /**
     * Represents tomorrow's date.
     */
    class Tomorrow(val time: String) : SportSuggestionDate()
}

/**
 * Represents a team in a sport suggestion.
 *
 * @param name The name of the team.
 * @param score The score of the team.
 */
data class SportSuggestionTeam(val name: String, val score: Int?)
