/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxrelay.eligibility

/**
 * Provides a mechanism to fetch the current Firefox Relay account status.
 */
interface RelayStatusFetcher {
    /**
     * Fetch the latest [RelayAccountDetails] for the current user.
     *
     * @return a [Result] containing [RelayAccountDetails] on success, or a failure
     * if the request could not be completed.
     */
    suspend fun fetch(): Result<RelayAccountDetails>
}

/**
 * Represents the Relay account details for the currently signed-in user.
 *
 * @param relayPlanTier The user’s current Relay plan (e.g., FREE or PREMIUM).
 * @param remainingMasksForFreeUsers The number of remaining free aliases for FREE users.
 */
data class RelayAccountDetails(
    val relayPlanTier: RelayPlanTier,
    val remainingMasksForFreeUsers: Int?,
)
