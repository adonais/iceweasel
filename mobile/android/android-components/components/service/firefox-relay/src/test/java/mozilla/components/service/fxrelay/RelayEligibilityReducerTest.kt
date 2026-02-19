/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxrelay

import mozilla.components.service.fxrelay.eligibility.Eligible
import mozilla.components.service.fxrelay.eligibility.Ineligible
import mozilla.components.service.fxrelay.eligibility.NO_ENTITLEMENT_CHECK_YET_MS
import mozilla.components.service.fxrelay.eligibility.RelayEligibilityAction
import mozilla.components.service.fxrelay.eligibility.RelayPlanTier
import mozilla.components.service.fxrelay.eligibility.RelayState
import mozilla.components.service.fxrelay.eligibility.relayEligibilityReducer
import org.junit.Assert.assertEquals
import org.junit.Test

class RelayEligibilityReducerTest {

    @Test
    fun `GIVEN AccountLoginStatusChanged WHEN isLoggedIn is false THEN FirefoxAccountNotLoggedIn and resets lastEntitlementCheckMs`() {
        val initial = RelayState(
            eligibilityState = Ineligible.NoRelay,
            lastEntitlementCheckMs = 123L,
        )

        val result = relayEligibilityReducer(
            initial,
            RelayEligibilityAction.AccountLoginStatusChanged(isLoggedIn = false),
        )

        assertEquals(Ineligible.FirefoxAccountNotLoggedIn, result.eligibilityState)
        assertEquals(NO_ENTITLEMENT_CHECK_YET_MS, result.lastEntitlementCheckMs)
    }

    @Test
    fun `GIVEN AccountLoginStatusChanged WHEN isLoggedIn is true THEN NoRelay and resets lastEntitlementCheckMs`() {
        val initial = RelayState(
            eligibilityState = Ineligible.FirefoxAccountNotLoggedIn,
            lastEntitlementCheckMs = 999L,
        )

        val result = relayEligibilityReducer(
            initial,
            RelayEligibilityAction.AccountLoginStatusChanged(isLoggedIn = true),
        )

        assertEquals(Ineligible.NoRelay, result.eligibilityState)
        assertEquals(NO_ENTITLEMENT_CHECK_YET_MS, result.lastEntitlementCheckMs)
    }

    @Test
    fun `GIVEN RelayStatusResult WHEN fetch fails THEN falls back to NoRelay and updates lastEntitlementCheckMs`() {
        val initial = RelayState(
            eligibilityState = Ineligible.FirefoxAccountNotLoggedIn,
            lastEntitlementCheckMs = 0L,
        )

        val result = relayEligibilityReducer(
            initial,
            RelayEligibilityAction.RelayStatusResult(
                fetchSucceeded = false,
                relayPlanTier = RelayPlanTier.FREE,
                remaining = 10,
                lastCheckedMs = 42L,
            ),
        )

        assertEquals(Ineligible.NoRelay, result.eligibilityState)
        assertEquals(42L, result.lastEntitlementCheckMs)
    }

    @Test
    fun `GIVEN RelayStatusResult WHEN status is NONE THEN maps to NoRelay`() {
        val initial = RelayState(
            eligibilityState = Ineligible.FirefoxAccountNotLoggedIn,
            lastEntitlementCheckMs = 0L,
        )

        val result = relayEligibilityReducer(
            initial,
            RelayEligibilityAction.RelayStatusResult(
                fetchSucceeded = true,
                relayPlanTier = RelayPlanTier.NONE,
                remaining = 5,
                lastCheckedMs = 123L,
            ),
        )

        assertEquals(Ineligible.NoRelay, result.eligibilityState)
        assertEquals(123L, result.lastEntitlementCheckMs)
    }

    @Test
    fun `GIVEN RelayStatusResult WHEN status is FREE THEN maps to Free with remaining masks`() {
        val initial = RelayState(
            eligibilityState = Ineligible.FirefoxAccountNotLoggedIn,
            lastEntitlementCheckMs = 0L,
        )

        val result = relayEligibilityReducer(
            initial,
            RelayEligibilityAction.RelayStatusResult(
                fetchSucceeded = true,
                relayPlanTier = RelayPlanTier.FREE,
                remaining = 3,
                lastCheckedMs = 999L,
            ),
        )

        assertEquals(Eligible.Free(3), result.eligibilityState)
        assertEquals(999L, result.lastEntitlementCheckMs)
    }

    @Test
    fun `GIVEN RelayStatusResult WHEN status is PREMIUM THEN maps to Premium`() {
        val initial = RelayState(
            eligibilityState = Ineligible.FirefoxAccountNotLoggedIn,
            lastEntitlementCheckMs = 0L,
        )

        val result = relayEligibilityReducer(
            initial,
            RelayEligibilityAction.RelayStatusResult(
                fetchSucceeded = true,
                relayPlanTier = RelayPlanTier.PREMIUM,
                remaining = 0,
                lastCheckedMs = 555L,
            ),
        )

        assertEquals(Eligible.Premium, result.eligibilityState)
        assertEquals(555L, result.lastEntitlementCheckMs)
    }

    @Test
    fun `GIVEN RelayStatusResult WHEN relayStatus is null THEN returns same state`() {
        val initial = RelayState(
            eligibilityState = Eligible.Free(3),
            lastEntitlementCheckMs = 123L,
        )

        val result = relayEligibilityReducer(
            initial,
            RelayEligibilityAction.RelayStatusResult(
                fetchSucceeded = true,
                relayPlanTier = null,
                remaining = 99,
                lastCheckedMs = 999L,
            ),
        )
        assertEquals(initial, result)
    }

    @Test
    fun `GIVEN no-op actions WHEN reduced THEN state remains unchanged`() {
        val initial = RelayState(
            eligibilityState = Eligible.Premium,
            lastEntitlementCheckMs = 10L,
        )

        val afterProfileUpdated = relayEligibilityReducer(
            initial,
            RelayEligibilityAction.AccountProfileUpdated,
        )

        val afterTtlExpired = relayEligibilityReducer(
            initial,
            RelayEligibilityAction.TtlExpired(nowMs = 123L),
        )

        assertEquals(initial, afterProfileUpdated)
        assertEquals(initial, afterTtlExpired)
    }
}
