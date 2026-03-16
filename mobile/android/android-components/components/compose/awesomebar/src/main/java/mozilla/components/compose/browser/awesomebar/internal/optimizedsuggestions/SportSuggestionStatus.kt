/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.awesomebar.internal.optimizedsuggestions

import mozilla.components.compose.browser.awesomebar.R

/**
 * Represents the various statuses a sports suggestion game can have.
 *
 * @param stringResId The string resource ID for the status.
 */
sealed class SportSuggestionStatus(val stringResId: Int?) {
    /**
     * Represents the game status when the game is scheduled to take place.
     */
    data object Scheduled : SportSuggestionStatus(R.string.mozac_browser_awesomebar_sport_suggestion_scheduled)

    /**
     * Represents the game status when the game has been delayed.
     */
    data object Delayed : SportSuggestionStatus(R.string.mozac_browser_awesomebar_sport_suggestion_delayed)

    /**
     * Represents the game status when the game has been postponed.
     */
    data object Postponed : SportSuggestionStatus(R.string.mozac_browser_awesomebar_sport_suggestion_postponed)

    /**
     * Represents the game status when the game is currently in progress.
     */
    data object InProgress : SportSuggestionStatus(R.string.mozac_browser_awesomebar_sport_suggestion_in_progress)

    /**
     * Represents the game status when the game has been suspended.
     */
    data object Suspended : SportSuggestionStatus(R.string.mozac_browser_awesomebar_sport_suggestion_suspended)

    /**
     * Represents the game status when the game has been canceled.
     */
    data object Canceled : SportSuggestionStatus(R.string.mozac_browser_awesomebar_sport_suggestion_canceled)

    /**
     * Represents the game status when the game has finished.
     */
    data object Final : SportSuggestionStatus(R.string.mozac_browser_awesomebar_sport_suggestion_final)

    /**
     * Represents the game status when the game has finished after over time.
     */
    data object FinalOverTime : SportSuggestionStatus(
        R.string.mozac_browser_awesomebar_sport_suggestion_final_over_time,
    )

    /**
     * Represents the game status when the game has finished after a shoot out.
     */
    data object FinalShootOut : SportSuggestionStatus(
        R.string.mozac_browser_awesomebar_sport_suggestion_final_shoot_out,
    )

    /**
     * Represents the game status when the game has been forfeited.
     */
    data object Forfeit : SportSuggestionStatus(R.string.mozac_browser_awesomebar_sport_suggestion_forfeited)

    /**
     * Represents the game status when the status is not necessary.
     */
    data object NotNecessary : SportSuggestionStatus(null)

    /**
     * Represents the game status when the status is unknown.
     */
    data object Unknown : SportSuggestionStatus(null)
}
