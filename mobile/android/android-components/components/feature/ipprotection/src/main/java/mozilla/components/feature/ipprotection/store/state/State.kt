/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalAndroidComponentsApi::class)

package mozilla.components.feature.ipprotection.store.state

import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.ipprotection.ServiceState
import mozilla.components.lib.state.State

const val BYTES_PER_GB = 1024 * 1024 * 1024f

/**
 * State stored by the feature to drive UI and decisions.
 *
 * @property eligibilityStatus Whether the device is eligible of using the service.
 * @property proxyStatus The proxy state.
 * @property serviceStatus The state of the IPProtection service.
 * @property remainingDataBytes Remaining monthly data allowance in bytes, or -1 if unavailable.
 * @property maxDataBytes Maximum monthly data allowance in bytes, or -1 if unavailable.
 * @property resetDate ISO 8601 string for when the monthly allowance resets, or null if unavailable.
 * @property accountState The state of the authenticator being used.
 * @property proxyActiveShown Whether the proxy-active status has been shown to the user.
 * @property activate To turn protection on or off.
 */
data class IPProtectionState(
    val eligibilityStatus: EligibilityStatus = EligibilityStatus.Unknown,
    val proxyStatus: ProxyStatus = Uninitialized,
    val serviceStatus: ServiceState = ServiceState.Uninitialized,
    val remainingDataBytes: Long = -1L,
    val maxDataBytes: Long = -1L,
    val resetDate: String? = null,
    val accountState: AccountState = AccountState(),
    val proxyActiveShown: Boolean = false,
    val activate: Boolean? = null,
) : State

/**
 * Convenience function for eligibility.
 */
val IPProtectionState.isEligible
    get() = eligibilityStatus == EligibilityStatus.Eligible

val IPProtectionState.remainingDataGb: Float
    get() = remainingDataBytes / BYTES_PER_GB

val IPProtectionState.maxDataGb: Float
    get() = maxDataBytes / BYTES_PER_GB

val IPProtectionState.usedDataGb: Float
    get() = maxDataGb - remainingDataGb

/**
 * The combined state of an FxA account pertinent to IP Protection.
 *
 * @property isFirstEnrollment Whether the user needs to author their account first.
 * @property status The state of the authenticator being used.
 */
data class AccountState(
    val isFirstEnrollment: Boolean = false,
    val status: AccountStatus = AccountStatus.Uninitialized,
)

/**
 * Represents the lifecycle of the FxA account as it pertains to the IP protection service.
 * States progress roughly as: [Uninitialized] → [WarmingUp] → [NeedsAuthentication] or
 * [NeedsAuthorization] → [RequestingAuthentication] or [RequestingAuthorization] → [Ready].
 */
enum class AccountStatus {
    /**
     * Unknown account state.
     */
    Uninitialized,

    /**
     * First warmup to see if we need to authenticate or authorize.
     */
    WarmingUp,

    /**
     * Account is in a bad state.
     */
    NeedsAuthentication,

    /**
     * Start Authenticating.
     */
    RequestingAuthentication,

    /**
     * Account was in a good state, but authorization is needed.
     */
    NeedsAuthorization,

    /**
     * Start authorization.
     */
    RequestingAuthorization,

    /**
     * An auth flow was exited abruptly.
     */
    AuthFailed,

    /**
     * The service should be notified the account is ready.
     */
    Ready,

    /**
     * An experimental API that tries to re-notify the IP Protection
     * internals to try to fetch the access token again.
     */
    TryAgain,
}
