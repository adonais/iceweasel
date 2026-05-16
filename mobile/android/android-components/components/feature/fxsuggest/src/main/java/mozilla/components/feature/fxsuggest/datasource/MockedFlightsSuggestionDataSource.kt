/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.fxsuggest.datasource

import mozilla.components.concept.awesomebar.AwesomeBar

/**
 * Mock implementation of [mozilla.components.concept.awesomebar.AwesomeBar.FlightsSuggestionDataSource].
 *
 * This data source returns a static list of predefined flight suggestions and is intended
 * strictly for development, visual testing, and UI prototyping.
 *
 * It does not perform any network requests and does not simulate latency.
 * If realistic behavior (e.g. delayed responses, cancellation, overlapping requests)
 * is required for testing asynchronous flows, consider adding an artificial delay
 * inside [fetch] or using a test-specific implementation.
 *
 * This implementation should not be used in production builds.
 */
class MockedFlightsSuggestionDataSource : AwesomeBar.FlightsSuggestionDataSource {
    override suspend fun fetch(query: String): List<AwesomeBar.FlightItem> {
        val q = query.lowercase()

        return buildList {
            if ("aa123" in q) add(americanAirlines)
            if ("ac342" in q) add(airCanada)
            if ("ua456" in q) add(unitedAirlines)
            if ("dl789" in q) add(deltaAirLines)
            if ("ba250" in q) add(britishAirways)
            if ("lh333" in q) add(lufthansa)
        }
    }

    private val americanAirlines = AwesomeBar.FlightItem(
        flightNumber = "AA123",
        destination = AwesomeBar.FlightItem.Airport(
            code = "New York",
            city = "JFK",
        ),
        origin = AwesomeBar.FlightItem.Airport(
            code = "Los Angeles",
            city = "LAX",
        ),
        departure = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2025-10-05T13:05:00-07:00",
            estimatedTime = null,
        ),
        arrival = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2025-10-05T18:20:00-04:00",
            estimatedTime = null,
        ),
        status = "En Route",
        progressPercent = 74,
        timeLeftMinutes = null,
        delayed = false,
        url = "https://www.flightaware.com/live/flight/AAL123",
        airline = AwesomeBar.FlightItem.Airline(
            code = "AAL",
            name = "American Airlines",
            color = null,
            icon = null,
        ),
    )

    private val airCanada = AwesomeBar.FlightItem(
        flightNumber = "AC342",
        destination = AwesomeBar.FlightItem.Airport(
            code = "YOW",
            city = "Ottawa",
        ),
        origin = AwesomeBar.FlightItem.Airport(
            code = "YVR",
            city = "Vancouver",
        ),
        departure = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2026-03-27T08:40:00-07:00",
            estimatedTime = "2026-03-27T09:15:00-07:00",
        ),
        arrival = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2026-03-27T16:00:00-04:00",
            estimatedTime = "2026-03-27T16:35:00-04:00",
        ),
        status = "En Route",
        progressPercent = 43,
        timeLeftMinutes = null,
        delayed = true,
        url = "https://www.flightaware.com/live/flight/ACA342",
        airline = AwesomeBar.FlightItem.Airline(
            code = "ACA",
            name = "Air Canada",
            color = null,
            icon = null,
        ),
    )

    private val unitedAirlines = AwesomeBar.FlightItem(
        flightNumber = "UA456",
        destination = AwesomeBar.FlightItem.Airport(
            code = "ORD",
            city = "Chicago",
        ),
        origin = AwesomeBar.FlightItem.Airport(
            code = "AUS",
            city = "Austin",
        ),
        departure = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2026-03-27T13:20:00-05:00",
            estimatedTime = "2026-03-27T13:30:00-05:00",
        ),
        arrival = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2026-03-27T15:50:00-05:00",
            estimatedTime = "2026-03-27T15:50:00-05:00",
        ),
        status = "Delayed",
        progressPercent = 0,
        timeLeftMinutes = null,
        delayed = true,
        url = "https://www.flightaware.com/live/flight/UAL456",
        airline = AwesomeBar.FlightItem.Airline(
            code = "UAL",
            name = "United Airlines",
            color = null,
            icon = null,
        ),
    )

    private val deltaAirLines = AwesomeBar.FlightItem(
        flightNumber = "DL789",
        destination = AwesomeBar.FlightItem.Airport(
            code = "ATL",
            city = "Atlanta",
        ),
        origin = AwesomeBar.FlightItem.Airport(
            code = "BNA",
            city = "Nashville",
        ),
        departure = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2026-03-27T19:00:00-05:00",
            estimatedTime = null,
        ),
        arrival = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2026-03-27T21:50:00-04:00",
            estimatedTime = null,
        ),
        status = "Cancelled",
        progressPercent = 0,
        timeLeftMinutes = null,
        delayed = false,
        url = "https://www.flightaware.com/live/flight/DAL789",
        airline = AwesomeBar.FlightItem.Airline(
            code = "DAL",
            name = "Delta Air Lines",
            color = null,
            icon = null,
        ),
    )

    private val britishAirways = AwesomeBar.FlightItem(
        flightNumber = "BA250",
        destination = AwesomeBar.FlightItem.Airport(
            code = "LHR",
            city = "London",
        ),
        origin = AwesomeBar.FlightItem.Airport(
            code = "SCL",
            city = "Santiago",
        ),
        departure = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2026-03-27T13:05:00-03:00",
            estimatedTime = null,
        ),
        arrival = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2026-03-28T06:25:00+00:00",
            estimatedTime = null,
        ),
        status = "Scheduled",
        progressPercent = 0,
        timeLeftMinutes = null,
        delayed = false,
        url = "https://www.flightaware.com/live/flight/BAW250",
        airline = AwesomeBar.FlightItem.Airline(
            code = "BAW",
            name = "British Airways",
            color = null,
            icon = null,
        ),
    )

    private val lufthansa = AwesomeBar.FlightItem(
        flightNumber = "LH333",
        destination = AwesomeBar.FlightItem.Airport(
            code = "FRA",
            city = "Frankfurt am Main",
        ),
        origin = AwesomeBar.FlightItem.Airport(
            code = "VCE",
            city = "Venice",
        ),
        departure = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2026-03-28T06:45:00+01:00",
            estimatedTime = null,
        ),
        arrival = AwesomeBar.FlightItem.Timing(
            scheduledTime = "2026-03-28T08:10:00+01:00",
            estimatedTime = null,
        ),
        status = "Arrived",
        progressPercent = 100,
        timeLeftMinutes = null,
        delayed = false,
        url = "https://www.flightaware.com/live/flight/DLH333",
        airline = AwesomeBar.FlightItem.Airline(
            code = "DLH",
            name = "Lufthansa",
            color = null,
            icon = null,
        ),
    )
}
