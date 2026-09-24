/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalAndroidComponentsApi::class)

package mozilla.components.feature.ipprotection

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mozilla.appservices.fxaclient.FxaException
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.ipprotection.IPProtectionDelegate
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler
import mozilla.components.concept.engine.ipprotection.ServiceState
import mozilla.components.feature.ipprotection.IPProtectionFxaAuthFlow.Companion.SCOPE_IPPROTECTION
import mozilla.components.feature.ipprotection.auth.IPProtectionAuthProvider
import mozilla.components.feature.ipprotection.store.ActivationOperation
import mozilla.components.feature.ipprotection.store.IPProtectionAction
import mozilla.components.feature.ipprotection.store.IPProtectionStore
import mozilla.components.feature.ipprotection.store.InternalAction
import mozilla.components.feature.ipprotection.store.state.AccountStatus
import mozilla.components.feature.ipprotection.store.state.EligibilityStatus
import mozilla.components.feature.ipprotection.store.state.LocationListUpdateState
import mozilla.components.feature.ipprotection.store.state.PendingActivationRequest
import mozilla.components.lib.state.ext.flow
import mozilla.components.lib.state.ext.flowScoped
import mozilla.components.service.fxa.manager.FxaAccountManager
import mozilla.components.service.fxa.manager.SCOPE_PROFILE
import mozilla.components.support.base.log.logger.Logger

/**
 * Feature that coordinates the IP protection proxy service. It observes [IPProtectionStore] for eligibility and account
 * state changes, registers with the [Engine] and forwards activate/deactivate requests back to the [Engine].
 *
 * See [IPProtectionFxaAuthFlow] and [IPProtectionStorageSynchronizer] helpers that complement this feature.
 *
 * Call [initialize] once at startup to begin observing. The feature manages its own lifecycle internally and does not
 * need to be stopped.
 *
 * @param store [IPProtectionStore] that holds the feature state.
 * @param engine [Engine] used to register the IP protection delegate and obtain the handler.
 * @param accountManager [FxaAccountManager] used to supply FxA tokens to the proxy service.
 * @param extraAuthProvider Optional [IPProtectionAuthProvider] used to compose extra capabilities.
 * @param mainDispatcher [CoroutineDispatcher] on which state observations and engine calls run.
 */
