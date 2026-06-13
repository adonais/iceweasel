/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalAndroidComponentsApi::class)

package mozilla.components.feature.ipprotection.store

import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler
import mozilla.components.concept.engine.ipprotection.ServiceState
import mozilla.components.feature.ipprotection.store.state.AccountStatus
import mozilla.components.feature.ipprotection.store.state.Authorized
import mozilla.components.feature.ipprotection.store.state.IPProtectionState
import mozilla.components.feature.ipprotection.store.state.ProxyStatus
import mozilla.components.feature.ipprotection.store.state.Uninitialized

@Suppress("CognitiveComplexMethod", "LongMethod", "ForbiddenSuppress")
// FIXME(IPP) break this up into more smaller parts only if the changes are meaningful.
internal fun iPProtectionReducer(
    state: IPProtectionState,
    action: IPProtectionAction,
): IPProtectionState = when (action) {
    is IPProtectionAction.EligibilityChanged -> {
        state.copy(eligibilityStatus = action.eligibility)
    }

    is IPProtectionAction.EngineStateChanged -> {
        // Reset any state that can reflect incorrect capabilities (today, that is only "activate").
        val newActivate = when (action.info.serviceState) {
            ServiceState.Uninitialized,
                -> {
                null
            }

            ServiceState.Unavailable,
            ServiceState.Unauthenticated,
            ServiceState.OptedOut,
                -> {
                false
            }

            ServiceState.Ready,
                -> {
                state.activate
            }
        }

        // We can short-circuit the account-state if the service is ready.
        val newAccountStatus = if (action.info.serviceState == ServiceState.Ready) {
            AccountStatus.Ready
        } else {
            state.accountState.status
        }

        val newProxyStatus = action.info.asProxyStatus()
        // We reset the shown status when it has been shown AND
        // the status is no longer Active or Activating.
        val newProxyActiveShown = if (state.proxyActiveShown) {
            newProxyStatus == Authorized.Active || newProxyStatus == Authorized.Activating
        } else {
            false
        }

        state.copy(
            remainingDataBytes = action.info.remaining,
            maxDataBytes = action.info.max,
            resetDate = action.info.resetTime,
            proxyStatus = newProxyStatus,
            serviceStatus = action.info.serviceState,
            accountState = state.accountState.copy(
                status = newAccountStatus,
            ),
            proxyActiveShown = newProxyActiveShown,
            activate = newActivate,
        )
    }

    is IPProtectionAction.AccountStateChanged -> {
        state
    }

    is IPProtectionAction.AccountReady -> {
        state.copy(
            accountState = state.accountState.copy(
                status = AccountStatus.Ready,
                isFirstEnrollment = action.firstEnrollment,
            ),
        )
    }

    is IPProtectionAction.Toggle -> {
        when (state.serviceStatus) {
            ServiceState.OptedOut,
            ServiceState.Unavailable,
            ServiceState.Uninitialized,
                -> {
                return state
            }

            ServiceState.Ready -> {
                return when (state.proxyStatus) {
                    Authorized.Idle -> {
                        state.copy(activate = true)
                    }

                    Authorized.Active -> {
                        state.copy(activate = false)
                    }

                    Authorized.Activating,
                    Authorized.DataLimitReached,
                    Authorized.ConnectionError,
                    Uninitialized,
                        -> state
                }
            }

            ServiceState.Unauthenticated -> {
                val status = state.accountState.status

                // We need to authenticate first because we haven't done so before or
                // our account is in a wonky state.
                if (status == AccountStatus.NeedsAuthentication ||
                    status == AccountStatus.Uninitialized
                ) {
                    return state.copy(
                        accountState = state.accountState.copy(
                            status = AccountStatus.RequestingAuthentication,
                        ),
                    )
                }

                // We have an account in good standing, but we haven't enrolled the service before,
                // so we need to authorize the service first to get the account ready to request
                // enrollment keys.
                if (status == AccountStatus.NeedsAuthorization) {
                    return state.copy(
                        accountState = state.accountState.copy(
                            status = AccountStatus.RequestingAuthorization,
                        ),
                    )
                }

                if (status == AccountStatus.Ready) {
                    return state.copy(
                        accountState = state.accountState.copy(
                            status = AccountStatus.TryAgain,
                        ),
                    )
                }
            }
        }

        state
    }

    is IPProtectionAction.ProxyActiveShown -> {
        state.copy(proxyActiveShown = true)
    }

    is InternalAction -> internalReducer(state, action)
}

internal fun internalReducer(
    state: IPProtectionState,
    action: InternalAction,
): IPProtectionState = when (action) {
    is InternalAction.AccountManagerStateChanged -> {
        // Only the AccountManager should only change the states that put the
        // account into a "ready-to-use" state. The remaining are part of
        // AccountStatus that represents the combined requirements for the
        // account and the IP protection service, and those are moved into
        // from other parts of the system.
        //
        // To avoid potential conflicts, we limit which states this action
        // can perform.
        when (action.status) {
            AccountStatus.RequestingAuthentication,
            AccountStatus.RequestingAuthorization,
            AccountStatus.TryAgain,
                -> state

            AccountStatus.Ready,
            AccountStatus.Uninitialized,
            AccountStatus.WarmingUp,
            AccountStatus.NeedsAuthentication,
            AccountStatus.NeedsAuthorization,
                -> {
                state.copy(
                    accountState = state.accountState.copy(status = action.status),
                )
            }

            // FIXME(IPP) the loop here if we try to exit an incomplete auth.
            //  When an auth flow failed, we go back to the state we came from.
            AccountStatus.AuthFailed -> {
                state
            }
        }
    }

    is InternalAction.EligibilityChanged -> state.copy(
        eligibilityStatus = action.eligibility,
    )

    is InternalAction.FirstEnrollmentChanged -> state.copy(
        accountState = state.accountState.copy(
            isFirstEnrollment = action.isFirstEnrollment,
        ),
    )

    is InternalAction.UpdateServiceState -> state.copy(
        serviceStatus = action.serviceState,
    )
}

private fun IPProtectionHandler.StateInfo.asProxyStatus(): ProxyStatus {
    return when (proxyState) {
        IPProtectionHandler.StateInfo.PROXY_STATE_READY -> Authorized.Idle
        IPProtectionHandler.StateInfo.PROXY_STATE_ACTIVATING -> Authorized.Activating
        IPProtectionHandler.StateInfo.PROXY_STATE_ACTIVE -> Authorized.Active
        IPProtectionHandler.StateInfo.PROXY_STATE_PAUSED -> Authorized.DataLimitReached
        IPProtectionHandler.StateInfo.PROXY_STATE_ERROR -> Authorized.ConnectionError
        else -> Uninitialized
    }
}
