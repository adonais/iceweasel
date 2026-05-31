/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports.client

import mozilla.appservices.merino.MerinoWorldCupApiException
import mozilla.appservices.merino.WorldCupClient
import mozilla.appservices.merino.WorldCupConfig
import mozilla.appservices.merino.WorldCupOptions
import mozilla.components.support.base.log.logger.Logger

/**
 * [WorldCupMatchesClient] implementation that delegates to the Application Services
 * [WorldCupClient]. The WCS endpoint does not require OHTTP, so no channel
 * configuration is performed here (unlike Merino suggest).
 *
 * Network and unexpected errors are caught, logged, and surfaced as `null` so the
 * repository layer can treat them uniformly as "no data".
 */
class AppServicesWorldCupMatchesClient(
    private val client: WorldCupClient = WorldCupClient(WorldCupConfig(baseHost = null)),
) : WorldCupMatchesClient {

    private val logger = Logger("AppServicesWorldCupMatchesClient")

    override fun fetchMatches(teams: Set<String>): String? = try {
        client.getMatches(
            options = WorldCupOptions(
                limit = null,
                teams = teams.toList().takeIf { it.isNotEmpty() },
                acceptLanguage = null,
                date = null,
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
