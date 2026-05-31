/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.client

import androidx.annotation.VisibleForTesting
import mozilla.appservices.merino.MerinoWorldCupApiException
import mozilla.appservices.merino.WorldCupClient
import mozilla.appservices.merino.WorldCupConfig
import mozilla.appservices.merino.WorldCupOptions
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.home.sports.WORLD_CUP_KICKOFF
import java.time.LocalDate

/**
 * Picks the `date` value sent to the Merino WCS endpoint, which returns matches within
 * ±10 days of the requested date. Before kickoff we pin to the kickoff date so the first
 * batch of fixtures is in range; once the tournament is underway we use [today].
 *
 * Returned in ISO-8601 `yyyy-MM-dd` (the format the API expects), via [LocalDate.toString].
 */
@VisibleForTesting
internal fun apiRequestDate(today: LocalDate): String {
    val target = if (today.isBefore(WORLD_CUP_KICKOFF)) WORLD_CUP_KICKOFF else today
    return target.toString()
}

/**
 * [WorldCupMatchesClient] implementation that delegates to the Application Services
 * [WorldCupClient]. The WCS endpoint does not require OHTTP, so no channel
 * configuration is performed here (unlike Merino suggest).
 *
 * The endpoint returns matches within ±10 days of the requested `date`. Before
 * the tournament starts we pin the request to the kickoff date so the first
 * batch of fixtures is in range; once the tournament is underway we let the
 * device's "today" drive the window.
 *
 * Network and unexpected errors are caught, logged, and surfaced as `null` so the
 * repository layer can treat them uniformly as "no data".
 *
 * @param client The app-services [WorldCupClient] used for the network call.
 * @param clock Source of the current local date; defaults to [LocalDate.now].
 * Injected for testability of the pre-/in-tournament date selection.
 */
class AppServicesWorldCupMatchesClient(
    private val client: WorldCupClient = WorldCupClient(WorldCupConfig(baseHost = null)),
    private val clock: () -> LocalDate = LocalDate::now,
) : WorldCupMatchesClient {

    private val logger = Logger("AppServicesWorldCupMatchesClient")

    override fun fetchMatches(teams: Set<String>): String? = try {
        client.getMatches(
            options = WorldCupOptions(
                limit = null,
                teams = teams.toList().takeIf { it.isNotEmpty() },
                acceptLanguage = null,
                date = apiRequestDate(clock()),
            ),
        )
    } catch (e: MerinoWorldCupApiException) {
        when (e) {
            is MerinoWorldCupApiException.Network ->
                logger.error(message = "$NETWORK_ERROR_MESSAGE - ${e.message}")
            is MerinoWorldCupApiException.Other ->
                logger.error(message = "$UNEXPECTED_ERROR_MESSAGE - ${e.message}")
        }
        null
    }

    companion object {
        private const val NETWORK_ERROR_MESSAGE = "Network error when fetching World Cup matches"
        private const val UNEXPECTED_ERROR_MESSAGE = "Unexpected error when fetching World Cup matches"
    }
}
