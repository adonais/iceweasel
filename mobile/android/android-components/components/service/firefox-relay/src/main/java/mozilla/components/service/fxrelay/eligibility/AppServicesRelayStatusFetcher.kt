/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxrelay.eligibility

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mozilla.appservices.relay.RelayProfile
import mozilla.components.concept.sync.OAuthAccount
import mozilla.components.service.fxrelay.FxRelay
import mozilla.components.support.base.log.logger.Logger

private const val FREE_MAX_MASKS = 5

/**
 * Fetches Relay subscription status via AppServices for eligibility decisions.
 */
class AppServicesRelayStatusFetcher(
    private val account: OAuthAccount,
) : RelayStatusFetcher {

    private val logger = Logger("AppServicesRelayStatusFetcher")

    override suspend fun fetch(): Result<RelayAccountDetails> = withContext(Dispatchers.IO) {
        runCatching {
            val client = FxRelay(account)

            val profile = client.fetchProfile()
                ?: return@runCatching RelayAccountDetails(RelayPlanTier.NONE, 0)

            mapProfileToDetails(profile)
        }.onFailure {
            logger.warn("Failed to fetch Relay status", it)
        }
    }

    private fun mapProfileToDetails(
        profile: RelayProfile,
    ): RelayAccountDetails {
        val relayPlanTier = when {
            profile.hasPremium || profile.hasMegabundle -> RelayPlanTier.PREMIUM
            else -> RelayPlanTier.FREE
        }

        val remainingMasks = when (relayPlanTier) {
            RelayPlanTier.PREMIUM -> null
            RelayPlanTier.FREE -> FREE_MAX_MASKS
            else -> 0
        }

        return RelayAccountDetails(
            relayPlanTier = relayPlanTier,
            remainingMasksForFreeUsers = remainingMasks,
        )
    }
}
