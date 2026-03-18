/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.fxsuggest

import mozilla.components.concept.awesomebar.AwesomeBar
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Mock implementation of [AwesomeBar.SportsSuggestionDataSource].
 *
 * This data source returns a static list of predefined sport suggestions and is intended
 * strictly for development, visual testing, and UI prototyping.
 *
 * It does not perform any network requests and does not simulate latency.
 * If realistic behaviour (e.g. delayed responses, cancellation, overlapping requests)
 * is required for testing asynchronous flows, consider adding an artificial delay
 * inside [fetch] or using a test-specific implementation.
 *
 * This implementation should not be used in production builds.
 */
class MockedSportsSuggestionDataSource : AwesomeBar.SportsSuggestionDataSource {
    override suspend fun fetch(query: String): List<AwesomeBar.SportItem> {
        val q = query.lowercase()
        val zone = ZoneId.systemDefault()
        val now = ZonedDateTime.now(zone).toLocalDate()

        val today = now
            .atStartOfDay(zone)
            .toOffsetDateTime()
            .toString()
        val tomorrowAt5pm = now
            .plusDays(1)
            .atTime(17, 0)
            .atZone(zone)
            .toOffsetDateTime()
            .toString()
        val oct28 = ZonedDateTime.of(LocalDateTime.parse("2025-10-28T00:00:00"), zone)
            .toOffsetDateTime()
            .toString()
        val nov28 = ZonedDateTime.of(LocalDateTime.parse("2024-11-28T00:00:00"), zone)
            .toOffsetDateTime()
            .toString()

        return buildList {
            if ("nba" in q) add(nbaSportItem(oct28))
            if ("nfl" in q) add(nflSportItem(today))
            if ("mlb" in q) add(mlbSportItem(tomorrowAt5pm))
            if ("nhl" in q) add(nhlSportItem(nov28))
        }
    }

    private fun nbaSportItem(date: String) = AwesomeBar.SportItem(
        query = "NBA Lakers at Clippers 28 Oct 2025",
        sport = "NBA",
        date = date,
        status = "Final - Over Time",
        statusType = "past",
        homeTeam = AwesomeBar.SportItem.Team(
            key = "LAC",
            name = "Clippers",
            colors = listOf("C8102E", "1D428A", "BEC0C2", "000000"),
            score = 103,
        ),
        awayTeam = AwesomeBar.SportItem.Team(
            key = "LAL",
            name = "Lakers",
            colors = listOf("552583", "FDB927", "000000", "FFFFFF"),
            score = 107,
        ),
    )

    private fun nflSportItem(date: String) = AwesomeBar.SportItem(
        query = "NFL Columbus Blue Jackets at Minnesota Vikings today",
        sport = "NFL",
        date = date,
        status = "In Progress",
        statusType = "live",
        homeTeam = AwesomeBar.SportItem.Team(
            key = "MIN",
            name = "Minnesota Vikings",
            colors = listOf("4F2683", "FFC62F", "FFFFFF", "000000"),
            score = 12,
        ),
        awayTeam = AwesomeBar.SportItem.Team(
            key = "CBJ",
            name = "Columbus Blue Jackets",
            colors = listOf("002654", "CE1126", "A4A9AD", "FFFFFF"),
            score = 14,
        ),
    )

    private fun mlbSportItem(date: String) = AwesomeBar.SportItem(
        query = "MLB Yankees at Diamondbacks tomorrow",
        sport = "MLB",
        date = date,
        status = "Scheduled",
        statusType = "scheduled",
        homeTeam = AwesomeBar.SportItem.Team(
            key = "AZ",
            name = "Diamondbacks",
            colors = listOf("A71930", "30CED8", "000000", "E3D4AD"),
            score = null,
        ),
        awayTeam = AwesomeBar.SportItem.Team(
            key = "NYY",
            name = "Yankees",
            colors = listOf("0C2340", "003087", "E4002C", "C4CED3"),
            score = null,
        ),
    )

    private fun nhlSportItem(date: String) = AwesomeBar.SportItem(
        query = "NHL Lightning at Canucks 28 Nov 24",
        sport = "NHL",
        date = date,
        status = "Not Necessary",
        statusType = "past",
        homeTeam = AwesomeBar.SportItem.Team(
            key = "VAN",
            name = "Canucks",
            colors = listOf("00205B", "00843D", "041C2C", "99999A"),
            score = 0,
        ),
        awayTeam = AwesomeBar.SportItem.Team(
            key = "TBL",
            name = "Lightning",
            colors = listOf("002868", "FFFFFF"),
            score = 1,
        ),
    )
}
