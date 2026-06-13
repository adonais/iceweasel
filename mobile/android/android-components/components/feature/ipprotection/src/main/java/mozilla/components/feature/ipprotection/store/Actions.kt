/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalAndroidComponentsApi::class)

package mozilla.components.feature.ipprotection.store

import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler
import mozilla.components.concept.engine.ipprotection.ServiceState
import mozilla.components.feature.ipprotection.store.state.AccountStatus
import mozilla.components.feature.ipprotection.store.state.EligibilityStatus
import mozilla.components.lib.state.Action

/**
 * Actions that can be dispatched to [IPProtectionStore].
 */
sealed class IPProtectionAction : Action {
    /**
     * Reports a change in whether the user qualifies for IP Protection.
     */
    data class EligibilityChanged(val eligibility: EligibilityStatus) : IPProtectionAction()

    /**
     * Reports a fresh snapshot from the GeckoView IP protection toolkit.
     */
    data class EngineStateChanged(val info: IPProtectionHandler.StateInfo) : IPProtectionAction()

    /**
     * Reports a change in whether the user is signed in to a Firefox Account.
     */
    data class AccountStateChanged(val state: AccountStatus) : IPProtectionAction()

    /**
     * Turns the IP Protection proxy either on/off - if the service requires an access token,
     * the account auth-flow is instantiated.
     */
    object Toggle : IPProtectionAction()

    /**
     * Reports that the account is ready to be used.
     */
    data class AccountReady(val firstEnrollment: Boolean) : IPProtectionAction()

    /**
     * Reports that the proxy-active status has been shown to the user.
     */
    data object ProxyActiveShown : IPProtectionAction()
}

/**
 * Internal actions that can be dispatched to [IPProtectionStore].
 */
internal sealed class InternalAction : IPProtectionAction() {
    /**
     * Reports a change in whether the user is signed in to a Firefox Account.
     */
    data class AccountManagerStateChanged(val status: AccountStatus) : InternalAction()

    /**
     * Reports when an enrollment has already happened to the IP protection engine.
     */
    data class FirstEnrollmentChanged(val isFirstEnrollment: Boolean) : InternalAction()

    /**
     * Reports a change in whether the user qualifies for IP Protection.
     */
    data class EligibilityChanged(val eligibility: EligibilityStatus) : InternalAction()

    /**
     * Reports a change in new service state that happen from IP Protection.
     */
    data class UpdateServiceState(val serviceState: ServiceState) : InternalAction()
}
