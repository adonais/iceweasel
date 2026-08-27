/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.awesomebar.optimizedsuggestions

import mozilla.components.concept.awesomebar.AwesomeBar
import mozilla.components.concept.awesomebar.AwesomeBar.Suggestion
import mozilla.components.concept.awesomebar.AwesomeBar.Suggestion.Flag
import mozilla.components.concept.awesomebar.AwesomeBar.SuggestionItem
import mozilla.components.concept.awesomebar.AwesomeBar.SuggestionProvider
import java.util.UUID

/**
 * [FlightSuggestion] to be displayed by an [AwesomeBar] implementation for flight information.
 *
 * @property provider The provider this suggestion came from.
 * @property id A unique ID (provider scope) identifying this [FlightSuggestion].
 * @property score A score used to rank suggestions of this provider against each other.
 * @property onSuggestionClicked A callback to be executed when the [FlightSuggestion] was clicked by the user.
 * @property flightNumber The IATA flight designator (e.g., "AA123").
 * @property airlineName The name of the airline.
 * @property flightStatus The status of the flight.
 * @property progress The progress of the flight until it reaches its destination (0f - 1f).
 * @property departureFlightData The departure flight data.
 * @property arrivalFlightData The arrival flight data.
 * @property flags A set of [Flag] values for this [Suggestion].
 */
data class FlightSuggestion(
    override val provider: SuggestionProvider,
    override val id: String = UUID.randomUUID().toString(),
    override val score: Int = 0,
    override val onSuggestionClicked: (() -> Unit)? = null,
    val flightNumber: String,
    val airlineName: String?,
    val flightStatus: FlightSuggestionStatus,
    val progress: Float,
    val departureFlightData: FlightData,
    val arrivalFlightData: FlightData,
    override val flags: Set<Flag> = emptySet(),
) : SuggestionItem

/**
 * Represents a flight in a flight suggestion card.
 *
 * @param airportCity The city where the airport is located.
 * @param airportCode The airport code.
 * @param time The time of the flight.
 * @param date The date of the flight.
 */
data class FlightData(
    val airportCity: String,
    val airportCode: String,
    val time: String,
    val date: String,
)

/**
 * Represents the flight status type used by the Flight Suggestion.
 */
enum class FlightSuggestionStatus { ON_TIME, IN_FLIGHT, DELAYED, CANCELLED, ARRIVED }

/**
 * Domain model representing a single flight suggestion result.
 *
 * This model is independent of UI classes and is used as an intermediate
 * data representation before being mapped into an AwesomeBar-specific
 * suggestion type (e.g. [AwesomeBar.FlightSuggestion]).
 *
 * @property flightNumber The IATA flight designator (e.g., "AA123").
 * @property destination The arrival airport information.
 * @property origin The departure airport information.
 * @property departure The departure timing information.
 * @property arrival The arrival timing information.
 * @property status The status of the flight.
 * @property progressPercent The progress of the flight until it reaches its destination (0-100).
 * @property timeLeftMinutes The time left in minutes until the flight reaches its destination.
 * @property delayed Whether the flight is delayed by ≥15 minutes compared to the scheduled time.
 * @property url The direct link to the FlightAware live page for this flight.
 * @property airline The operating airline for this flight.
 */
data class FlightItem(
    val flightNumber: String,
    val destination: Airport,
    val origin: Airport,
    val departure: Timing,
    val arrival: Timing,
    val status: String,
    val progressPercent: Int,
    val timeLeftMinutes: Int?,
    val delayed: Boolean,
    val url: String,
    val airline: Airline,
) {
    /**
     * Represents an airport in a flight suggestion.
     */
    data class Airport(
        val code: String,
        val city: String,
    )

    /**
     * Represents the departure and arrival times in a flight suggestion.
     *
     * Both scheduled and estimated times are in local airport time.
     * Estimated time is used when the flight is delayed. Otherwise, scheduled time is used.
     */
    data class Timing(
        val scheduledTime: String,
        val estimatedTime: String?,
    )

    /**
     * Represents an airline in a flight suggestion.
     */
    data class Airline(
        val code: String?,
        val name: String?,
        val color: String?,
        val icon: String?,
    )
}
