/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.awesomebar.optimizedsuggestions

import android.graphics.Bitmap
import java.util.UUID
import mozilla.components.concept.awesomebar.AwesomeBar
import mozilla.components.concept.awesomebar.AwesomeBar.Suggestion
import mozilla.components.concept.awesomebar.AwesomeBar.Suggestion.Flag
import mozilla.components.concept.awesomebar.AwesomeBar.SuggestionItem
import mozilla.components.concept.awesomebar.AwesomeBar.SuggestionProvider

/**
 * [SportSuggestion] to be displayed by an [AwesomeBar] implementation for sport information.
 *
 * @property provider The provider this suggestion came from.
 * @property id A unique ID (provider scope) identifying this [SportSuggestion].
 * @property score A score used to rank suggestions of this provider against each other.
 * @property onSuggestionClicked A callback to be executed when the [SportSuggestion] was clicked by the user.
 * @property query The user input in the toolbar.
 * @property sport The sport name.
 * @property sportCategory The category of the sport (e.g. "baseball", "basketball", "football", "hockey").
 * @property date The date of the event.
 * @property status The status of the event.
 * @property statusType The type of the status.
 * @property homeTeam The home team information.
 * @property awayTeam The away team information.
 * @property flags A set of [Flag] values for this [Suggestion].
 */
data class SportSuggestion(
    override val provider: SuggestionProvider,
    override val id: String = UUID.randomUUID().toString(),
    override val score: Int = 0,
    override val onSuggestionClicked: (() -> Unit)? = null,
    val query: String,
    val sport: String,
    val sportCategory: SportSuggestionCategory,
    val date: SportSuggestionDate,
    val status: SportSuggestionStatus,
    val statusType: SportSuggestionStatusType,
    val homeTeam: SportSuggestionTeam,
    val awayTeam: SportSuggestionTeam,
    override val flags: Set<Flag> = emptySet(),
) : SuggestionItem

/** Represents the sports status type used by the Sports Suggestion. */
enum class SportSuggestionStatusType {
    PAST,
    LIVE,
    SCHEDULED,
    NONE,
}

/** Represents the sports category used by the Sports Suggestion. */
enum class SportSuggestionCategory {
    BASEBALL,
    BASKETBALL,
    HOCKEY,
    SOCCER,
    FOOTBALL,
    GOLF,
    RACING,
    MISC,
}

/** Represents the sports date used by the Sports Suggestion. */
sealed class SportSuggestionDate {
    /** Represents a date either in the past or in the future, but not including tomorrow e.g. 28 Oct 2025. */
    class General(val date: String) : SportSuggestionDate()

    /** Represents today's date. */
    object Today : SportSuggestionDate()

    /** Represents tomorrow's date. */
    class Tomorrow(val time: String) : SportSuggestionDate()
}

/**
 * Represents a team in a sport suggestion.
 *
 * @param name The name of the team.
 * @param score The score of the team.
 * @param icon The icon of the team.
 */
data class SportSuggestionTeam(
    val name: String,
    val score: Int?,
    val icon: Bitmap?,
)

/** Represents the various statuses a sport's game can have. */
sealed class SportSuggestionStatus {
    /** Represents the game status when the game is scheduled to take place. */
    data object Scheduled : SportSuggestionStatus()

    /** Represents the game status when the game has been delayed. */
    data object Delayed : SportSuggestionStatus()

    /** Represents the game status when the game has been postponed. */
    data object Postponed : SportSuggestionStatus()

    /** Represents the game status when the game is currently in progress. */
    data object InProgress : SportSuggestionStatus()

    /** Represents the game status when the game has been suspended. */
    data object Suspended : SportSuggestionStatus()

    /** Represents the game status when the game has been canceled. */
    data object Canceled : SportSuggestionStatus()

    /** Represents the game status when the game has finished. */
    data object Final : SportSuggestionStatus()

    /** Represents the game status when the game has been forfeited. */
    data object Forfeit : SportSuggestionStatus()

    /** Represents the game status when the status is not necessary. */
    data object NotNecessary : SportSuggestionStatus()

    /** Represents the game status when the status is unknown. */
    data object Unknown : SportSuggestionStatus()
}

/** Represents the state of a sport suggestion. */
data class SportSuggestionState(
    val sport: String,
    val sportCategory: SportSuggestionCategory,
    val status: SportSuggestionStatus,
    val statusType: SportSuggestionStatusType,
    val date: SportSuggestionDate,
    val homeTeam: SportSuggestionTeam,
    val awayTeam: SportSuggestionTeam,
)

/**
 * Domain model representing a single sport suggestion result.
 *
 * This model is independent of UI classes and is used as an intermediate data representation before being mapped into
 * an AwesomeBar-specific suggestion type (e.g. [SportSuggestion]).
 *
 * @property query The full query string that triggered this suggestion.
 * @property sport The sport name.
 * @property sportCategory The category of the sport (e.g. "baseball", "basketball", "football", "hockey").
 * @property date The date of the event.
 * @property status The status of the event.
 * @property statusType The type of the status.
 * @property homeTeam The home team information.
 * @property awayTeam The away team information.
 * @property touched The last time this sport event was updated, in ISO 8601 format.
 */
data class SportItem(
    val query: String,
    val sport: String,
    val sportCategory: String,
    val date: String,
    val status: String,
    val statusType: String,
    val homeTeam: Team,
    val awayTeam: Team,
    val touched: String,
) {
    /** Represents a team in a sport suggestion. */
    data class Team(
        val key: String,
        val name: String,
        val colors: List<String>,
        val score: Int?,
        val icon: String?,
    )
}
