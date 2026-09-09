/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalAndroidComponentsApi::class)

package org.mozilla.fenix.components.ipprotection

import android.os.SystemClock
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.ipprotection.ServiceState
import mozilla.components.feature.ipprotection.store.ActivationOperation
import mozilla.components.feature.ipprotection.store.IPProtectionAction
import mozilla.components.feature.ipprotection.store.state.AccountStatus
import mozilla.components.feature.ipprotection.store.state.Authorized
import mozilla.components.feature.ipprotection.store.state.IPProtectionState
import mozilla.components.feature.ipprotection.store.state.ProxyStatus
import mozilla.components.feature.ipprotection.store.state.Uninitialized
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import org.mozilla.fenix.GleanMetrics.Vpn
import org.mozilla.geckoview.ExperimentalGeckoViewApi
import org.mozilla.geckoview.IPProtectionController.IPProxyException

/**
 * [Middleware] that records telemetry for the FxA authentication and authorization initiated through IP Protection as
 * well as if a network error is encountered when user tries to toggle the VPN.
 *
 * A flow is considered complete when the status leaves [AccountStatus.AwaitingAuthentication] or
 * [AccountStatus.AwaitingAuthorization] for a successful state. The flow duration is measured from when the status
 * first enters the corresponding `Requesting*` state.
 *
 * @param currentTimeInMillis the current time in milliseconds, used to measure how long the corresponding flow takes.
 */
internal class IPProtectionTelemetryMiddleware(
    private val currentTimeInMillis: () -> Long = { SystemClock.elapsedRealtime() }
) : Middleware<IPProtectionState, IPProtectionAction> {

    private var authenticationFlowStartMs: Long? = null
    private var authorizationFlowStartMs: Long? = null

    override fun invoke(
        store: Store<IPProtectionState, IPProtectionAction>,
        next: (IPProtectionAction) -> Unit,
        action: IPProtectionAction,
    ) {
        // The entitled but unauthenticated error state can be only captured before the reducer processes the action.
        // It could happen because the user might start vpn auth before their FXA account is ready. We patched the more
        // prominent case when user is navigating into VPN auth flow from the onboarding card in bug 2057032, but there
        // is nothing stopping them accessing the feature very quickly through the menu or settings, and running into
        // the said problem.
        if (action is IPProtectionAction.ToggleFailed) {
            handleToggleFailedAction(store.state, action.error, action.operation)
        } else if (action is IPProtectionAction.LocationSwitchFailed) {
            handleLocationSwitchFailed(action.error)
        }

        val previousStatus = store.state.accountState.status
        next(action)
        val currentStatus = store.state.accountState.status

        if (previousStatus == currentStatus) {
            return
        }

        when (currentStatus) {
            AccountStatus.RequestingAuthentication -> {
                authenticationFlowStartMs = currentTimeInMillis()
            }

            AccountStatus.RequestingAuthorization -> {
                authorizationFlowStartMs = currentTimeInMillis()
            }

            AccountStatus.Uninitialized,
            AccountStatus.NoAccount,
            AccountStatus.WarmingUp,
            AccountStatus.NeedsAuthentication,
            AccountStatus.NeedsAuthorization,
            AccountStatus.AwaitingAuthentication,
            AccountStatus.AwaitingAuthorization,
            AccountStatus.AwaitingEnrollment,
            AccountStatus.AuthFailed,
            AccountStatus.Authenticated,
            AccountStatus.EnrolledAndEntitled,
            AccountStatus.TryAgain -> {
                // no-op
            }
        }

        if (currentStatus !in COMPLETED_STATUSES) {
            return
        }

        when (previousStatus) {
            AccountStatus.AwaitingAuthentication -> {
                Vpn.fxAccountFlowCompleted.record(
                    Vpn.FxAccountFlowCompletedExtra(durationMs = durationSince(authenticationFlowStartMs))
                )
                authenticationFlowStartMs = null
            }

            AccountStatus.AwaitingAuthorization -> {
                Vpn.fxAuthorizationFlowCompleted.record(
                    Vpn.FxAuthorizationFlowCompletedExtra(durationMs = durationSince(authorizationFlowStartMs))
                )
                authorizationFlowStartMs = null
            }

            AccountStatus.Uninitialized,
            AccountStatus.NoAccount,
            AccountStatus.WarmingUp,
            AccountStatus.NeedsAuthentication,
            AccountStatus.RequestingAuthentication,
            AccountStatus.NeedsAuthorization,
            AccountStatus.RequestingAuthorization,
            AccountStatus.AwaitingEnrollment,
            AccountStatus.AuthFailed,
            AccountStatus.Authenticated,
            AccountStatus.EnrolledAndEntitled,
            AccountStatus.TryAgain -> {
                // no-op
            }
        }
    }

    private fun handleToggleFailedAction(
        state: IPProtectionState,
        error: Throwable?,
        operation: ActivationOperation,
    ) {
        if (
            state.accountState.status == AccountStatus.EnrolledAndEntitled &&
                state.serviceStatus == ServiceState.Unauthenticated
        ) {
            Vpn.entitledAccountUnauthenticated.record()
        }
        Vpn.errorEncountered.record(
            Vpn.ErrorEncounteredExtra(
                errorCode = errorCodeOf(error),
                operation = operation.label,
                serviceState = state.serviceStatus.label,
                proxyState = state.proxyStatus.label,
                accountState = state.accountState.status.label,
            )
        )
    }

    private fun handleLocationSwitchFailed(error: Throwable?) {
        Vpn.locationSwitchError.record(extra = Vpn.LocationSwitchErrorExtra(errorCode = errorCodeOf(error)))
    }

    // FIXME(IPP) the engine should pass the error code through: https://bugzilla.mozilla.org/show_bug.cgi?id=2066553
    @androidx.annotation.OptIn(ExperimentalGeckoViewApi::class)
    private fun errorCodeOf(error: Throwable?): String = "${(error as? IPProxyException)?.code}"

    private fun durationSince(startMs: Long?): Int? = startMs?.let { (currentTimeInMillis() - it).toInt() }

    private companion object {
        // [AccountStatus.AwaitingEnrollment] is set the moment FxA auth
        // succeeds, so it is considered a completed status.
        // [AccountStatus.EnrolledAndEntitled] is deliberately excluded since it is a VPN only state
        // reached after VPN enrollment, beyond the FxA auth time that we are interested in.
        val COMPLETED_STATUSES =
            setOf(
                AccountStatus.Authenticated,
                AccountStatus.AwaitingEnrollment,
            )
    }
}

