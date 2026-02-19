/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxrelay.eligibility

/**
 * Function for reducing the Relay eligibility state based on the received action.
 *
 * Given a [RelayState] and an [RelayEligibilityAction], returns the next [RelayState].
 */
internal fun relayEligibilityReducer(
    relayState: RelayState,
    action: RelayEligibilityAction,
): RelayState =
    when (action) {
        is RelayEligibilityAction.AccountLoginStatusChanged ->
            relayState.copy(
                eligibilityState = if (action.isLoggedIn) Ineligible.NoRelay else Ineligible.FirefoxAccountNotLoggedIn,
                lastEntitlementCheckMs = NO_ENTITLEMENT_CHECK_YET_MS,
            )

        is RelayEligibilityAction.RelayStatusResult -> {
            val eligibility = when {
                !action.fetchSucceeded -> Ineligible.NoRelay
                action.relayPlanTier == RelayPlanTier.NONE -> Ineligible.NoRelay
                action.relayPlanTier == RelayPlanTier.FREE -> Eligible.Free(action.remaining)
                action.relayPlanTier == RelayPlanTier.PREMIUM -> Eligible.Premium
                else -> return relayState
            }

            relayState.copy(
                eligibilityState = eligibility,
                lastEntitlementCheckMs = action.lastCheckedMs,
            )
        }

        is RelayEligibilityAction.AccountProfileUpdated,
        is RelayEligibilityAction.TtlExpired,
            -> relayState
    }
