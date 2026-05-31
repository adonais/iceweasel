/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.home.sports.api.TeamMatchesResponseDto
import org.mozilla.fenix.home.sports.client.AppServicesWorldCupMatchesClient
import org.mozilla.fenix.home.sports.client.WorldCupMatchesClient

/**
 * [SportsRepository] backed by the Merino WCS endpoint via app-services.
 *
 * Fetches a JSON response from [client], parses it via [MatchesResponseMapper], then
 * shapes the result for the pager via [MatchCardBuilder]:
 * - if [countryCodes] is empty (no team selected), the bucketed previous/current/next
 *   matches are flattened and fed into [MatchCardBuilder.buildForNoTeam];
 * - otherwise, the bucketed response is fed into [MatchCardBuilder.buildForTeam].
 *
 * Any exception during fetch, deserialization, or mapping is captured into a failed
 * [Result] for the middleware to translate into an error state.
 *
 * @param client Fetches raw JSON from the Merino WCS endpoint.
 * @param mapper Converts response DTOs into the [SportsMatch] domain model.
 * @param json [Json] decoder; defaults to one that tolerates unknown keys.
 */
class WorldCupMatchesRepository(
    private val client: WorldCupMatchesClient = AppServicesWorldCupMatchesClient(),
    private val mapper: MatchesResponseMapper = MatchesResponseMapper(),
    private val json: Json = Json { ignoreUnknownKeys = true },
) : SportsRepository {

    private val logger = Logger("WorldCupMatchesRepository")

    override suspend fun fetchMatches(countryCodes: Set<String>): Result<List<MatchCard>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val body = client.fetchMatches(countryCodes)
                    ?: return@runCatching emptyList()
                val response = json.decodeFromString<TeamMatchesResponseDto>(body)
                val result = mapper.mapTeamMatches(response)
                if (countryCodes.isEmpty()) {
                    val all = result.previous + result.current + result.next
                    MatchCardBuilder.buildForNoTeam(all)
                } else {
                    MatchCardBuilder.buildForTeam(result)
                }
            }.onFailure { logger.error("Failed to fetch World Cup matches", it) }
        }
}