class IPProtectionFeature(
    private val store: IPProtectionStore,
    private val engine: Engine,
    private val accountManager: FxaAccountManager,
    private val extraAuthProvider: IPProtectionAuthProvider? = null,
    private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
) {
    private val logger = Logger("IPP:Feature")
    private val mainScope = CoroutineScope(mainDispatcher)
    private var handler: IPProtectionHandler? = null

    /** Starts observing eligibility and account state. Must be called once at application startup. */
    fun initialize() {
        mainScope.launch {
            observeEligibilityAndService(store, mainDispatcher)
        }
        mainScope.launch {
            observeAccount(store, mainDispatcher)
        }
        mainScope.launch {
            observeLocationUpdates(store, mainDispatcher)
        }
    }

    private fun observeEligibilityAndService(
        store: IPProtectionStore,
        mainDispatcher: CoroutineDispatcher,
    ) {
        store.flowScoped(dispatcher = mainDispatcher) { flow ->
            flow
                .map { Triple(it.eligibilityStatus, it.serviceStatus, it.accountState.status) }
                .distinctUntilChanged()
                // We use `collectLatest` only because of the nested `observeToggle` that
                // should be canceled on new observation.
                .collectLatest { (eligibilityStatus, serviceStatus, accountStatus) ->
                    when (eligibilityStatus) {
                        EligibilityStatus.Eligible -> {
                            if (serviceStatus == ServiceState.Uninitialized) {
                                logger.info("Registering and initializing with IPProtectionController.")
                                registerAndInit()
                            }

                            // When the app starts with an already signed-in user, the account state
                            // is likely to be ready faster than the service, so we should notify
                            // a ready account state after initializing the handler.
                            if (
                                serviceStatus == ServiceState.Unauthenticated &&
                                    accountStatus == AccountStatus.Authenticated
                            ) {
                                handler?.notifyAccountStatus(true)
                            }
                            observeToggle()
                        }

                        EligibilityStatus.Ineligible,
                        EligibilityStatus.UnsupportedRegion -> {
                            uninit()
                        }

                        EligibilityStatus.Unknown -> {
                            // no-op, initializing
                        }
                    }
                }
        }
    }

    private fun observeAccount(store: IPProtectionStore, mainDispatcher: CoroutineDispatcher) {
        store.flowScoped(dispatcher = mainDispatcher) { flow ->
            flow
                .distinctUntilChangedBy { it.accountState.status }
                .collect { state ->
                    when (state.accountState.status) {
                        AccountStatus.AuthFailed,
                        AccountStatus.NoAccount -> {
                            handler?.notifyAccountStatus(false)
                        }

                        AccountStatus.Authenticated -> {
                            handler?.notifyAccountStatus(true)
                        }

                        AccountStatus.AwaitingEnrollment -> {
                            handler?.notifyAccountStatus(true)
                            handler?.enroll { enrollInfo ->
                                store.dispatch(
                                    InternalAction.FinishingEnrollment(success = enrollInfo.isEnrolledAndEntitled)
                                )
                            }
                        }

                        AccountStatus.TryAgain -> {
                            handler?.notifyAccountStatus(true)
                        }

                        AccountStatus.Uninitialized,
                        AccountStatus.WarmingUp,
                        AccountStatus.NeedsAuthentication,
                        AccountStatus.RequestingAuthentication,
                        AccountStatus.NeedsAuthorization,
                        AccountStatus.RequestingAuthorization,
                        AccountStatus.AwaitingAuthentication,
                        AccountStatus.AwaitingAuthorization,
                        AccountStatus.EnrolledAndEntitled -> {
                            // no-op when we are in transient states.
                        }
                    }
                }
        }
    }

    private fun observeLocationUpdates(store: IPProtectionStore, mainDispatcher: CoroutineDispatcher) {
        store.flowScoped(dispatcher = mainDispatcher) { flow ->
            flow
                .map { it.serviceStatus to it.locationState.updateState }
                .distinctUntilChanged()
                .filter { (service, update) ->
                    service == ServiceState.Ready && update == LocationListUpdateState.Requested
                }
                .collect {
                    handler?.updateCountryList { error ->
                        if (error != null) {
                            store.dispatch(IPProtectionAction.LocationUpdateFailed(error))
                        }
                    }
                }
        }
    }

    private suspend fun registerAndInit() =
        withContext(mainDispatcher) {
            handler =
                engine.registerIPProtectionDelegate(
                    object : IPProtectionDelegate {
                        override fun onStateChanged(info: IPProtectionHandler.StateInfo) {
                            store.dispatch(IPProtectionAction.EngineStateChanged(info))
                        }

                        override fun onCountryListChanged(countries: List<IPProtectionHandler.Country>) {
                            store.dispatch(IPProtectionAction.CountryListChanged(countries))
                        }
                    }
                )
            handler?.run {
                setAuthProvider(
                    object : IPProtectionHandler.AuthProvider {
                        override fun getToken(onComplete: (String?) -> Unit) {
                            mainScope.launch {
                                try {
                                    val tokenInfo =
                                        accountManager
                                            .authenticatedAccount()
                                            ?.getAccessToken("$SCOPE_PROFILE $SCOPE_IPPROTECTION")
                                    onComplete(tokenInfo?.token)
                                } catch (e: FxaException.Forbidden) {
                                    logger.error(
                                        "We don't have a scope that gives us an token. Moving to needs authorization.",
                                        e,
                                    )
                                    store.dispatch(
                                        IPProtectionAction.AccountStateChanged(AccountStatus.NeedsAuthorization)
                                    )
                                    onComplete(null)
                                }
                            }
                        }
                    }
                )
                extraAuthProvider?.configure(this, mainScope)
                // Initialization needs to be done ASAP whether we are using the service or not to avoid start-up
                // delays.
                // We do need to register our listeners first to avoid dropping a message because,
                // as a side effect, the init call triggers `IPProtectionController#onServiceStateChanged`
                // that can trigger the account manager that leads to `AuthProvider#getToken`.
                init()
            }
        }

    private suspend fun uninit() =
        withContext(mainDispatcher) {
            handler?.uninit()
        }

    private suspend fun observeToggle() =
        withContext(mainDispatcher) {
            // Dedupe over the nullable so `true -> null -> true` reads as two edges, not one.
            store
                .flow()
                .map { it.pendingActivationRequest }
                .distinctUntilChanged()
                .filterNotNull()
                .collect { activationState ->
                    when (activationState) {
                        is PendingActivationRequest.Activate -> {
                            handler?.activate(
                                countryCode = activationState.selectedLocationCode,
                                onResult = { err -> handleActivationResult(activationState, err) },
                            )
                        }
                        is PendingActivationRequest.Deactivate -> {
                            handler?.deactivate { err -> handleActivationResult(activationState, err) }
                        }
                    }
                }
        }

    // A pending request is normally cleared when the engine reports the new proxy state. Changing country while
    // the VPN is on does not change that state, so no report arrives and nothing else would clear it.
    private fun handleActivationResult(request: PendingActivationRequest, error: Throwable?) {
        when (request) {
            is PendingActivationRequest.Activate -> {
                when {
                    error == null -> store.dispatch(IPProtectionAction.ActivationRequestCompleted(request))
                    request.isLocationSwitch -> store.dispatch(IPProtectionAction.LocationSwitchFailed(error))
                    else -> store.dispatch(IPProtectionAction.ToggleFailed(ActivationOperation.Activate, error))
                }
            }
            is PendingActivationRequest.Deactivate -> {
                if (error != null) {
                    store.dispatch(IPProtectionAction.ToggleFailed(ActivationOperation.Deactivate, error))
                }
            }
        }
    }
}
