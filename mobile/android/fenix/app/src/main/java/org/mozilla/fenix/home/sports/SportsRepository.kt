/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

/**
 * Data source for sports match data from the World Cup API.
 */
interface SportsRepository {

    /**
     * Fetches the current match card data for the given country codes.
     *
     * @param countryCodes ISO codes of the followed teams, or empty to fetch all matches.
     * @return [Result] containing a list of [MatchCard]s on success, or an exception on failure.
     */
    suspend fun fetchMatches(countryCodes: Set<String>): Result<List<MatchCard>>
}
