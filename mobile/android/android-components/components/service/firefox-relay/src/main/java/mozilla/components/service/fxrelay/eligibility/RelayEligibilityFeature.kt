/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxrelay.eligibility

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import mozilla.components.concept.sync.AccountObserver
import mozilla.components.concept.sync.AuthType
import mozilla.components.concept.sync.OAuthAccount
import mozilla.components.concept.sync.Profile
import mozilla.components.lib.state.ext.flowScoped
import mozilla.components.service.fxa.manager.FxaAccountManager
import mozilla.components.support.base.feature.LifecycleAwareFeature
import mozilla.components.support.ktx.kotlinx.coroutines.flow.ifAnyChanged

private const val FETCH_TIMEOUT_MS: Long = 300_000L

/**
 * Coordinates when and how Relay eligibility is (re)evaluated.
 */
class RelayEligibilityFeature(
    private val accountManager: FxaAccountManager,
    private val store: RelayEligibilityStore,
    private val relayStatusFetcher: RelayStatusFetcher,
    private val fetchTimeoutMs: Long = FETCH_TIMEOUT_MS,
) : LifecycleAwareFeature {

    private var scope: CoroutineScope? = null
    private val accountObserver = RelayAccountObserver()

    override fun start() {
        accountManager.register(accountObserver)

        val isLoggedIn = accountManager.authenticatedAccount() != null
        store.dispatch(RelayEligibilityAction.AccountLoginStatusChanged(isLoggedIn))

        scope = store.flowScoped { flow ->
            flow
                .ifAnyChanged { arrayOf(it.eligibilityState, it.lastEntitlementCheckMs) }
                .collect { state ->
                    checkRelayStatus(state)
                }
        }
    }

    override fun stop() {
        accountManager.unregister(accountObserver)
        scope?.cancel().also { scope = null }
    }

    private suspend fun checkRelayStatus(state: RelayState) {
        val loggedIn = state.eligibilityState !is Ineligible.FirefoxAccountNotLoggedIn
        val lastCheck = state.lastEntitlementCheckMs
        val now = System.currentTimeMillis()
        val ttlExpired = lastCheck == NO_ENTITLEMENT_CHECK_YET_MS || now - lastCheck >= fetchTimeoutMs

        if (loggedIn && ttlExpired) {
            val relayStatus = relayStatusFetcher.fetch()
            val relayStatusResult = relayStatus.getOrNull()

            store.dispatch(
                RelayEligibilityAction.RelayStatusResult(
                    fetchSucceeded = relayStatus.isSuccess,
                    relayPlanTier = relayStatusResult?.relayPlanTier,
                    remaining = relayStatusResult?.remainingMasksForFreeUsers ?: 0,
                    lastCheckedMs = System.currentTimeMillis(),
                ),
            )
        }
    }

    private inner class RelayAccountObserver : AccountObserver {
        override fun onAuthenticated(account: OAuthAccount, authType: AuthType) {
            store.dispatch(RelayEligibilityAction.AccountLoginStatusChanged(true))
        }

        override fun onProfileUpdated(profile: Profile) {
            store.dispatch(RelayEligibilityAction.AccountProfileUpdated)
        }

        override fun onLoggedOut() {
            store.dispatch(RelayEligibilityAction.AccountLoginStatusChanged(false))
        }
    }
}