// Written out rather than taken from enum names, so a rename cannot silently change the recorded
// data. Each `when` is exhaustive: a new state is a compile error, not an unlabelled value.
private val ActivationOperation.label: String
    get() =
        when (this) {
            ActivationOperation.Activate -> "activate"
            ActivationOperation.Deactivate -> "deactivate"
        }

private val ServiceState.label: String
    get() =
        when (this) {
            ServiceState.Uninitialized -> "uninitialized"
            ServiceState.Unavailable -> "unavailable"
            ServiceState.Unauthenticated -> "unauthenticated"
            ServiceState.OptedOut -> "opted_out"
            ServiceState.Ready -> "ready"
        }

private val ProxyStatus.label: String
    get() =
        when (this) {
            Uninitialized -> "uninitialized"
            Authorized.Idle -> "idle"
            Authorized.Activating -> "activating"
            Authorized.Active -> "active"
            Authorized.DataLimitReached -> "data_limit_reached"
            Authorized.ConnectionError -> "connection_error"
        }

private val AccountStatus.label: String
    get() =
        when (this) {
            AccountStatus.Uninitialized -> "uninitialized"
            AccountStatus.WarmingUp -> "warming_up"
            AccountStatus.NoAccount -> "no_account"
            AccountStatus.NeedsAuthentication -> "needs_authentication"
            AccountStatus.RequestingAuthentication -> "requesting_authentication"
            AccountStatus.NeedsAuthorization -> "needs_authorization"
            AccountStatus.RequestingAuthorization -> "requesting_authorization"
            AccountStatus.AwaitingAuthentication -> "awaiting_authentication"
            AccountStatus.AwaitingAuthorization -> "awaiting_authorization"
            AccountStatus.AwaitingEnrollment -> "awaiting_enrollment"
            AccountStatus.AuthFailed -> "auth_failed"
            AccountStatus.Authenticated -> "authenticated"
            AccountStatus.EnrolledAndEntitled -> "enrolled_and_entitled"
            AccountStatus.TryAgain -> "try_again"
        }
